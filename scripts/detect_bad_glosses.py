#!/usr/bin/env python3
"""
Phase 1: Detect broken entries in caesar_lemma_glosses_MASTER.json.
Outputs a report to scripts/output/bad_entries_report.json.
"""

import json
import re
import os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_PATH = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.json")
VOCAB_PATH = os.path.join(BASE, "server", "data", "caesar", "dbg1_chapter_vocab_ok.json")
OUTPUT_PATH = os.path.join(BASE, "scripts", "output", "bad_entries_report.json")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_upos_map(vocab):
    """Build {lemma: upos} from dbg1_chapter_vocab_ok.json by_chapter entries."""
    upos_map = {}
    by_chapter = vocab.get("by_chapter", {})
    for ch_key, ch_data in by_chapter.items():
        targets = ch_data.get("targets", [])
        for t in targets:
            lemma = t.get("lemma", "").strip().lower()
            upos = t.get("upos", "").strip()
            if lemma and upos:
                upos_map[lemma] = upos
    return upos_map


def normalize_uv(s):
    """Replace v with u for UV comparison."""
    return s.replace("v", "u")


# --- Issue detectors ---

UPOS_TO_POS = {
    "VERB": "verb",
    "NOUN": "noun",
    "ADJ": "adjective",
    "ADV": "adv",
    "PROPN": "noun",
}


def check_pos_mismatch(lemma, entry, upos_map):
    """POS_MISMATCH: upos from vocab disagrees with master.dictionary.pos."""
    if lemma not in upos_map:
        return False
    upos = upos_map[lemma]
    expected_pos = UPOS_TO_POS.get(upos)
    if not expected_pos:
        return False
    dictionary = entry.get("dictionary", {})
    if not dictionary or not isinstance(dictionary, dict):
        return False
    master_pos = str(dictionary.get("pos", "")).strip().lower()
    if not master_pos:
        return False
    return master_pos != expected_pos


def check_bogus_pp(lemma, entry):
    """BOGUS_PP: principal_parts look auto-generated/bogus."""
    dictionary = entry.get("dictionary", {})
    if not dictionary or not isinstance(dictionary, dict):
        return False
    pps = dictionary.get("principal_parts", [])
    if not pps or not isinstance(pps, list):
        return False
    if len(pps) < 2:
        return False

    # Check PP2: should NOT be lemma + "ere"/"are"/"ire" (that's naive concatenation)
    # Real PP2 is formed from the STEM. E.g., "abstineo" stem="abstine" -> PP2="abstinere"
    # Bogus would be "abstineo" + "ere" = "abstineoere" (doubled vowel)
    pp2 = str(pps[1]).strip().lower() if len(pps) > 1 else ""
    if pp2:
        for suffix in ["ere", "are", "ire"]:
            bogus_form = lemma + suffix
            if pp2 == bogus_form:
                # This is bogus IF the lemma already ends in a vowel that creates doubling
                # e.g., "abstineo" + "ere" = "abstineoere" (bad)
                # But "duc" + "ere" = "ducere" (fine - that's stem + ending)
                # The key indicator: if lemma ends in a vowel and the suffix starts,
                # creating a vowel cluster that wouldn't exist in real Latin
                if lemma.endswith(("a", "e", "i", "o", "u")):
                    return True

    # Check PP4: doubled stem patterns
    if len(pps) > 3:
        pp4 = str(pps[3]).strip().lower()
        # Look for repeated substrings suggesting concatenation errors
        if len(pp4) > 6:
            # Check if any substring of length >= 3 appears twice consecutively
            for i in range(len(pp4) - 5):
                chunk = pp4[i:i+3]
                if chunk in pp4[i+3:i+6]:
                    # Potential doubling - verify it's not a legitimate pattern
                    if pp4.count(chunk) >= 2 and len(set(chunk)) > 1:
                        return True

    # Check: any PP contains lemma as substring followed by another full ending
    endings = ["um", "us", "ere", "are", "ire", "isse", "tum", "sum", "atum", "itum"]
    for pp in pps[1:]:  # skip PP1 which IS the lemma
        pp_lower = str(pp).strip().lower()
        if pp_lower.startswith(lemma) and len(pp_lower) > len(lemma):
            remainder = pp_lower[len(lemma):]
            # If remainder starts with a vowel and lemma ends with a vowel = likely bogus
            if (lemma.endswith(("a", "e", "i", "o", "u")) and
                remainder.startswith(("a", "e", "i", "o", "u"))):
                return True

    return False


DIRTY_PATTERNS = [
    lambda g: "Ritschl" in g,
    lambda g: "Naev." in g,
    lambda g: "syn.:" in g,
    lambda g: "(class.)" in g,
    lambda g: "(coinciding" in g,
    lambda g: "Caesar Running Vocabulary" in g,
    lambda g: bool(re.search(r'\d[a-zA-Z]?$', g.strip())),  # ends in digit or digit+letter
    lambda g: g.strip() == "Act.",
    lambda g: g.strip() == "",
    lambda g: g.strip().startswith("the condition or quality of"),
    lambda g: g.strip().startswith("the 30th year"),
]


def check_dirty_gloss(lemma, entry):
    """DIRTY_GLOSS: glosses contain known garbage patterns."""
    glosses = entry.get("glosses", [])
    if not glosses:
        return False
    for g in glosses:
        g_str = str(g)
        for pattern_fn in DIRTY_PATTERNS:
            if pattern_fn(g_str):
                return True
    return False


def check_stub_gloss(lemma, entry):
    """STUB_GLOSS: only gloss is < 4 chars, or all glosses are tiny fragments."""
    glosses = entry.get("glosses", [])
    if not glosses:
        return True  # no glosses at all = stub

    # Single gloss shorter than 4 chars
    if len(glosses) == 1 and len(str(glosses[0]).strip()) < 4:
        return True

    # All glosses are single fragments (all < 4 chars)
    if all(len(str(g).strip()) < 4 for g in glosses):
        return True

    return False


def check_duplicate_uv(lemma, all_lemmas_set, upos_map):
    """
    DUPLICATE_UV: lemma has a u/v variant also in the file.
    Flag the one NOT in upos_map. If both or neither are in map, flag neither.
    """
    normalized = normalize_uv(lemma)
    # Find other lemmas that normalize to the same thing
    # We'll do this in the main loop more efficiently
    return False  # placeholder, handled in main


def main():
    print("Loading master glosses...")
    master = load_json(MASTER_PATH)
    print(f"  {len(master)} entries loaded.")

    print("Loading chapter vocab...")
    vocab = load_json(VOCAB_PATH)
    upos_map = build_upos_map(vocab)
    print(f"  {len(upos_map)} lemma→upos mappings built.")

    # Build UV normalization index for DUPLICATE_UV check
    uv_groups = defaultdict(list)
    for lemma in master.keys():
        norm = normalize_uv(lemma.lower())
        uv_groups[norm].append(lemma)

    # Iterate and flag
    flagged = {}
    caesar_core_count = 0
    issue_counts = defaultdict(int)

    all_lemmas = set(master.keys())

    for lemma, entry in master.items():
        # SKIP CaesarCore entries entirely
        source = entry.get("source", "")
        if source == "CaesarCore":
            caesar_core_count += 1
            continue

        issues = []

        # POS_MISMATCH
        if check_pos_mismatch(lemma.lower(), entry, upos_map):
            issues.append("POS_MISMATCH")

        # BOGUS_PP
        if check_bogus_pp(lemma.lower(), entry):
            issues.append("BOGUS_PP")

        # DIRTY_GLOSS
        if check_dirty_gloss(lemma, entry):
            issues.append("DIRTY_GLOSS")

        # STUB_GLOSS
        if check_stub_gloss(lemma, entry):
            issues.append("STUB_GLOSS")

        # DUPLICATE_UV
        norm = normalize_uv(lemma.lower())
        group = uv_groups[norm]
        if len(group) > 1:
            # Flag the one NOT in upos_map
            lemma_lower = lemma.lower()
            in_map = lemma_lower in upos_map
            others_in_map = any(other.lower() in upos_map for other in group if other != lemma)

            if not in_map and others_in_map:
                issues.append("DUPLICATE_UV")
            # If both or neither in map, don't flag either

        if issues:
            for iss in issues:
                issue_counts[iss] += 1
            flagged[lemma] = {
                "issues": issues,
                "current": entry,
                "upos_from_vocab": upos_map.get(lemma.lower(), None),
            }

    # Build report
    report = {
        "summary": {
            "total_entries": len(master),
            "caesar_core_skipped": caesar_core_count,
            "flagged": len(flagged),
            "by_issue": dict(issue_counts),
        },
        "entries": flagged,
    }

    # Write report
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Print summary
    print("\n" + "=" * 60)
    print("DETECTION REPORT SUMMARY")
    print("=" * 60)
    print(f"Total entries in master:    {report['summary']['total_entries']}")
    print(f"CaesarCore (skipped):       {report['summary']['caesar_core_skipped']}")
    print(f"Entries flagged:            {report['summary']['flagged']}")
    print(f"\nBreakdown by issue:")
    for issue, count in sorted(issue_counts.items()):
        print(f"  {issue:20s} {count}")
    print(f"\nReport written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
