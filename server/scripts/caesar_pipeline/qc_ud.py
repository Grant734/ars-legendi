import json
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parent
INPUT = (BASE / "../../data/caesar/dbg1_ud.json").resolve()

data = json.loads(INPUT.read_text(encoding="utf-8"))

lemma_counter = Counter()
upos_counter = Counter()
feats_null = 0
total_words = 0

sample_weird_lemmas = []
WEIRD_LEMMA_CHARS = set("[]{}<>")

for chap, sents in data["chapters"].items():
    for sent in sents:
        for t in sent["tokens"]:
            if t["upos"] == "PUNCT":
                continue
            total_words += 1
            lemma = (t.get("lemma") or "").strip()
            upos = t.get("upos") or ""
            feats = t.get("feats")

            lemma_counter[lemma] += 1
            upos_counter[upos] += 1
            if feats is None:
                feats_null += 1

            # Flag some “obviously suspicious” lemma cases
            if (
                lemma == ""
                or any(ch in WEIRD_LEMMA_CHARS for ch in lemma)
                or lemma == t.get("text") and upos in ("VERB", "AUX")  # verbs whose lemma didn't change
            ):
                if len(sample_weird_lemmas) < 25:
                    sample_weird_lemmas.append((sent["sid"], t["text"], lemma, upos, feats))

print(f"Total non-punct tokens: {total_words}")
print(f"Tokens with feats=null: {feats_null} ({feats_null/total_words:.2%})")
print("Top UPOS:", upos_counter.most_common(10))
print("Top lemmas:", lemma_counter.most_common(15))

print("\nSample suspicious tokens (sid, text, lemma, upos, feats):")
for row in sample_weird_lemmas:
    print(row)
