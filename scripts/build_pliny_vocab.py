#!/usr/bin/env python3
"""
Build Pliny vocabulary targets and glossary.
Outputs: pliny_chapter_vocab.json, pliny_lemma_glosses_MASTER.json
"""

import json
import os
import re
import time
import requests
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLINY_DIR = os.path.join(BASE, "server", "data", "pliny")
CAESAR_GLOSSARY = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.json")
OUTPUT_VOCAB = os.path.join(PLINY_DIR, "pliny_chapter_vocab.json")
OUTPUT_GLOSSARY = os.path.join(PLINY_DIR, "pliny_lemma_glosses_MASTER.json")
OUTPUT_REVIEW = os.path.join(BASE, "scripts", "output", "pliny_glossary_needs_review.json")

WHITAKERS_URL = "https://latin-words.com/cgi-bin/translate.cgi"

LETTER_ORDER = ["6_16", "7_27", "10_96", "10_97", "6_4"]

CONTENT_UPOS = {"NOUN", "VERB", "ADJ", "ADV", "PROPN"}

STOPLIST = {
    "sum", "ego", "tu", "is", "hic", "ille", "iste", "qui", "quis",
    "et", "atque", "nec", "neque", "aut", "vel", "sed", "nam", "enim",
    "autem", "tamen", "non", "ne", "ut", "cum", "si", "nisi", "in",
    "ad", "ex", "de", "a", "ab", "per", "pro", "sub", "super", "inter",
    "ante", "post", "trans", "apud", "circa", "contra", "sine",
    "se", "suus", "meus", "tuus", "noster", "vester",
}

# POS mapping: upos -> Whitaker's POS code, and to schema pos
UPOS_TO_WW = {
    "VERB": "V", "NOUN": "N", "ADJ": "ADJ", "ADV": "ADV", "PROPN": "N",
    "DET": "ADJ", "SCONJ": "CONJ", "CCONJ": "CONJ", "PRON": "PRON",
    "NUM": "NUM", "ADP": "PREP", "PART": "ADV", "AUX": "V", "X": "N",
}
WW_TO_SCHEMA = {"V": "verb", "N": "noun", "ADJ": "adjective", "ADV": "adv",
                "PREP": "preposition", "PRON": "pronoun", "CONJ": "conjunction"}


def normalize_uv(s):
    return s.lower().replace("v", "u")


def load_ud():
    with open(os.path.join(PLINY_DIR, "pliny_ud.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def load_caesar_glossary():
    with open(CAESAR_GLOSSARY, "r", encoding="utf-8") as f:
        return json.load(f)


# ================================================================
# PART A: Chapter vocab
# ================================================================

def build_chapter_vocab(ud):
    chapters = ud.get("chapters", {})

    # Track per-lemma info
    lemma_info = {}  # lemma -> {upos, count, firstChapter, isProper, example, chapters}

    for ch_id in LETTER_ORDER:
        sents = chapters.get(ch_id, [])
        for sent in sents:
            sid = sent.get("sid", "")
            for tok in sent.get("tokens", []):
                upos = tok.get("upos", "")
                if upos not in CONTENT_UPOS:
                    continue
                form = (tok.get("text") or "").strip()
                lemma = (tok.get("lemma") or "").strip().lower()
                if len(form) < 2 or len(lemma) < 2:
                    continue
                if re.search(r'[\d]', lemma) or re.search(r'[^\w]', lemma):
                    continue
                if lemma in STOPLIST:
                    continue

                if lemma not in lemma_info:
                    lemma_info[lemma] = {
                        "upos": upos,
                        "count": 0,
                        "firstChapter": ch_id,
                        "isProper": upos == "PROPN",
                        "example": {"sid": sid, "token_index": tok["id"] - 1, "form": form},
                        "chapters": set(),
                    }
                lemma_info[lemma]["count"] += 1
                lemma_info[lemma]["chapters"].add(ch_id)
                # Update upos to most common (just keep first seen for simplicity)

    # Build by_chapter
    by_chapter = {}
    for ch_id in LETTER_ORDER:
        sents = chapters.get(ch_id, [])

        # Count unique content lemmas in this chapter (including ones from earlier)
        ch_lemmas = set()
        for sent in sents:
            for tok in sent.get("tokens", []):
                upos = tok.get("upos", "")
                if upos not in CONTENT_UPOS:
                    continue
                lemma = (tok.get("lemma") or "").strip().lower()
                if len(lemma) >= 2 and lemma not in STOPLIST and not re.search(r'[\d]', lemma):
                    ch_lemmas.add(lemma)

        # Targets: lemmas whose firstChapter is this chapter
        targets = []
        for lemma, info in lemma_info.items():
            if info["firstChapter"] != ch_id:
                continue
            targets.append({
                "lemma": lemma,
                "upos": info["upos"],
                "count": info["count"],
                "firstChapter": info["firstChapter"],
                "isProper": info["isProper"],
                "example": info["example"],
            })

        targets.sort(key=lambda t: (-t["count"], t["lemma"]))

        # Get display name from chapters file
        with open(os.path.join(PLINY_DIR, "pliny_chapters.json")) as f:
            ch_meta = json.load(f)
        display = next((c["displayName"] for c in ch_meta if c["chapter"] == ch_id), f"Letter {ch_id}")

        by_chapter[ch_id] = {
            "chapter": ch_id,
            "displayName": display,
            "uniqueContentLemmas": len(ch_lemmas),
            "targetCount": len(targets),
            "targets": targets,
        }

    out = {
        "meta": {
            "source": "Pliny Epistulae (selected letters)",
            "format": "chapter_vocab",
            "notes": [
                "Built from pliny_ud.json (Stanza-parsed tokens).",
                "Targets are content lemmas (NOUN, VERB, ADJ, ADV, PROPN) excluding stoplist.",
                "Each lemma appears as a target in its firstChapter only.",
            ],
        },
        "by_chapter": by_chapter,
    }

    with open(OUTPUT_VOCAB, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    total_targets = sum(ch["targetCount"] for ch in by_chapter.values())
    print(f"  Wrote {OUTPUT_VOCAB}")
    print(f"  Total vocab targets: {total_targets}")
    for ch_id in LETTER_ORDER:
        ch = by_chapter[ch_id]
        print(f"    {ch_id}: {ch['targetCount']} targets, {ch['uniqueContentLemmas']} unique content lemmas")

    return lemma_info


# ================================================================
# PART B: Glossary
# ================================================================

def query_whitakers(word):
    try:
        resp = requests.get(WHITAKERS_URL, params={"query": word}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                return data.get("message", "")
    except:
        pass
    return None


def parse_whitakers_message(message, target_pos_ww):
    """Parse Whitaker's raw message, extract headword-level entries matching target POS."""
    if not message:
        return []

    entries = []  # list of {pos, forms, senses, dict_line}
    lines = message.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    current_dict_line = None
    current_pos = None
    current_senses = []

    for line in lines:
        line = line.strip()
        if not line or line == "*":
            continue

        # Dictionary/headword line: has [XXXXX] bracket
        dict_match = re.match(
            r'^(.+?)\s+(V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s+(?:\((\w+)\))?\s*(.*?)\s*\[',
            line
        )
        if dict_match:
            # Save previous entry
            if current_dict_line is not None:
                entries.append({
                    "pos": current_pos,
                    "dict_line": current_dict_line,
                    "senses": current_senses,
                })
            current_dict_line = line
            current_pos = dict_match.group(2)
            current_senses = []
            continue

        # Inflection line (has dots, morphological codes) — skip
        if re.match(r'^\S+\s+(V|N|ADJ|ADV|PREP|PRON|NUM)\s+\d', line):
            continue

        # Sense line
        if current_dict_line is not None:
            current_senses.append(line)

    # Save last
    if current_dict_line is not None:
        entries.append({
            "pos": current_pos,
            "dict_line": current_dict_line,
            "senses": current_senses,
        })

    # Filter to target POS
    matching = [e for e in entries if e["pos"] == target_pos_ww]
    return matching


def clean_gloss(text):
    if not text:
        return ""
    text = re.sub(r'\([^)]*\)', '', text)
    text = re.sub(r'\b(Cic|Caes|Verg|Hor|Ov|Liv|Tac|Naev|Plaut|Ter|L\+S)\.\s*', '', text)
    text = re.sub(r'\[.*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.rstrip(";:,. ")
    return text


def extract_forms(dict_line):
    match = re.match(r'^(.+?)\s+(?:V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s', dict_line)
    if match:
        forms_str = match.group(1).strip()
        forms = [f.strip() for f in forms_str.split(",") if f.strip() and f.strip() != "-"]
        return forms
    return []


def extract_gender(dict_line):
    match = re.search(r'\(\w+\)\s+(M|F|C|N)\s', dict_line)
    if match:
        return {"M": "masculine", "F": "feminine", "C": "common", "N": "neuter"}.get(match.group(1))
    return None


def build_entry_from_whitakers(lemma, matching_entries, target_pos_ww):
    schema_pos = WW_TO_SCHEMA.get(target_pos_ww, "unknown")

    # Merge forms (take most complete)
    all_forms = []
    for e in matching_entries:
        forms = extract_forms(e["dict_line"])
        if len(forms) > len(all_forms):
            all_forms = forms

    # Merge senses
    all_glosses = []
    seen = set()
    for e in matching_entries:
        for line in e["senses"]:
            for part in line.split(";"):
                cleaned = clean_gloss(part)
                if cleaned and len(cleaned) >= 2 and cleaned.lower() not in seen:
                    seen.add(cleaned.lower())
                    all_glosses.append(cleaned)
    glosses = all_glosses[:5]

    dictionary = {"pos": schema_pos}
    if schema_pos == "verb" and all_forms:
        dictionary["principal_parts"] = all_forms
    elif schema_pos == "noun" and all_forms:
        dictionary["nom_sg"] = all_forms[0] if all_forms else lemma
        if len(all_forms) > 1:
            dictionary["gen_sg"] = all_forms[1]
        for e in matching_entries:
            g = extract_gender(e["dict_line"])
            if g:
                dictionary["gender"] = g
                break
    elif schema_pos == "adjective" and all_forms:
        dictionary["forms"] = all_forms

    # Build dictionary_entry string
    if all_forms:
        dictionary_entry = ", ".join(all_forms)
    else:
        dictionary_entry = lemma

    return {
        "dictionary": dictionary,
        "dictionary_entry": dictionary_entry,
        "glosses": glosses,
        "source": "WhitakersWords",
        "source_key": lemma,
    }


def build_glossary(ud, lemma_info):
    caesar_gloss = load_caesar_glossary()
    caesar_norm = {}
    for k, v in caesar_gloss.items():
        caesar_norm[normalize_uv(k)] = (k, v)

    # Collect all unique lemmas from UD
    all_lemmas = set()
    upos_counts = defaultdict(lambda: defaultdict(int))  # lemma -> {upos: count}

    chapters = ud.get("chapters", {})
    for ch_id, sents in chapters.items():
        for sent in sents:
            for tok in sent.get("tokens", []):
                lemma = (tok.get("lemma") or "").strip().lower()
                upos = tok.get("upos", "")
                if lemma and len(lemma) >= 2 and upos not in ("PUNCT", "SYM"):
                    all_lemmas.add(lemma)
                    upos_counts[lemma][upos] += 1

    print(f"  Total unique lemmas to process: {len(all_lemmas)}")

    glossary = {}
    from_caesar = 0
    from_whitakers = 0
    needs_review = 0
    review_list = []

    sorted_lemmas = sorted(all_lemmas)
    total = len(sorted_lemmas)

    for idx, lemma in enumerate(sorted_lemmas):
        if (idx + 1) % 100 == 0:
            print(f"    [{idx+1}/{total}] (caesar={from_caesar} ww={from_whitakers} review={needs_review})")

        lemma_norm = normalize_uv(lemma)

        # Step 1: Check Caesar glossary
        if lemma_norm in caesar_norm:
            orig_key, orig_entry = caesar_norm[lemma_norm]
            entry = dict(orig_entry)
            entry["source"] = "FromCaesar"
            entry["source_key"] = orig_key
            glossary[lemma] = entry
            from_caesar += 1
            continue

        # Also check exact key
        if lemma in caesar_gloss:
            entry = dict(caesar_gloss[lemma])
            entry["source"] = "FromCaesar"
            entry["source_key"] = lemma
            glossary[lemma] = entry
            from_caesar += 1
            continue

        # Step 2: Query Whitaker's
        # Determine target POS
        upos_dist = upos_counts.get(lemma, {})
        most_common_upos = max(upos_dist, key=upos_dist.get) if upos_dist else "NOUN"
        target_ww = UPOS_TO_WW.get(most_common_upos, "N")

        raw = query_whitakers(lemma)
        time.sleep(0.15)

        if raw and raw.strip() and raw.strip() != "*":
            matching = parse_whitakers_message(raw, target_ww)
            if matching:
                entry = build_entry_from_whitakers(lemma, matching, target_ww)
                if entry["glosses"] and any(len(g) >= 2 for g in entry["glosses"]):
                    glossary[lemma] = entry
                    from_whitakers += 1
                    continue

        # Step 3: Needs manual review
        schema_pos = WW_TO_SCHEMA.get(target_ww, "unknown")
        glossary[lemma] = {
            "dictionary": {"pos": schema_pos},
            "dictionary_entry": lemma,
            "glosses": ["[NEEDS REVIEW]"],
            "source": "NeedsManualReview",
            "source_key": lemma,
        }
        needs_review += 1
        review_list.append({
            "lemma": lemma,
            "upos": most_common_upos,
            "count": sum(upos_dist.values()),
        })

    # Sanity filter
    for lemma, entry in glossary.items():
        glosses = entry.get("glosses", [])
        if not glosses or all(not g.strip() for g in glosses):
            entry["source"] = "NeedsManualReview"
            entry["glosses"] = ["[NEEDS REVIEW]"]
            if not any(r["lemma"] == lemma for r in review_list):
                review_list.append({"lemma": lemma, "upos": "?", "count": 0})
                needs_review += 1

    # Write glossary
    with open(OUTPUT_GLOSSARY, "w", encoding="utf-8") as f:
        json.dump(glossary, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {OUTPUT_GLOSSARY} ({len(glossary)} entries)")

    # Write review file
    os.makedirs(os.path.dirname(OUTPUT_REVIEW), exist_ok=True)
    review_list.sort(key=lambda x: -x["count"])
    with open(OUTPUT_REVIEW, "w", encoding="utf-8") as f:
        json.dump(review_list, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {OUTPUT_REVIEW} ({len(review_list)} entries)")

    return from_caesar, from_whitakers, needs_review, review_list


def verify(lemma_info, from_caesar, from_whitakers, needs_review, review_list):
    print("\n" + "=" * 70)
    print("VERIFICATION")
    print("=" * 70)

    # Load generated files
    with open(OUTPUT_GLOSSARY) as f:
        glossary = json.load(f)
    with open(OUTPUT_VOCAB) as f:
        vocab = json.load(f)

    # 1. Glossary breakdown
    print(f"\n1. Glossary entries by source:")
    print(f"   FromCaesar:        {from_caesar}")
    print(f"   WhitakersWords:    {from_whitakers}")
    print(f"   NeedsManualReview: {needs_review}")
    print(f"   TOTAL:             {len(glossary)}")

    # 2. Vocab targets per chapter
    print(f"\n2. Vocab targets per chapter:")
    for ch_id in LETTER_ORDER:
        ch = vocab["by_chapter"][ch_id]
        print(f"   {ch_id}: {ch['targetCount']} targets")

    # 3. Sample entries
    print(f"\n3. Sample entries by source:")
    by_source = defaultdict(list)
    for lemma, entry in glossary.items():
        by_source[entry.get("source", "?")].append((lemma, entry))

    for source in ["FromCaesar", "WhitakersWords", "NeedsManualReview"]:
        entries = by_source.get(source, [])
        print(f"\n   --- {source} ({len(entries)} total) ---")
        import random
        random.seed(42)
        samples = random.sample(entries, min(3, len(entries)))
        for lemma, entry in samples:
            print(f"   [{lemma}]")
            print(f"     dictionary_entry: {entry.get('dictionary_entry', '')}")
            print(f"     glosses: {entry.get('glosses', [])}")
            d = entry.get("dictionary", {})
            print(f"     pos: {d.get('pos', '?')}")
            if d.get("principal_parts"):
                print(f"     principal_parts: {d['principal_parts']}")

    # 4. Top 10 Pliny-specific lemmas (not from Caesar)
    print(f"\n4. Top 10 Pliny-specific (non-Caesar) lemmas:")
    pliny_specific = []
    for lemma, info in lemma_info.items():
        norm = normalize_uv(lemma)
        entry = glossary.get(lemma, {})
        if entry.get("source") != "FromCaesar":
            pliny_specific.append((lemma, info["count"], info["upos"],
                                   entry.get("glosses", ["?"])[0][:40]))
    pliny_specific.sort(key=lambda x: -x[1])
    for lemma, count, upos, gloss in pliny_specific[:10]:
        print(f"   {lemma:20s} x{count:3d} ({upos:5s}) — {gloss}")

    # 5. NeedsManualReview
    print(f"\n5. NeedsManualReview lemmas ({len(review_list)} total):")
    for r in review_list[:50]:
        print(f"   {r['lemma']:20s} x{r['count']:3d} ({r['upos']})")
    if len(review_list) > 50:
        print(f"   ... and {len(review_list) - 50} more")


def main():
    print("=" * 70)
    print("PLINY VOCABULARY & GLOSSARY BUILD")
    print("=" * 70)

    print("\nLoading UD data...")
    ud = load_ud()

    print("\nPART A: Building chapter vocab...")
    lemma_info = build_chapter_vocab(ud)

    print("\nPART B: Building glossary...")
    from_caesar, from_whitakers, needs_review, review_list = build_glossary(ud, lemma_info)

    verify(lemma_info, from_caesar, from_whitakers, needs_review, review_list)


if __name__ == "__main__":
    main()
