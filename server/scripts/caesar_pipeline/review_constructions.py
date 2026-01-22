import json
from pathlib import Path
from collections import defaultdict, Counter

BASE = Path(__file__).resolve().parent
UD_PATH = (BASE / "../../data/caesar/dbg1_ud.json").resolve()
TAG_PATH = (BASE / "../../data/caesar/dbg1_constructions.json").resolve()

MAX_PER_TYPE = 10          # how many examples to print per type
PRINT_TOKENS = True        # show full token line for each printed example
PRINT_HIGHLIGHTS = True    # show highlight_spans (if present)
VALIDATE = True            # validate indices and report problems

# -----------------------------------------------------------------------------
# Load data
# -----------------------------------------------------------------------------

ud_raw = json.loads(UD_PATH.read_text(encoding="utf-8"))
tags_raw = json.loads(TAG_PATH.read_text(encoding="utf-8"))

# UD can be either:
#  A) {"meta":..., "chapters": {"1":[...], "2":[...]}}
#  B) {"1":[...], "2":[...]}  (older)
if isinstance(ud_raw, dict) and "chapters" in ud_raw:
    chapters = ud_raw["chapters"]
else:
    chapters = ud_raw

# Constructions can be either:
#  A) {"by_sentence": {sid: [tags...]}}
#  B) {"tags_by_sid": {sid: [tags...]}}
if "by_sentence" in tags_raw:
    by_sentence = tags_raw["by_sentence"]
elif "tags_by_sid" in tags_raw:
    by_sentence = tags_raw["tags_by_sid"]
else:
    raise ValueError("Could not find constructions mapping: expected 'by_sentence' or 'tags_by_sid'.")

# Build sid -> sentence object
sid_to_sent = {}
for chap, sents in chapters.items():
    for s in sents:
        sid_to_sent[s["sid"]] = s

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def pretty_tokens(tokens):
    return " ".join([t.get("text", "") for t in tokens])

def token_line(tokens):
    # index:text<lemma>/upos[feats] deprel->head
    out = []
    for i, t in enumerate(tokens):
        feats = t.get("feats") or ""
        head = t.get("head", 0)
        dep = t.get("deprel", "")
        lemma = t.get("lemma", "")
        out.append(f"{i}:{t.get('text','')}<{lemma}>/{t.get('upos','')}[{feats}] {dep}->{head}")
    return "  ".join(out)

def safe_slice(tokens, start, end):
    if start < 0: start = 0
    if end >= len(tokens): end = len(tokens) - 1
    if start > end: return []
    return tokens[start:end+1]

def format_span(tokens, a, b):
    span = safe_slice(tokens, a, b)
    return f"[{a}:{b}] {pretty_tokens(span)}"

def normalize_type_subtype(tag):
    t = tag.get("type", "UNKNOWN")
    st = tag.get("subtype")
    if st is None:
        return t, None
    return t, str(st)

def validate_tag(tokens, tag):
    problems = []
    n = len(tokens)
    if "start" in tag and "end" in tag:
        try:
            start = int(tag["start"])
            end = int(tag["end"])
        except Exception:
            problems.append("start/end not int-castable")
            return problems
        if start < 0 or start >= n:
            problems.append(f"start out of range: {start}")
        if end < 0 or end >= n:
            problems.append(f"end out of range: {end}")
        if start > end:
            problems.append(f"start > end ({start} > {end})")

    hs = tag.get("highlight_spans")
    if hs is not None:
        if not isinstance(hs, list):
            problems.append("highlight_spans is not a list")
        else:
            for pair in hs:
                if not (isinstance(pair, list) and len(pair) == 2):
                    problems.append(f"bad highlight span shape: {pair}")
                    continue
                a, b = pair
                if not (isinstance(a, int) and isinstance(b, int)):
                    problems.append(f"highlight span indices not int: {pair}")
                    continue
                if a < 0 or a >= n or b < 0 or b >= n:
                    problems.append(f"highlight span out of range: {pair}")
                if a > b:
                    problems.append(f"highlight span reversed: {pair}")

    return problems

# -----------------------------------------------------------------------------
# Summaries
# -----------------------------------------------------------------------------

type_counts = Counter()
type_subtype_counts = Counter()

invalid = []  # (sid, type, subtype, problems)

for sid, tag_list in by_sentence.items():
    sent = sid_to_sent.get(sid)
    if not sent:
        continue
    toks = sent.get("tokens") or []
    for tag in tag_list:
        t, st = normalize_type_subtype(tag)
        type_counts[t] += 1
        if st is not None:
            type_subtype_counts[(t, st)] += 1

        if VALIDATE:
            probs = validate_tag(toks, tag)
            if probs:
                invalid.append((sid, t, st, probs))

print("\n" + "="*90)
print("TOTAL TAG COUNTS BY TYPE")
for t, c in type_counts.most_common():
    print(f"{t:28s}  {c}")

print("\n" + "="*90)
print("TOTAL TAG COUNTS BY TYPE + SUBTYPE")
for (t, st), c in type_subtype_counts.most_common():
    print(f"{t:28s}  subtype={st:18s}  {c}")

if VALIDATE:
    print("\n" + "="*90)
    print(f"VALIDATION: {len(invalid)} tags with problems")
    for sid, t, st, probs in invalid[:30]:
        st_s = f" subtype={st}" if st is not None else ""
        print(f"- {sid} :: {t}{st_s} -> {', '.join(probs)}")
    if len(invalid) > 30:
        print(f"... and {len(invalid) - 30} more")

# -----------------------------------------------------------------------------
# Examples per type
# -----------------------------------------------------------------------------

printed_per_type = defaultdict(int)

def print_example(sid, tag):
    sent = sid_to_sent.get(sid)
    if not sent:
        return
    toks = sent.get("tokens") or []
    t, st = normalize_type_subtype(tag)

    conf = tag.get("confidence", None)
    print("\n" + "-"*90)
    print(f"SID: {sid}   TYPE: {t}" + (f"  SUBTYPE: {st}" if st else "") + (f"   CONF: {conf}" if conf is not None else ""))
    sentence_text = (sent.get("text") or "").replace("\n", " ")
    print(f"Sentence: {sentence_text}")

    if "start" in tag and "end" in tag:
        start = int(tag["start"])
        end = int(tag["end"])
        print("Span:", format_span(toks, start, end))

    if PRINT_HIGHLIGHTS and tag.get("highlight_spans"):
        print("Highlights:")
        for a, b in tag["highlight_spans"]:
            print("  -", format_span(toks, a, b))

    if t.startswith("conditional") and tag.get("conditional"):
        meta = tag["conditional"]
        print("Conditional meta:")
        print(f"  label={meta.get('label')}  discourse={meta.get('discourse')}")
        p = meta.get("protasis", {})
        a = meta.get("apodosis", {})
        print(f"  protasis verb_index={p.get('verb_index')} mood={p.get('mood')} tense={p.get('tense')} aspect={p.get('aspect')} verbForm={p.get('verbForm')}")
        print(f"  apodosis verb_index={a.get('verb_index')} mood={a.get('mood')} tense={a.get('tense')} aspect={a.get('aspect')} verbForm={a.get('verbForm')}")

    trig = tag.get("trigger", {})
    if trig:
        print("Trigger:")
        for k, v in trig.items():
            if isinstance(v, int) and 0 <= v < len(toks):
                tt = toks[v]
                print(f"  {k} @ {v}: {tt.get('text')}  lemma={tt.get('lemma')}  upos={tt.get('upos')}  feats={tt.get('feats')}")
            else:
                # keep non-index debug info visible
                if not isinstance(v, int):
                    print(f"  {k}: {v}")

    if PRINT_TOKENS:
        print("\nTokens:")
        print(token_line(toks))

# Iterate in stable-ish order: by type, then by sid
for sid in sorted(by_sentence.keys()):
    sent = sid_to_sent.get(sid)
    if not sent:
        continue
    for tag in by_sentence[sid]:
        t, _ = normalize_type_subtype(tag)
        if printed_per_type[t] >= MAX_PER_TYPE:
            continue
        print_example(sid, tag)
        printed_per_type[t] += 1

print("\n" + "="*90)
print("DONE. Printed examples per type:")
for t, c in sorted(printed_per_type.items(), key=lambda x: x[0]):
    print(f"{t:28s}  {c}")
