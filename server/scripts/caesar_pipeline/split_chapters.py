import json
import re
from pathlib import Path

# Paths (relative to this script file)
BASE = Path(__file__).resolve().parent
INPUT = (BASE / "../../data/caesar/dbg1_raw.txt").resolve()
OUTPUT = (BASE / "../../data/caesar/dbg1_chapters.json").resolve()

text = INPUT.read_text(encoding="utf-8")

# Normalize line endings and spacing a bit
text = text.replace("\r\n", "\n").replace("\r", "\n")

# Some PDF extractions may start chapter 1 as "1]" instead of "[1]"
# Fix only at the beginning of the document (or start of a line).
text = re.sub(r"(^|\n)\s*1\]\s*", r"\1[1] ", text, count=1)

# Split into chapters on markers like [1], [2], ...
parts = re.split(r"\[(\d{1,3})\]", text)

# re.split returns: [before, chapNum1, chapText1, chapNum2, chapText2, ...]
chapters = {}
for i in range(1, len(parts), 2):
    chap_num = parts[i].strip()
    chap_text = parts[i + 1].strip()

    # Basic cleanup: collapse multiple spaces, but keep line breaks
    chap_text = re.sub(r"[ \t]+", " ", chap_text)
    chap_text = re.sub(r"\n{3,}", "\n\n", chap_text)

    chapters[chap_num] = chap_text

# Sanity checks
nums = sorted(int(k) for k in chapters.keys())
print(f"Chapters found: {len(nums)}")
print(f"First chapter: {nums[0] if nums else 'NONE'}")
print(f"Last chapter: {nums[-1] if nums else 'NONE'}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(chapters, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote: {OUTPUT}")
