#!/usr/bin/env python3
"""
Phase 2: Generate patches for flagged entries using Whitaker's Words API.
Reads bad_entries_report.json, queries Whitaker's, outputs patches.json.
"""

import json
import os
import re
import time
import random
import requests
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_PATH = os.path.join(BASE, "scripts", "output", "bad_entries_report.json")
OUTPUT_PATH = os.path.join(BASE, "scripts", "output", "patches.json")

WHITAKERS_URL = "https://latin-words.com/cgi-bin/translate.cgi"

# POS mapping: upos -> Whitaker's POS code
UPOS_TO_WW = {
    "VERB": "V",
    "NOUN": "N",
    "ADJ": "ADJ",
    "ADV": "ADV",
    "PROPN": "N",
}

# Whitaker's POS code -> our schema pos
WW_TO_SCHEMA = {
    "V": "verb",
    "N": "noun",
    "ADJ": "adjective",
    "ADV": "adv",
    "PREP": "preposition",
    "PRON": "pronoun",
    "CONJ": "conjunction",
    "INTERJ": "interjection",
    "NUM": "numeral",
}

# Our schema pos -> Whitaker's POS code (reverse for fallback)
SCHEMA_TO_WW = {v: k for k, v in WW_TO_SCHEMA.items()}


def query_whitakers(lemma):
    """Query the Whitaker's Words API. Returns raw message string or None."""
    try:
        resp = requests.get(WHITAKERS_URL, params={"query": lemma}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                return data.get("message", "")
    except Exception as e:
        print(f"    [WARN] API error for '{lemma}': {e}")
    return None


def parse_whitakers_message(message):
    """
    Parse the raw Whitaker's message into structured parse blocks.
    Each block has: pos, dictionary_line, senses, inflection_lines.
    """
    if not message:
        return []

    lines = message.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    parses = []
    current_infl_lines = []
    current_dict_line = None
    current_senses = []
    current_pos = None

    i = 0
    while i < len(lines):
        line = lines[i]

        # Dictionary line pattern: "lemma, forms  POS (declension/conjugation) ..."
        # e.g., "concido, concidere, concidi, concisus  V (3rd) TRANS   [XXXBO]"
        # e.g., "hostis, hostis  N (3rd) C   [XXXDX]    lesser"
        # e.g., "fortiter, fortius, fortissime  ADV   [XXXDX]    lesser"
        dict_match = re.match(
            r'^(.+?)\s+(V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s+(?:\((\w+)\))?\s*(.*?)\s*\[',
            line
        )
        if not dict_match:
            # Try without brackets (some entries)
            dict_match = re.match(
                r'^(.+?)\s+(V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s+(?:\((\w+)\))?\s*(.*)',
                line
            )

        if dict_match:
            # Save previous parse if we had one
            if current_dict_line is not None:
                parses.append({
                    "pos": current_pos,
                    "dictionary_line": current_dict_line,
                    "senses": current_senses,
                    "inflection_lines": current_infl_lines,
                })

            current_dict_line = line.strip()
            current_pos = dict_match.group(2)
            current_senses = []
            current_infl_lines = []
            i += 1
            continue

        # Inflection line pattern: starts with word.suffix or word followed by spaces and POS code
        infl_match = re.match(r'^(\S+)\s+(V|N|ADJ|ADV|PREP|PRON|NUM)\s+', line)
        if infl_match and current_dict_line is None:
            current_infl_lines.append(line.strip())
            i += 1
            continue

        # Sense/gloss line: typically starts with lowercase or contains semicolons
        # These come after dictionary lines
        if current_dict_line is not None and line.strip() and not line.strip().startswith("*"):
            # Check if it's another inflection line for a NEW entry
            if re.match(r'^\S+\s+(V|N|ADJ|ADV|PREP|PRON|NUM)\s+\d', line):
                # This is an inflection line for the NEXT entry
                current_infl_lines = [line.strip()]
                # Save current parse
                parses.append({
                    "pos": current_pos,
                    "dictionary_line": current_dict_line,
                    "senses": current_senses,
                    "inflection_lines": current_infl_lines,
                })
                current_dict_line = None
                current_pos = None
                current_senses = []
                current_infl_lines = []
                i += 1
                continue
            else:
                # It's a sense line
                current_senses.append(line.strip())

        i += 1

    # Save last parse
    if current_dict_line is not None:
        parses.append({
            "pos": current_pos,
            "dictionary_line": current_dict_line,
            "senses": current_senses,
            "inflection_lines": current_infl_lines,
        })

    return parses


def normalize_uv(s):
    """Normalize u/v for comparison."""
    return s.lower().replace("v", "u")


def lemma_matches_query(dict_line, query_lemma):
    """
    Check if a dictionary line's headword matches our query lemma.
    Allows u/v normalization. Returns True if:
    - Any form in the dict line matches the query exactly (u/v normalized), OR
    - The query shares a stem with the headword (differs only in ending, max 3 chars)
    """
    forms = extract_forms_from_dict_line(dict_line)
    if not forms:
        return False
    query_norm = normalize_uv(query_lemma)

    for form in forms:
        form_clean = form.replace(".", "").strip()
        form_norm = normalize_uv(form_clean)
        # Exact match
        if form_norm == query_norm:
            return True

    # Stem-based match: allow if query and first form share a common prefix
    # that is at least 70% of the longer word (handles impetum/impetus, bracchio/bracchium)
    first_norm = normalize_uv(forms[0].replace(".", ""))
    min_len = min(len(query_norm), len(first_norm))
    if min_len < 3:
        return False
    # Find common prefix length
    prefix_len = 0
    for a, b in zip(query_norm, first_norm):
        if a == b:
            prefix_len += 1
        else:
            break
    max_len = max(len(query_norm), len(first_norm))
    # Require prefix to be at least 70% of the longer form and at least 4 chars
    if prefix_len >= 4 and prefix_len / max_len >= 0.7:
        return True

    return False


def extract_forms_from_dict_line(dict_line):
    """Extract the comma-separated forms from the beginning of a dictionary line."""
    # Everything before the POS code
    match = re.match(r'^(.+?)\s+(?:V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s', dict_line)
    if match:
        forms_str = match.group(1).strip()
        # Split by comma, clean up
        forms = [f.strip() for f in forms_str.split(",") if f.strip()]
        # Remove trailing "-" entries
        forms = [f for f in forms if f != "-"]
        return forms
    return []


def extract_gender(dict_line):
    """Extract gender from dictionary line (M, F, C, N after declension)."""
    match = re.search(r'\(\w+\)\s+(M|F|C|N)\s', dict_line)
    if match:
        gender_map = {"M": "masculine", "F": "feminine", "C": "common", "N": "neuter"}
        return gender_map.get(match.group(1), match.group(1))
    return None


def extract_transitivity(dict_line):
    """Extract TRANS/INTRANS/DEP from verb dictionary line."""
    if "TRANS" in dict_line and "INTRANS" not in dict_line:
        return "transitive"
    elif "INTRANS" in dict_line:
        return "intransitive"
    elif "DEP" in dict_line:
        return "deponent"
    return None


def clean_gloss(text):
    """Clean a gloss string: remove citations, trailing punctuation, parenthetical refs."""
    if not text:
        return ""
    # Remove parenthetical citations like (Cic.), (class.), (syn.: ...)
    text = re.sub(r'\([^)]*\)', '', text)
    # Remove specific citation patterns
    text = re.sub(r'\b(Cic|Caes|Verg|Hor|Ov|Liv|Tac|Naev|Plaut|Ter)\.\s*', '', text)
    # Clean up whitespace and trailing punctuation
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.rstrip(";:,. ")
    return text


def is_suffix_junk(text):
    """Detect Whitaker's suffix/prefix analysis lines that aren't real glosses."""
    t = text.strip().lower()
    junk_patterns = [
        "suffix", "prefix",
        "the action or result of",
        "the condition or quality of",
        "-ing,", "-ion,", "-ery,", "-ness,", "-ment,",
        "having the quality of",
        "that which", "one who",
    ]
    for p in junk_patterns:
        if p in t:
            return True
    # Single word that looks like a grammatical label
    if t in ("io", "or", "er", "us", "um", "is", "as", "es"):
        return True
    return False


def parse_senses(senses_lines):
    """Parse sense lines into clean glosses list."""
    glosses = []
    for line in senses_lines:
        # Split by semicolons
        parts = line.split(";")
        for part in parts:
            cleaned = clean_gloss(part)
            if cleaned and len(cleaned) >= 2 and not is_suffix_junk(cleaned):
                glosses.append(cleaned)
    # Deduplicate preserving order
    seen = set()
    deduped = []
    for g in glosses:
        g_lower = g.lower()
        if g_lower not in seen:
            seen.add(g_lower)
            deduped.append(g)
    return deduped[:5]  # max 5


def build_entry_from_parses(lemma, matching_parses, target_pos_ww):
    """
    Build a new entry from one or more matching Whitaker's parses.
    Merges multiple parses of the same POS.
    """
    schema_pos = WW_TO_SCHEMA.get(target_pos_ww, "unknown")

    # Merge forms (principal parts) - take the most complete set
    all_forms = []
    for p in matching_parses:
        forms = extract_forms_from_dict_line(p["dictionary_line"])
        if len(forms) > len(all_forms):
            all_forms = forms

    # Merge senses
    all_senses = []
    for p in matching_parses:
        all_senses.extend(p["senses"])
    glosses = parse_senses(all_senses)

    # Build dictionary sub-object
    dictionary = {"pos": schema_pos}

    if schema_pos == "verb":
        dictionary["principal_parts"] = all_forms
        trans = None
        for p in matching_parses:
            t = extract_transitivity(p["dictionary_line"])
            if t:
                trans = t
                break
        if trans:
            dictionary["transitivity"] = trans

    elif schema_pos == "noun":
        # Forms: typically [nom_sg, gen_sg] like ["hostis", "hostis"]
        if len(all_forms) >= 2:
            dictionary["nom_sg"] = all_forms[0]
            dictionary["gen_sg"] = all_forms[1]
        elif len(all_forms) == 1:
            dictionary["nom_sg"] = all_forms[0]
        # Gender
        for p in matching_parses:
            gender = extract_gender(p["dictionary_line"])
            if gender:
                dictionary["gender"] = gender
                break

    elif schema_pos == "adjective":
        # Forms like ["bonus", "bona -um"] or ["fortis", "forte"]
        dictionary["forms"] = all_forms

    elif schema_pos == "adv":
        dictionary["forms"] = all_forms

    # Build dictionary_entry string
    if schema_pos == "verb" and all_forms:
        dictionary_entry = ", ".join(all_forms)
    elif schema_pos == "noun" and all_forms:
        parts = all_forms[:2]
        gender_str = dictionary.get("gender", "")
        gen_abbr = {"masculine": "m", "feminine": "f", "common": "c", "neuter": "n"}.get(gender_str, "")
        dictionary_entry = ", ".join(parts)
        if gen_abbr:
            dictionary_entry += f" ({gen_abbr}.)"
    elif all_forms:
        dictionary_entry = ", ".join(all_forms)
    else:
        dictionary_entry = lemma

    entry = {
        "dictionary": dictionary,
        "dictionary_entry": dictionary_entry,
        "glosses": glosses,
        "source": "WhitakersWords",
        "source_key": lemma,
    }

    return entry


def validate_entry(entry, schema_pos):
    """
    Empty/weak patch guard. Returns (is_valid, reason) tuple.
    """
    glosses = entry.get("glosses", [])
    if not glosses:
        return False, "whitakers_data_too_thin"
    if not any(len(g) >= 3 for g in glosses):
        return False, "whitakers_data_too_thin"

    dictionary = entry.get("dictionary", {})
    if schema_pos == "verb":
        pps = dictionary.get("principal_parts", [])
        if len(pps) < 2:
            return False, "whitakers_data_too_thin"

    if schema_pos == "noun":
        has_gender = "gender" in dictionary
        has_gen = "gen_sg" in dictionary
        if not has_gender and not has_gen:
            return False, "whitakers_data_too_thin"

    return True, None


def main():
    print("Loading bad entries report...")
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        report = json.load(f)

    entries = report["entries"]
    print(f"  {len(entries)} flagged entries to process.")

    # First, test a few sample parses to confirm field extraction
    print("\n--- Sample Whitaker's parses (verifying structure) ---")
    test_words = [
        ("duco", "V", "verb"),
        ("rex", "N", "noun"),
        ("fortis", "ADJ", "adjective"),
        ("furor", "V", "verb"),  # homonym: verb + noun
    ]
    for word, target_ww, target_schema in test_words:
        raw = query_whitakers(word)
        if raw:
            parses = parse_whitakers_message(raw)
            matching = [p for p in parses if p["pos"] == target_ww]
            print(f"\n  {word} (target={target_ww}): {len(parses)} total parses, {len(matching)} matching")
            for p in matching:
                forms = extract_forms_from_dict_line(p["dictionary_line"])
                print(f"    forms: {forms}")
                print(f"    senses: {p['senses'][:2]}")
        time.sleep(0.3)

    print("\n--- Processing all flagged entries ---")

    patches = {}
    unresolved = []
    pos_counts = defaultdict(int)

    lemma_list = list(entries.keys())
    total = len(lemma_list)

    for idx, lemma in enumerate(lemma_list):
        entry_data = entries[lemma]
        issues = entry_data["issues"]
        current = entry_data["current"]
        upos = entry_data.get("upos_from_vocab")

        if (idx + 1) % 25 == 0 or idx == 0:
            print(f"  [{idx+1}/{total}] Processing '{lemma}'...")

        # Determine target POS
        target_ww = None
        if upos:
            target_ww = UPOS_TO_WW.get(upos)

        if not target_ww:
            # Fallback to current master.dictionary.pos
            curr_pos = current.get("dictionary", {}).get("pos", "")
            target_ww = SCHEMA_TO_WW.get(curr_pos.lower())

        if not target_ww:
            # Can't determine target POS at all
            unresolved.append({"lemma": lemma, "reason": "no_target_pos"})
            continue

        # Query Whitaker's
        raw = query_whitakers(lemma)
        time.sleep(0.2)  # Rate limit

        if not raw or raw.strip() in ("*", ""):
            unresolved.append({"lemma": lemma, "reason": "no_whitakers_result"})
            continue

        # Parse
        parses = parse_whitakers_message(raw)
        if not parses:
            unresolved.append({"lemma": lemma, "reason": "no_whitakers_result"})
            continue

        # Filter to matching POS
        matching = [p for p in parses if p["pos"] == target_ww]

        if not matching:
            available = list(set(p["pos"] for p in parses))
            unresolved.append({
                "lemma": lemma,
                "reason": "no_pos_match",
                "target_pos": target_ww,
                "available_pos": available,
            })
            continue

        # Filter to parses whose headword actually matches our query lemma (u/v safe)
        # This prevents e.g., "repullo" matching "pullus" or "interfacio" matching "facio"
        lemma_matched = [p for p in matching if lemma_matches_query(p["dictionary_line"], lemma)]
        if not lemma_matched:
            # Whitaker's returned parses for a different lemma entirely
            unresolved.append({
                "lemma": lemma,
                "reason": "lemma_mismatch",
                "whitakers_headwords": [extract_forms_from_dict_line(p["dictionary_line"])[0]
                                        for p in matching
                                        if extract_forms_from_dict_line(p["dictionary_line"])],
            })
            continue
        matching = lemma_matched

        # Build merged entry
        new_entry = build_entry_from_parses(lemma, matching, target_ww)
        new_entry["patched_from_issues"] = issues

        # Validate entry (empty/weak patch guard)
        schema_pos = WW_TO_SCHEMA.get(target_ww, "unknown")
        is_valid, fail_reason = validate_entry(new_entry, schema_pos)
        if not is_valid:
            unresolved.append({"lemma": lemma, "reason": fail_reason})
            continue

        patches[lemma] = {
            "old": current,
            "new": new_entry,
            "reason": issues,
            "matched_parses_count": len(matching),
            "whitakers_raw": [p["dictionary_line"] for p in matching],
        }
        pos_counts[schema_pos] += 1

    # Build output
    output = {
        "summary": {
            "patched": len(patches),
            "needs_manual_review": len(unresolved),
            "by_pos": dict(pos_counts),
        },
        "patches": patches,
        "unresolved": unresolved,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Print summary
    print("\n" + "=" * 60)
    print("PATCH GENERATION SUMMARY")
    print("=" * 60)
    print(f"Entries patched:            {len(patches)}")
    print(f"Needs manual review:        {len(unresolved)}")
    print(f"\nBy POS:")
    for pos, count in sorted(pos_counts.items()):
        print(f"  {pos:15s} {count}")
    print(f"\nUnresolved by reason:")
    reason_counts = defaultdict(int)
    for u in unresolved:
        reason_counts[u["reason"]] += 1
    for reason, count in sorted(reason_counts.items()):
        print(f"  {reason:30s} {count}")
    print(f"\nOutput written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
