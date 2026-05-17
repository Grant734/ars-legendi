#!/usr/bin/env python3
"""Audit Pliny per-part vocab targets for human review."""
import json
import re
from collections import defaultdict

BASE = "/Users/grant/latin-edu-website/server/data/pliny"
with open(f"{BASE}/pliny_chapter_vocab.json") as f:
    vocab = json.load(f)
with open(f"{BASE}/pliny_ud.json") as f:
    ud = json.load(f)
with open(f"{BASE}/pliny_lemma_glosses_MASTER.json") as f:
    glossary = json.load(f)
with open(f"{BASE}/pliny_parts.json") as f:
    parts_def = json.load(f)
with open(f"{BASE}/lemma_corrections.json") as f:
    corrections = json.load(f).get("corrections", {})

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

# Count lemma occurrences across full corpus
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
out_lines = []

for ch_id in LETTER_ORDER:
    ch_data = vocab["by_chapter"].get(ch_id, {})
    parts = ch_data.get("parts", {})
    ch_parts = parts_def.get(ch_id, [])
    sents = chapters.get(ch_id, [])

    out_lines.append(f"\n{'='*70}")
    out_lines.append(f"  LETTER {ch_id}: {ch_data.get('displayName', '')}")
    out_lines.append(f"  Chapter-level targets: {ch_data.get('targetCount', 0)}")
    out_lines.append(f"{'='*70}")

    for part_info in ch_parts:
        pnum = part_info["part"]
        title = part_info["title"]
        start_idx = part_info["startSidIndex"]
        end_idx = part_info["endSidIndex"]

        part_data = parts.get(str(pnum), {})
        current_targets = {t["lemma"] for t in part_data.get("targets", [])}

        # Count all eligible lemmas in this part
        lemma_counts = defaultdict(int)
        lemma_upos = {}
        for sent in sents:
            idx = sent.get("index", -1)
            if idx < start_idx or idx > end_idx:
                continue
            for tok in sent.get("tokens", []):
                upos = tok.get("upos", "")
                if upos not in CONTENT_UPOS:
                    continue
                form = (tok.get("text") or "").strip()
                raw = (tok.get("lemma") or "").strip().lower()
                lemma = apply_correction(form, raw)
                if len(lemma) < 2 or lemma in STOPLIST:
                    continue
                if re.search(r'[\d]', lemma):
                    continue
                if not has_real_glossary(lemma):
                    continue
                lemma_counts[lemma] += 1
                lemma_upos[lemma] = upos

        sorted_lemmas = sorted(lemma_counts.items(), key=lambda x: (-x[1], x[0]))

        out_lines.append(f"\n  Part {pnum}: {title} (sentences {start_idx}-{end_idx})")
        out_lines.append(f"  Eligible lemmas: {len(sorted_lemmas)} | Current targets: {len(current_targets)}")
        out_lines.append(f"  {'Lemma':<20s} {'UPOS':<6s} {'Part':<5s} {'Corp':<5s} {'Status':<12s} {'In?':<4s} Gloss")
        out_lines.append(f"  {'-'*90}")

        for lemma, count in sorted_lemmas:
            g = glossary.get(lemma, {})
            source = g.get("source", "?")[:10]
            gloss = (g.get("glosses", ["?"])[0] or "?")[:30]
            in_targets = "YES" if lemma in current_targets else ""
            upos = lemma_upos.get(lemma, "?")
            corp = corpus_counts.get(lemma, 0)
            out_lines.append(f"  {lemma:<20s} {upos:<6s} {count:<5d} {corp:<5d} {source:<12s} {in_targets:<4s} {gloss}")

output_path = "/Users/grant/latin-edu-website/scripts/output/pliny_vocab_audit.txt"
with open(output_path, "w") as f:
    f.write("\n".join(out_lines))
print(f"Written: {output_path}")
