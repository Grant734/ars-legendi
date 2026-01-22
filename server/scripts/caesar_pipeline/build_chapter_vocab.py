# server/scripts/ceasar_pipeline/build_chapter_vocab.py
import json
import math
import os
import re
from collections import Counter, defaultdict

# ---------- CONFIG ----------
DATA_DIR = os.path.join("server", "data", "caesar")
UD_PATH = os.path.join(DATA_DIR, "dbg1_ud.json")
LEMMA_INDEX_PATH = os.path.join(DATA_DIR, "dbg1_lemma_index.json")
OUT_PATH = os.path.join(DATA_DIR, "dbg1_chapter_vocab.json")

# Target size: ~20% of unique content lemmas in chapter
TARGET_FRAC = 0.2

# Conservative stoplist (MVP). You can expand this later.
STOP_LEMMAS = set([
    "et", "in", "is", "sum", "qui", "quod", "hic", "ille", "ipse", "idem",
    "ad", "a", "ab", "de", "ex", "e", "cum", "sine", "per", "pro", "sub",
    "ut", "ne", "non", "sed", "aut", "vel", "atque", "ac", "enim", "igitur",
    "nam", "quo", "quam", "quamquam", "ubi", "unde", "ita", "tamen",
    "se", "sui", "suus", "meus", "tuus", "noster", "vester", "M.", "c.us", "L.", "lius",
])

# UPOS we generally don't want as vocab targets
EXCLUDE_UPOS = set(["PUNCT", "SYM", "X"])

# If you want to exclude function words by UPOS too (more aggressive), uncomment:
# EXCLUDE_UPOS |= set(["ADP", "CCONJ", "SCONJ", "DET", "PRON", "PART"])

# Heuristic proper-name detection when UPOS isn't PROPN
CAPITAL_RE = re.compile(r"^[A-Z][a-zA-Z]+$")

# Some proper-name-ish patterns in Caesar that UD sometimes tags oddly (very optional):
PROPER_SUFFIXES = ("-ae", "-i", "-orum", "-is", "-um", "-os", "-as")


# ---------- HELPERS ----------
def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def looks_proper_surface(form_text):
    # True if token looks like a capitalized name (not punctuation)
    if not form_text:
        return False
    if "\n" in form_text:
        form_text = form_text.replace("\n", "")
    return bool(CAPITAL_RE.match(form_text))

def conservative_is_proper(token, sent_token_index):
    """
    Mixed PROPN tagging: we treat as proper if:
    - UPOS == PROPN, OR
    - surface form looks capitalized AND it's not the first token in sentence
      (to avoid sentence-initial capitalization false positives)
    This is conservative, but good for MVP.
    """
    upos = token.get("upos")
    if upos == "PROPN":
        return True

    form = token.get("text", "")
    if looks_proper_surface(form) and sent_token_index != 0:
        return True

    return False

def normalize_lemma(lemma):
    if not lemma:
        return ""
    return str(lemma).strip().lower()

def safe_int(x, default=None):
    try:
        return int(x)
    except Exception:
        return default


# ---------- MAIN ----------
def main():
    ud = load_json(UD_PATH)
    lemma_index = load_json(LEMMA_INDEX_PATH)

    chapters = ud["chapters"]  # keys like "1".."54"
    by_lemma = lemma_index["by_lemma"]

    # First chapter per lemma (from lemma index)
    first_chapter = {}
    for lem, occs in by_lemma.items():
        # occ entries have: sid, chapter, token_index, form
        chs = [o.get("chapter") for o in occs if isinstance(o.get("chapter"), int)]
        if chs:
            first_chapter[lem] = min(chs)

    # For each chapter, count lemmas and track useful metadata
    out = {
        "meta": {
            "source": "DBG Book 1",
            "format": "chapter_vocab",
            "target_frac_unique_content_lemmas": TARGET_FRAC,
            "stop_lemmas_count": len(STOP_LEMMAS),
            "notes": [
                "Built from dbg1_ud.json (canonical tokens) + dbg1_lemma_index.json (firstChapter + occurrences).",
                "Proper-name handling is conservative: UPOS=PROPN OR capitalized token not at sentence start.",
                "Proper names are included only in their earliest chapter.",
            ],
        },
        "by_chapter": {}
    }

    # We also want global lemma -> a representative UPOS (most frequent across occurrences in UD)
    lemma_upos_counter = defaultdict(Counter)

    # Pre-pass: collect lemma->upos counts across all tokens
    for ch_str, sents in chapters.items():
        for s in sents:
            toks = s.get("tokens", [])
            for i, t in enumerate(toks):
                upos = t.get("upos")
                if upos in EXCLUDE_UPOS:
                    continue
                lemma = normalize_lemma(t.get("lemma"))
                if not lemma:
                    continue
                lemma_upos_counter[lemma][upos] += 1

    lemma_main_upos = {}
    for lem, ctr in lemma_upos_counter.items():
        lemma_main_upos[lem] = ctr.most_common(1)[0][0]

    # Build per chapter targets
    for ch_str in sorted(chapters.keys(), key=lambda x: int(x)):
        ch_num = int(ch_str)
        sents = chapters[ch_str]

        # count lemma frequency in this chapter
        freq = Counter()
        proper_flag = {}  # lemma -> bool (ever looks proper)
        example = {}      # lemma -> {sid, token_index, form}

        # Use lemma_index occurrences for examples (preferred), but we still compute freqs from UD
        for s in sents:
            sid = s.get("sid")
            toks = s.get("tokens", [])
            for i, t in enumerate(toks):
                upos = t.get("upos")
                if upos in EXCLUDE_UPOS:
                    continue

                lemma = normalize_lemma(t.get("lemma"))
                if not lemma:
                    continue

                # basic stop filtering
                if lemma in STOP_LEMMAS:
                    continue

                freq[lemma] += 1

                # proper-ish?
                if conservative_is_proper(t, i):
                    proper_flag[lemma] = True

                # keep a fallback example if we don't find one via lemma index
                if lemma not in example and sid is not None:
                    example[lemma] = {
                        "sid": sid,
                        "token_index": i,
                        "form": t.get("text", "")
                    }

        # Unique content lemmas in chapter
        unique_content = list(freq.keys())
        target_n = max(1, int(math.ceil(TARGET_FRAC * len(unique_content)))) if unique_content else 0

        # Candidate list: apply proper-name earliest-chapter rule
        candidates = []
        for lem in unique_content:
            is_prop = bool(proper_flag.get(lem, False) or lemma_main_upos.get(lem) == "PROPN")

            fc = first_chapter.get(lem, None)
            if fc is None:
                # if missing (unlikely), treat as current
                fc = ch_num

            # proper names only in earliest chapter
            if is_prop and fc != ch_num:
                continue

            # Build candidate record
            # Prefer an example from lemma index if it has this chapter
            ex = None
            occs = by_lemma.get(lem, [])
            if occs:
                # find first occurrence in this chapter
                for o in occs:
                    if o.get("chapter") == ch_num:
                        ex = {
                            "sid": o.get("sid"),
                            "token_index": o.get("token_index"),
                            "form": o.get("form")
                        }
                        break
            if ex is None:
                ex = example.get(lem)

            candidates.append({
                "lemma": lem,
                "upos": lemma_main_upos.get(lem),
                "count": int(freq[lem]),
                "firstChapter": int(fc),
                "isProper": bool(is_prop),
                "example": ex
            })

        # Ranking: frequency first, then prefer "new" lemmas whose firstChapter==current
        # This is simple and stable for MVP.
        def rank_key(item):
            new_bonus = 1 if item["firstChapter"] == ch_num else 0
            return (item["count"], new_bonus)

        candidates.sort(key=rank_key, reverse=True)

        targets = candidates[:target_n] if target_n > 0 else []

        out["by_chapter"][ch_str] = {
            "chapter": ch_num,
            "uniqueContentLemmas": len(unique_content),
            "targetCount": len(targets),
            "targets": targets
        }

    # Write out
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote: {OUT_PATH}")

if __name__ == "__main__":
    main()
