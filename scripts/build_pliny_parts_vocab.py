#!/usr/bin/env python3
"""
Build per-part vocab targets for Pliny with expanded selection logic.
Target ~15 per part (soft cap with flexibility).
"""

import json
import re
import math
from collections import defaultdict

BASE = "/Users/grant/latin-edu-website"
UD_PATH = f"{BASE}/server/data/pliny/pliny_ud.json"
GLOSSARY_PATH = f"{BASE}/server/data/pliny/pliny_lemma_glosses_MASTER.json"
CORRECTIONS_PATH = f"{BASE}/server/data/pliny/lemma_corrections.json"
PARTS_PATH = f"{BASE}/server/data/pliny/pliny_parts.json"
VOCAB_PATH = f"{BASE}/server/data/pliny/pliny_chapter_vocab.json"

CONTENT_UPOS = {"NOUN", "VERB", "ADJ", "ADV"}

STOPLIST = {
    "sum", "ego", "tu", "is", "hic", "ille", "iste", "qui", "quis",
    "et", "atque", "nec", "neque", "aut", "vel", "sed", "nam", "enim",
    "autem", "tamen", "non", "ne", "ut", "cum", "si", "nisi", "in",
    "ad", "ex", "de", "a", "ab", "per", "pro", "sub", "super", "inter",
    "ante", "post", "trans", "apud", "circa", "contra", "sine",
    "se", "suus", "meus", "tuus", "noster", "vester",
}

def normalize_uv(s):
    return s.lower().replace("v", "u")

with open(UD_PATH) as f:
    ud = json.load(f)
with open(GLOSSARY_PATH) as f:
    glossary = json.load(f)
with open(CORRECTIONS_PATH) as f:
    corrections = json.load(f).get("corrections", {})
with open(PARTS_PATH) as f:
    parts_def = json.load(f)
with open(VOCAB_PATH) as f:
    vocab = json.load(f)

def apply_correction(form, lemma):
    key = f"{form.lower()}|{lemma.lower()}"
    return corrections.get(key, lemma)

def has_real_glossary(lemma):
    e = glossary.get(lemma)
    if e and e.get("source") != "NeedsManualReview":
        return True
    for k, v in glossary.items():
        if normalize_uv(k) == normalize_uv(lemma) and v.get("source") != "NeedsManualReview":
            return True
    return False

def is_eligible(lemma, upos):
    if upos not in CONTENT_UPOS:
        return False
    if len(lemma) < 2 or lemma in STOPLIST:
        return False
    if re.search(r'[\d]', lemma) or re.search(r'[^\w]', lemma):
        return False
    return has_real_glossary(lemma)

# Compute corpus-wide frequency for each lemma
corpus_counts = defaultdict(int)
chapters = ud.get("chapters", {})
for ch_id, sents in chapters.items():
    for sent in sents:
        for tok in sent.get("tokens", []):
            form = (tok.get("text") or "").strip()
            raw = (tok.get("lemma") or "").strip().lower()
            lemma = apply_correction(form, raw)
            if lemma:
                corpus_counts[lemma] += 1

LETTER_ORDER = ["6_16", "7_27", "10_96", "10_97", "6_4"]

for ch_id, parts_list in parts_def.items():
    sents = chapters.get(ch_id, [])
    ch_vocab = vocab["by_chapter"].get(ch_id, {})

    parts_out = {}
    tested_in_earlier_parts = set()  # lemmas already targeted in prior parts

    for part_info in parts_list:
        part_num = part_info["part"]
        start_idx = part_info["startSidIndex"]
        end_idx = part_info["endSidIndex"]
        title = part_info["title"]
        num_sentences = end_idx - start_idx + 1

        # Target count: min(15, max(5, sentences * 1.5)), allow +3 overflow
        base_target = min(15, max(5, math.ceil(num_sentences * 1.5)))

        # Collect lemma data for this part
        lemma_counts = defaultdict(int)  # count within this part
        lemma_examples = {}
        lemma_upos = {}

        for sent in sents:
            idx = sent.get("index", -1)
            if idx < start_idx or idx > end_idx:
                continue
            sid = sent.get("sid", "")
            for tok in sent.get("tokens", []):
                upos = tok.get("upos", "")
                form = (tok.get("text") or "").strip()
                raw_lemma = (tok.get("lemma") or "").strip().lower()
                lemma = apply_correction(form, raw_lemma)

                if not is_eligible(lemma, upos):
                    continue

                lemma_counts[lemma] += 1
                if lemma not in lemma_examples:
                    lemma_examples[lemma] = {"sid": sid, "token_index": tok["id"] - 1, "form": form}
                lemma_upos[lemma] = upos

        # Categorize eligible lemmas by priority
        # Priority 1: count >= 2 in this part (frequent here)
        # Priority 2: count == 1 but high corpus frequency (>= 3)
        # Priority 3: count == 1, low corpus frequency
        # Within each priority: prefer lemmas not yet tested in earlier parts

        p1_new = []  # freq in part, not tested before
        p1_repeat = []  # freq in part, already tested
        p2_new = []
        p2_repeat = []
        p3_new = []
        p3_repeat = []

        for lemma, count in lemma_counts.items():
            is_new = lemma not in tested_in_earlier_parts
            entry = {
                "lemma": lemma,
                "upos": lemma_upos.get(lemma, "NOUN"),
                "count": corpus_counts.get(lemma, count),
                "firstChapter": ch_id,
                "isProper": False,
                "example": lemma_examples.get(lemma, {}),
                "part_count": count,
            }

            if count >= 2:
                (p1_new if is_new else p1_repeat).append(entry)
            elif corpus_counts.get(lemma, 0) >= 3:
                (p2_new if is_new else p2_repeat).append(entry)
            else:
                (p3_new if is_new else p3_repeat).append(entry)

        # Sort each bucket: by part_count desc, then corpus count desc, then alpha
        def sort_key(e):
            return (-e["part_count"], -e["count"], e["lemma"])
        for bucket in [p1_new, p1_repeat, p2_new, p2_repeat, p3_new, p3_repeat]:
            bucket.sort(key=sort_key)

        # Build target list: fill in priority order
        targets = []
        for bucket in [p1_new, p2_new, p3_new, p1_repeat, p2_repeat, p3_repeat]:
            for entry in bucket:
                if len(targets) >= base_target + 3:
                    break
                if entry["lemma"] not in {t["lemma"] for t in targets}:
                    targets.append(entry)
            if len(targets) >= base_target:
                break

        # Remove internal sort fields
        for t in targets:
            t.pop("part_count", None)

        # Mark these as tested
        for t in targets:
            tested_in_earlier_parts.add(t["lemma"])

        parts_out[str(part_num)] = {
            "title": title,
            "startSidIndex": start_idx,
            "endSidIndex": end_idx,
            "targetCount": len(targets),
            "targets": targets,
        }

    ch_vocab["parts"] = parts_out
    vocab["by_chapter"][ch_id] = ch_vocab

with open(VOCAB_PATH, "w", encoding="utf-8") as f:
    json.dump(vocab, f, indent=2, ensure_ascii=False)

print("Updated pliny_chapter_vocab.json with expanded per-part targets:")
for ch_id in LETTER_ORDER:
    ch = vocab["by_chapter"][ch_id]
    parts = ch.get("parts", {})
    part_counts = [f"p{k}={v['targetCount']}" for k, v in sorted(parts.items())]
    total = sum(v["targetCount"] for v in parts.values())
    print(f"  {ch_id}: {' '.join(part_counts)} (total={total})")
