import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
UD_PATH = (BASE / "../../data/caesar/dbg1_ud.json").resolve()
TAG_PATH = (BASE / "../../data/caesar/dbg1_constructions.json").resolve()

ud = json.loads(UD_PATH.read_text(encoding="utf-8"))
tags = json.loads(TAG_PATH.read_text(encoding="utf-8"))

sid = "1.1"

# find sentence
sent = None
for chap, sents in ud["chapters"].items():
    for s in sents:
        if s["sid"] == sid:
            sent = s
            break
    if sent:
        break

print("SID:", sid)
print("TEXT:", sent["text"].replace("\n", " "))

print("\nTOKENS (index: text | upos | feats | head | deprel):")
for i, t in enumerate(sent["tokens"]):
    print(f"{i}: {t['text']} | {t.get('upos')} | {t.get('feats')} | head={t.get('head')} | {t.get('deprel')}")

print("\nTAGS FOR SID:")
print(tags["by_sentence"].get(sid))
