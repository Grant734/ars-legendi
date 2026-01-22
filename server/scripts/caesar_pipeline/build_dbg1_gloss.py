import json
import re
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parents[2]  # server/
CAESAR_DIR = BASE / "data" / "caesar"
LEX_DIR = BASE / "data" / "lexicon"

LEMMA_INDEX_PATH = CAESAR_DIR / "dbg1_lemma_index.json"
LEX_PATH = LEX_DIR / "lewis_short.txt"

OUT_AUTO = CAESAR_DIR / "dbg1_gloss_auto.json"
OUT_MANUAL = CAESAR_DIR / "dbg1_gloss_manual.json"
OUT_MERGED = CAESAR_DIR / "dbg1_gloss.json"

# ---- Normalization ----
try:
    import unicodedata
    def strip_diacritics(s: str) -> str:
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
except Exception:
    def strip_diacritics(s: str) -> str:
        return s

ENCLITICS = ("que", "ve", "ne")

def norm_basic(s: str) -> str:
    s = (s or "").strip()
    s = strip_diacritics(s)
    s = s.replace("j", "i").replace("J", "I")
    # DO NOT force v->u here globally; we’ll add alternate keys instead
    return s.lower()

def norm_key_variants(head: str):
    """
    Produce multiple keys for the same headword so lookups match:
    - base
    - v/u swapped
    - hyphen removed
    """
    b = norm_basic(head)
    out = {b}
    out.add(b.replace("v", "u"))
    out.add(b.replace("u", "v"))
    out.add(b.replace("-", ""))
    out.add(b.replace("-", "").replace("v", "u"))
    out.add(b.replace("-", "").replace("u", "v"))
    return out

def lemma_lookup_variants(lemma: str):
    """
    Variants to try when Caesar lemma doesn't directly match headword:
    - base
    - v/u swapped
    - strip enclitics for LOOKUP ONLY (keep original lemma for display)
    """
    b = norm_basic(lemma)
    variants = [b, b.replace("v", "u"), b.replace("u", "v")]

    # enclitic stripping (only if lemma ends with it)
    for encl in ENCLITICS:
        if b.endswith(encl) and len(b) > len(encl) + 2:
            base2 = b[: -len(encl)]
            variants.extend([base2, base2.replace("v", "u"), base2.replace("u", "v")])

    # also try removing any trailing punctuation
    variants.extend([re.sub(r"[^a-z]+$", "", v) for v in list(variants)])

    # unique, preserve order
    seen = set()
    ordered = []
    for v in variants:
        if v and v not in seen:
            seen.add(v)
            ordered.append(v)
    return ordered

# ---- Gloss extraction ----
def extract_short_gloss(entry_text: str) -> str:
    s = re.sub(r"\s+", " ", entry_text).strip()
    if not s:
        return ""

    # Strip the initial headword chunk if it’s repeated
    # We’ll take everything after the first comma chunk if present:
    # "omnis, e, ..." -> rest
    if "," in s:
        parts = s.split(",", 1)
        if len(parts[0]) <= 20:  # headword area
            s = parts[1].strip()

    # Cut at first strong boundary after some content
    m = re.search(r"([.;:])", s)
    if m and m.start() >= 40:
        s = s[: m.start()].strip()

    if len(s) > 180:
        s = s[:180].rstrip() + "…"

    return s

# ---- Lewis & Short parsing ----
# We detect a headword line like:
# "omnis, e" or "dico" or "pars, partis"
# The key is: starts at column 0, begins with letters, and has either a comma or whitespace soon.
HEADLINE_RE = re.compile(r"^([A-Za-z][A-Za-z\-]*)\b(.*)$")

def is_new_entry_line(line: str) -> bool:
    if not line:
        return False
    if line[0].isspace():
        return False
    # must start with a letter
    if not re.match(r"^[A-Za-z]", line):
        return False

    # exclude obvious non-entry junk if present (rare)
    if line.startswith("[" ) or line.startswith("("):
        return False

    # Heuristic: headword lines usually have a comma or at least some grammatical info
    # But some are just "dico" style. We accept both.
    return True

def parse_lewis_short(path: Path):
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()

    # Map: normalized_key -> entry_text (first seen)
    entries = {}
    current_head = None
    current_lines = []

    def commit():
        nonlocal current_head, current_lines
        if current_head and current_lines:
            blob = "\n".join(current_lines).strip()
            if blob:
                for k in norm_key_variants(current_head):
                    if k and k not in entries:
                        entries[k] = blob
        current_head = None
        current_lines = []

    for line in lines:
        raw = line.rstrip("\n")
        if not raw.strip():
            # ignore blank lines, but don’t rely on them for commits
            continue

        if is_new_entry_line(raw):
            m = HEADLINE_RE.match(raw)
            if m:
                head = m.group(1)
                # IMPORTANT: commit previous entry when we hit a new headword
                commit()
                current_head = head
                current_lines = [raw]
            else:
                # continuation
                if current_head:
                    current_lines.append(raw)
        else:
            # continuation line (indented)
            if current_head:
                current_lines.append(raw)

    commit()
    return entries

def load_dbg1_lemmas():
    lemma_index = json.loads(LEMMA_INDEX_PATH.read_text(encoding="utf-8"))
    by_lemma = lemma_index.get("by_lemma", {})
    # keep original casing as keys in output (we store gloss under original lemma)
    return list(by_lemma.keys())

def main():
    if not LEX_PATH.exists():
        raise FileNotFoundError(f"Missing lexicon file: {LEX_PATH}")

    print("Parsing Lewis & Short...")
    lex_entries = parse_lewis_short(LEX_PATH)
    print(f"Parsed entries (keyed variants): {len(lex_entries)}")

    # quick sanity check: these MUST exist if parsing is working
    for probe in ["omnis", "dico", "pars", "unus", "sum"]:
        hit = lex_entries.get(probe) is not None
        print(f"Probe '{probe}':", "OK" if hit else "MISSING")

    lemmas = load_dbg1_lemmas()
    print(f"DBG1 unique lemmas: {len(lemmas)}")

    auto = {}
    missing = []

    for lem in lemmas:
        blob = None
        for k in lemma_lookup_variants(lem):
            blob = lex_entries.get(k)
            if blob:
                break

        if not blob:
            missing.append(lem)
            continue

        auto[lem] = {
            "gloss": extract_short_gloss(blob),
            "source": "Lewis&Short",
            "matched_key": k,
        }

    OUT_AUTO.write_text(json.dumps({
        "meta": {
            "source": "Lewis & Short plaintext",
            "generated_from": str(LEX_PATH),
            "dbg1_lemma_count": len(lemmas),
            "matched": len(auto),
            "missing": len(missing),
        },
        "by_lemma": auto,
        "missing_lemmas_sample": missing[:200],
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    # ensure manual exists
    if not OUT_MANUAL.exists():
        OUT_MANUAL.write_text(json.dumps({
            "meta": {"note": "Manual overrides win over auto. Add entries as {lemma: {gloss: '...'}}"},
            "by_lemma": {}
        }, indent=2, ensure_ascii=False), encoding="utf-8")

    manual = json.loads(OUT_MANUAL.read_text(encoding="utf-8")).get("by_lemma", {})

    merged = {}
    for lem, obj in auto.items():
        merged[lem] = obj["gloss"]

    for lem, obj in manual.items():
        if isinstance(obj, dict) and "gloss" in obj:
            merged[lem] = obj["gloss"]
        elif isinstance(obj, str):
            merged[lem] = obj

    OUT_MERGED.write_text(json.dumps({
        "meta": {
            "auto_file": str(OUT_AUTO),
            "manual_file": str(OUT_MANUAL),
            "merged_count": len(merged),
        },
        "by_lemma": merged
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Auto matched: {len(auto)}")
    print(f"Missing: {len(missing)}")
    print(f"Wrote: {OUT_AUTO}")
    print(f"Wrote: {OUT_MERGED}")
    if missing:
        print("Missing examples:", missing[:40])

if __name__ == "__main__":
    main()
