#DONT RUN AGAIN
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
INPUT = (BASE / "../../data/caesar/dbg1_chapters.json").resolve()
OUTPUT = (BASE / "../../data/caesar/dbg1_sentences.json").resolve()

chapters = json.loads(INPUT.read_text(encoding="utf-8"))

def normalize_text(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")

    # Remove obvious header/footer junk
    s = re.sub(r"\bthelatinlibrary\b.*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^\s*\d{1,2}/\d{1,2}/\d{2,4}.*$", "", s, flags=re.MULTILINE)

    # Protect common Roman praenomen abbreviations so we don't split on "M." or "P."
    # We'll restore them after splitting.
    s = s.replace("M.", "M<ABBR>")
    s = s.replace("P.", "P<ABBR>")
    s = s.replace("C.", "C<ABBR>")
    s = s.replace("L.", "L<ABBR>")
    s = s.replace("Q.", "Q<ABBR>")
    # Remove edition brackets that confuse the parser (e.g., [et P.])
    s = s.replace("[", "").replace("]", "")


    # Remove editorial sentence numbers at start or after whitespace when followed by a capital letter
    s = re.sub(r"(^|\s)(\d{1,2})\s+(?=[A-Z])", r"\1", s)

    # Remove embedded editorial numbers like ", 4 proximique" or ": 2 perfacile" or "; 5 qua"
    # This targets "punct/space + number + space + lowercase letter"
    s = re.sub(r"([,;:\.])\s*(\d{1,2})\s+(?=[a-z])", r"\1 ", s)

    # Normalize whitespace but keep line breaks for now
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{2,}", "\n", s)

    return s.strip()


# Split on period + space + capital letter
SENTENCE_SPLIT_RE = re.compile(r"(?<=[\.])\s+(?=[A-Z])")

sentences_by_chapter = {}
total = 0

for chap, text in chapters.items():
    clean = normalize_text(text)
    raw_sents = re.split(SENTENCE_SPLIT_RE, clean)

    sents = []
    for s in raw_sents:
        s = s.strip()
        s = s.replace("M<ABBR>", "M.")
        s = s.replace("P<ABBR>", "P.")
        s = s.replace("C<ABBR>", "C.")
        s = s.replace("L<ABBR>", "L.")
        s = s.replace("Q<ABBR>", "Q.")

        if len(s) >= 10:
            sents.append(s)

    sentences_by_chapter[chap] = sents
    total += len(sents)

print(f"Total sentences: {total}")
print(f"Chapter 1 sentences: {len(sentences_by_chapter.get('1', []))}")
print(f"Chapter 2 sentences: {len(sentences_by_chapter.get('2', []))}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(sentences_by_chapter, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote: {OUTPUT}")
