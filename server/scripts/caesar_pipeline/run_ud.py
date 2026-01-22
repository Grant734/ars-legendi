import json
from pathlib import Path
import stanza # type: ignore

BASE = Path(__file__).resolve().parent
INPUT = (BASE / "../../data/caesar/dbg1_sentences.json").resolve()
OUTPUT = (BASE / "../../data/caesar/dbg1_ud.json").resolve()

sentences_by_chapter = json.loads(INPUT.read_text(encoding="utf-8"))

# We already split sentences, so tell Stanza not to sentence-split again.
nlp = stanza.Pipeline(
    lang="la",
    processors="tokenize,pos,lemma,depparse",
    tokenize_no_ssplit=True,
    verbose=False
)

def stanza_sentence_to_tokens(sent):
    tokens = []
    for w in sent.words:
        tokens.append({
            "id": w.id,         # 1-based within sentence
            "text": w.text,
            "lemma": w.lemma,
            "upos": w.upos,
            "xpos": w.xpos,
            "feats": w.feats,   # like "Case=Nom|Gender=Fem|Number=Sing"
            "head": w.head,     # 0 means ROOT
            "deprel": w.deprel
        })
    return tokens

out = {
    "meta": {
        "source": "DBG Book 1",
        "format": "stanza_ud",
    },
    "chapters": {}
}

total_sents = 0
multi_sentence_docs = 0

for chap, sents in sentences_by_chapter.items():
    out["chapters"][chap] = []

    for idx, s in enumerate(sents):
        doc = nlp(s)

        if len(doc.sentences) != 1:
            multi_sentence_docs += 1

        stanza_sent = doc.sentences[0]
        tokens = stanza_sentence_to_tokens(stanza_sent)

        out["chapters"][chap].append({
            "sid": f"{chap}.{idx}",  # stable id: chapter.sentenceIndex
            "chapter": int(chap),
            "index": idx,
            "text": s,
            "tokens": tokens
        })
        total_sents += 1

print(f"Parsed sentences: {total_sents}")
print(f"Docs with !=1 sentence: {multi_sentence_docs}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote: {OUTPUT}")
