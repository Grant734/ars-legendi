import re
import json
from pathlib import Path
from typing import List, Dict, Tuple

import pdfplumber  # type: ignore

# ---------------------------
# Paths (adjust if needed)
# ---------------------------
PDF_PATH = Path("server/data/caesar/dbg1_translation.pdf")   # your English translation PDF
LATIN_UD_PATH = Path("server/data/caesar/dbg1_ud.json")      # stanza UD output with chapters + sids
OUT_PATH = Path("server/data/caesar/dbg1_translations.json")
REVIEW_PATH = Path("server/data/caesar/dbg1_translation_review.txt")

# ---------------------------
# Regex + cleaning
# ---------------------------

CHAPTER_START = re.compile(r"^\s*(\d{1,2})\s+(.*\S)\s*$")  # lines that begin a new chapter: "7 Caesar ..."
WS = re.compile(r"\s+")

# sentence split: (. ? !) followed by whitespace then a likely sentence start
SENT_BOUNDARY = re.compile(r"(?<=[\.\?\!])\s+(?=[A-Z\"“‘\(\[])")

# common abbreviation protection
ABBREV = [
    "Mr.", "Mrs.", "Ms.", "Dr.", "St.", "e.g.", "i.e.", "etc.",
]

def clean_spaces(s: str) -> str:
    s = s.replace("\u00ad", "")      # soft hyphen
    s = s.replace("\u200b", "")      # zero-width
    s = s.replace("\ufeff", "")      # BOM
    s = s.replace("\n", " ")
    s = WS.sub(" ", s).strip()
    return s

def clean_english(s: str) -> str:
    """
    Keep it conservative. We DO NOT want to destroy punctuation that helps sentence splitting.
    We remove obvious PDF artifacts like "p33" (page markers) if they exist.
    """
    s = clean_spaces(s)
    # remove page markers like "p33" or "p 33" if present
    s = re.sub(r"\bp\s*\d+\b", "", s, flags=re.IGNORECASE)
    s = clean_spaces(s)
    return s

def clean_latin(s: str) -> str:
    """
    For alignment length/anchors we just normalize whitespace.
    Keep commas/semicolons because they correlate with translation length.
    """
    return clean_spaces(s)

def extract_pdf_lines(pdf_path: Path) -> List[str]:
    lines: List[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            for ln in txt.splitlines():
                lines.append(ln.rstrip())
    return lines

def extract_translation_by_chapter(lines: List[str]) -> Dict[int, str]:
    """
    Splits translation PDF into chapter blocks by detecting lines starting with "1..54 ...".
    Keeps everything in between as chapter text.
    """
    chapters: Dict[int, List[str]] = {}
    cur = None

    def start_ch(ch: int, rest: str):
        nonlocal cur
        cur = ch
        chapters.setdefault(ch, [])
        chapters[ch].append(rest)

    for ln in lines:
        m = CHAPTER_START.match(ln)
        if m:
            ch = int(m.group(1))
            rest = m.group(2)
            if 1 <= ch <= 54:
                start_ch(ch, rest)
                continue
        if cur is not None:
            chapters[cur].append(ln)

    out: Dict[int, str] = {}
    for ch, parts in chapters.items():
        out[ch] = clean_english(" ".join(parts))
    return out

def load_latin_by_chapter() -> Dict[int, List[dict]]:
    latin = json.loads(LATIN_UD_PATH.read_text(encoding="utf-8"))
    if "chapters" not in latin or not isinstance(latin["chapters"], dict):
        raise KeyError(f"Expected top-level key 'chapters' in {LATIN_UD_PATH}")
    by_ch: Dict[int, List[dict]] = {}
    for ch_str, arr in latin["chapters"].items():
        ch = int(ch_str)
        by_ch[ch] = arr if isinstance(arr, list) else []
    return by_ch

def sentence_split_english_block(ch_text: str) -> List[str]:
    """
    Split English into sentences using punctuation boundaries.
    We protect abbreviations first, then split, then restore.
    """
    protected = ch_text
    for a in ABBREV:
        protected = protected.replace(a, a.replace(".", "§"))

    parts = re.split(SENT_BOUNDARY, protected)
    out: List[str] = []
    for p in parts:
        p = p.replace("§", ".")
        p = clean_english(p)
        if p:
            out.append(p)
    return out

def latin_anchor_tokens(lat: str) -> List[str]:
    """
    Very light anchors to help greedy decisions.
    We only use this as a *soft* tie-breaker, not as a hard rule.
    """
    # pick capital-ish tokens and some longer content words
    words = re.findall(r"[A-Za-z]+", lat)
    anchors: List[str] = []
    for w in words:
        if len(w) >= 7:
            anchors.append(w.lower())
        elif w[:1].isupper() and len(w) >= 4:
            anchors.append(w.lower())
    # keep unique, preserve order
    seen = set()
    uniq = []
    for a in anchors:
        if a not in seen:
            seen.add(a)
            uniq.append(a)
    return uniq[:4]

def anchor_score(lat_text: str, eng_block: str) -> float:
    """
    Reward if at least one anchor-ish token is reflected in English.
    This is weak (names like Caesar, Helvetii, Orgetorix often appear).
    """
    anchors = latin_anchor_tokens(lat_text)
    if not anchors:
        return 0.0
    e = eng_block.lower()
    hits = 0
    for a in anchors:
        # allow stem-ish match for proper names
        if a[:5] in e:
            hits += 1
    if hits == 0:
        return 0.0
    return min(0.25, 0.10 * hits)

def choose_merge_count(
    lat_text: str,
    eng_sents: List[str],
    j: int,
    remaining_lat: int,
    remaining_eng: int,
    ratio: float,
    max_merge: int = 6
) -> Tuple[int, float]:
    """
    Greedy: for the current Latin sentence, decide how many consecutive English sentences to attach (k).
    Constraints:
      - must leave at least 1 English sentence for each remaining Latin sentence
      - 1 <= k <= max_merge (and <= feasible limit)
    Score:
      - length closeness to expected: ratio * len(lat_text)
      - weak anchor reward
      - small penalty for merging too many unless needed
    Returns (best_k, best_cost)
    """
    lat_len = max(1, len(lat_text))
    target = ratio * lat_len

    min_k = 1
    max_k_feasible = remaining_eng - (remaining_lat - 1)
    max_k = min(max_merge, max_k_feasible)

    best_k = 1
    best_cost = 10**9

    for k in range(min_k, max_k + 1):
        block = " ".join(eng_sents[j:j+k])
        block_len = len(block)

        # normalized length error
        len_err = abs(block_len - target) / max(1.0, target)

        # prefer fewer merges slightly
        merge_pen = 0.04 * (k - 1)

        # anchor helps a bit
        a_bonus = anchor_score(lat_text, block)

        cost = len_err + merge_pen - a_bonus

        if cost < best_cost:
            best_cost = cost
            best_k = k

    return best_k, best_cost

def align_chapter_greedy(latin_sents: List[dict], eng_sents: List[str]) -> Tuple[Dict[str, str], List[str]]:
    """
    Order-preserving greedy alignment:
      - split English into sentences
      - attach 1+ English sentences to each Latin sentence, in order
      - never split English sentences
      - always include all English (leftovers go to last Latin sentence)
    """
    review: List[str] = []
    out: Dict[str, str] = {}

    if not latin_sents:
        return out, review

    # If there are zero English sentences, everything blank
    if not eng_sents:
        for ls in latin_sents:
            out[ls["sid"]] = ""
        review.append("NO ENGLISH SENTENCES AFTER SPLIT")
        return out, review

    # ratio based on character lengths (coarse but surprisingly stable)
    total_lat = sum(len(clean_latin(ls["text"])) for ls in latin_sents)
    total_eng = sum(len(s) for s in eng_sents)
    ratio = (total_eng / max(1, total_lat))

    i = 0
    j = 0
    m = len(latin_sents)
    n = len(eng_sents)

    costs: List[float] = []

    while i < m and j < n:
        remaining_lat = m - i
        remaining_eng = n - j

        lat_text = clean_latin(latin_sents[i]["text"])

        # If we're at the last Latin sentence, give it all remaining English
        if remaining_lat == 1:
            block = " ".join(eng_sents[j:])
            out[latin_sents[i]["sid"]] = clean_english(block)
            j = n
            i += 1
            break

        # If English remaining equals Latin remaining, it's 1-to-1 for the rest
        if remaining_eng == remaining_lat:
            out[latin_sents[i]["sid"]] = clean_english(eng_sents[j])
            costs.append(0.0)
            i += 1
            j += 1
            continue

        # If English remaining is fewer than Latin remaining, we can't fill all.
        # Fill 1-to-1 until English runs out; leave remaining Latin blank.
        if remaining_eng < remaining_lat:
            out[latin_sents[i]["sid"]] = clean_english(eng_sents[j])
            review.append(f"UNDERFLOW: ENG<{remaining_lat} at latin index {i}, english index {j}")
            i += 1
            j += 1
            continue

        # Normal case: ENG > LAT, choose how many English sentences to merge into this Latin sentence
        k, cost = choose_merge_count(
            lat_text=lat_text,
            eng_sents=eng_sents,
            j=j,
            remaining_lat=remaining_lat,
            remaining_eng=remaining_eng,
            ratio=ratio,
            max_merge=6
        )
        block = " ".join(eng_sents[j:j+k])
        out[latin_sents[i]["sid"]] = clean_english(block)
        costs.append(cost)

        i += 1
        j += k

    # If we have leftover Latin with no English, set blanks
    while i < m:
        out[latin_sents[i]["sid"]] = ""
        i += 1

    # Simple chapter quality flag
    if costs:
        avg_cost = sum(costs) / len(costs)
        if avg_cost > 0.65:
            review.append(f"LOW_CONF_ALIGNMENT avg_cost={avg_cost:.2f} (chapter may need manual review)")

    return out, review

def main():
    if not PDF_PATH.exists():
        raise FileNotFoundError(f"Missing translation PDF at: {PDF_PATH}")
    if not LATIN_UD_PATH.exists():
        raise FileNotFoundError(f"Missing Latin UD JSON at: {LATIN_UD_PATH}")

    lines = extract_pdf_lines(PDF_PATH)
    trans_by_ch = extract_translation_by_chapter(lines)
    latin_by_ch = load_latin_by_chapter()

    by_sid: Dict[str, str] = {}
    review_lines: List[str] = []
    filled = 0
    total = 0

    # Iterate chapters 1..54 in order
    for ch in range(1, 55):
        latin_sents = latin_by_ch.get(ch, [])
        total += len(latin_sents)

        ch_text = trans_by_ch.get(ch, "")
        if not ch_text:
            # no translation chapter found
            for ls in latin_sents:
                by_sid[ls["sid"]] = ""
            review_lines.append(f"CH {ch}: NO TRANSLATION CHAPTER FOUND (latin={len(latin_sents)})")
            continue

        eng_sents = sentence_split_english_block(ch_text)

        mapping, local_review = align_chapter_greedy(latin_sents, eng_sents)
        by_sid.update(mapping)

        filled_here = sum(1 for ls in latin_sents if mapping.get(ls["sid"], "").strip())
        filled += filled_here

        review_lines.append(f"\nCH {ch}: latin={len(latin_sents)} eng_sentences={len(eng_sents)} filled={filled_here}")
        for r in local_review:
            review_lines.append(f"  - {r}")

        # Print a small sample for sanity in review file
        for ls in latin_sents[:3]:
            sid = ls["sid"]
            lt = clean_latin(ls["text"])[:110]
            et = (mapping.get(sid, "") or "")[:110]
            review_lines.append(f"  {sid} LAT: {lt}")
            review_lines.append(f"       ENG: {et}")

    payload = {
        "meta": {
            "source": "DBG Book 1",
            "format": "chapter_greedy_english_merge",
            "notes": "Order-preserving. English is sentence-split; multiple English sentences may map to one Latin sentence. English sentences are never split.",
            "filled": filled,
            "total": total
        },
        "by_sid": by_sid
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    REVIEW_PATH.write_text("\n".join(review_lines), encoding="utf-8")

    print(f"Wrote: {OUT_PATH}  (filled {filled}/{total})")
    print(f"Wrote review: {REVIEW_PATH}")

if __name__ == "__main__":
    main()
