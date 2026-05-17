#!/usr/bin/env python3
"""
Comprehensive lemma correction sweep.
Cross-checks Stanza-parsed tokens against Whitaker's Words API.
"""

import json
import os
import re
import time
import requests
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UD_PATH = os.path.join(BASE, "server", "data", "caesar", "dbg1_ud.json")
GLOSSARY_PATH = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.json")
VOCAB_PATH = os.path.join(BASE, "server", "data", "caesar", "dbg1_chapter_vocab_ok.json")
OUTPUT_CORRECTIONS = os.path.join(BASE, "scripts", "output", "lemma_corrections_proposed.json")
OUTPUT_REPORT = os.path.join(BASE, "scripts", "output", "lemma_sweep_report.json")

WHITAKERS_URL = "https://latin-words.com/cgi-bin/translate.cgi"

SKIP_UPOS = {"PUNCT", "X", "SYM", "NUM"}


def normalize_uv(s):
    """Normalize u/v for comparison."""
    return s.lower().replace("v", "u")


def extract_lemmas_from_whitakers(message):
    """
    Extract all candidate lemmas from Whitaker's raw message.
    Each dictionary line starts with "headword, ..." followed by POS code.
    Returns list of (lemma, pos_code) tuples.
    """
    if not message:
        return []

    results = []
    lines = message.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    for line in lines:
        # Dictionary line pattern: "lemma, form2, form3...  POS (decl/conj) ..."
        # e.g., "duco, ducere, duxi, ductus  V (3rd)   [XXXAX]"
        # e.g., "rex, regis  N (3rd) M   [XLXAX]"
        match = re.match(
            r'^([A-Za-z][A-Za-z\s,.\-()]+?)\s+(V|N|ADJ|ADV|PREP|PRON|CONJ|INTERJ|NUM)\s',
            line
        )
        if match:
            forms_str = match.group(1).strip()
            pos = match.group(2)
            # First form before comma is the lemma
            parts = forms_str.split(",")
            lemma = parts[0].strip()
            # Clean up: remove any trailing dots or parens
            lemma = re.sub(r'[.\s]+$', '', lemma)
            if lemma and len(lemma) >= 2:
                results.append((lemma, pos))

    return results


def query_whitakers(form):
    """Query Whitaker's API. Returns raw message or None."""
    try:
        resp = requests.get(WHITAKERS_URL, params={"query": form}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                return data.get("message", "")
    except Exception as e:
        pass
    return None


# POS mapping: Whitaker's -> upos
WW_TO_UPOS = {
    "V": "VERB",
    "N": "NOUN",
    "ADJ": "ADJ",
    "ADV": "ADV",
    "PREP": "ADP",
    "PRON": "PRON",
    "CONJ": "CCONJ",
    "NUM": "NUM",
}


def main():
    print("Loading data files...")
    with open(UD_PATH, "r", encoding="utf-8") as f:
        ud = json.load(f)
    with open(GLOSSARY_PATH, "r", encoding="utf-8") as f:
        glossary = json.load(f)
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        vocab = json.load(f)

    # Build glossary lookup set (normalized u/v)
    glossary_lemmas = set()
    for k in glossary.keys():
        glossary_lemmas.add(normalize_uv(k))

    # Build PROPN set from vocab
    propn_lemmas = set()
    for ch_data in vocab.get("by_chapter", {}).values():
        for t in ch_data.get("targets", []):
            if t.get("upos") == "PROPN":
                propn_lemmas.add(t.get("lemma", "").lower())

    # Step 1: Collect unique (form, lemma, upos) pairs with occurrence counts
    print("Scanning UD tokens...")
    pair_counts = defaultdict(int)  # (form_lower, lemma_lower) -> count
    pair_upos = {}  # (form_lower, lemma_lower) -> upos

    chapters = ud.get("chapters", {})
    total_tokens = 0
    for ch_key, sents in chapters.items():
        for sent in sents:
            for t in (sent.get("tokens") or []):
                total_tokens += 1
                form = str(t.get("form") or t.get("text") or "").strip()
                lemma = str(t.get("lemma") or "").strip()
                upos = str(t.get("upos") or "").strip()

                if not form or not lemma:
                    continue
                if upos in SKIP_UPOS:
                    continue
                if len(form) < 2:
                    continue
                # Skip purely uppercase (but we'll handle proper nouns in categorization)
                if form.isupper():
                    continue

                key = (form.lower(), lemma.lower())
                pair_counts[key] += 1
                pair_upos[key] = upos

    unique_pairs = list(pair_counts.keys())
    print(f"  Total tokens scanned: {total_tokens}")
    print(f"  Unique (form, lemma) pairs: {len(unique_pairs)}")

    # Step 2-4: Query Whitaker's and categorize
    print("\nQuerying Whitaker's Words API...")
    print("  (This will take a few minutes for large batches)")

    # Cache Whitaker's results by form to avoid re-querying
    whitakers_cache = {}  # form -> [(lemma, pos), ...]

    corrections = {}  # "form|old_lemma" -> {old, new, occurrences, whitakers_options}
    manual_review = []
    matches = 0
    mismatches = 0
    unknown = 0
    skipped_propn = 0
    skipped_not_in_glossary = 0

    total = len(unique_pairs)
    for idx, (form, stanza_lemma) in enumerate(unique_pairs):
        if (idx + 1) % 100 == 0:
            print(f"  [{idx+1}/{total}] form='{form}' (corrections so far: {len(corrections)})")

        upos = pair_upos.get((form, stanza_lemma), "")
        occurrences = pair_counts[(form, stanza_lemma)]

        # Check if it's a proper noun
        if form[0].isupper() or (upos == "PROPN"):
            if stanza_lemma in propn_lemmas:
                skipped_propn += 1
                continue

        # Query Whitaker's (use cache)
        if form not in whitakers_cache:
            raw = query_whitakers(form)
            time.sleep(0.15)  # rate limit
            if raw and raw.strip() and raw.strip() != "*":
                whitakers_cache[form] = extract_lemmas_from_whitakers(raw)
            else:
                whitakers_cache[form] = None  # mark as unknown

        ww_result = whitakers_cache[form]

        if ww_result is None:
            # Whitaker's returned nothing
            unknown += 1
            if occurrences >= 2:
                manual_review.append({
                    "form": form,
                    "stanza_lemma": stanza_lemma,
                    "reason": "whitakers_unknown",
                    "occurrences": occurrences,
                })
            continue

        if not ww_result:
            unknown += 1
            continue

        # Extract lemma set from Whitaker's (normalized u/v)
        ww_lemmas_normalized = set(normalize_uv(lem) for lem, pos in ww_result)
        ww_lemmas_raw = [(lem, pos) for lem, pos in ww_result]

        # Compare: is Stanza's lemma in Whitaker's set?
        stanza_norm = normalize_uv(stanza_lemma)
        if stanza_norm in ww_lemmas_normalized:
            matches += 1
            continue

        # MISMATCH: Stanza's lemma not recognized by Whitaker's for this form
        mismatches += 1

        # Choose the best correction
        # Priority: (a) in glossary, (b) POS matches token's upos, (c) first
        candidates = []
        for ww_lem, ww_pos in ww_lemmas_raw:
            ww_lem_norm = normalize_uv(ww_lem)
            in_glossary = ww_lem_norm in glossary_lemmas
            # Also check the raw form in glossary (some entries use v)
            in_glossary = in_glossary or (ww_lem.lower() in glossary) or (ww_lem_norm in glossary_lemmas)
            pos_matches = (WW_TO_UPOS.get(ww_pos, "") == upos)
            candidates.append({
                "lemma": ww_lem.lower(),
                "lemma_norm": ww_lem_norm,
                "pos": ww_pos,
                "in_glossary": in_glossary,
                "pos_matches": pos_matches,
            })

        # Sort: in_glossary first, then pos_matches, then by order
        candidates.sort(key=lambda c: (not c["in_glossary"], not c["pos_matches"]))

        if not candidates:
            unknown += 1
            continue

        best = candidates[0]
        corrected_lemma = best["lemma"]
        corrected_norm = best["lemma_norm"]

        # Skip if same after normalization
        if corrected_norm == stanza_norm:
            matches += 1
            continue

        # Skip if corrected lemma not in glossary (would break lookup)
        if not best["in_glossary"]:
            skipped_not_in_glossary += 1
            if occurrences >= 2:
                manual_review.append({
                    "form": form,
                    "stanza_lemma": stanza_lemma,
                    "reason": "target_not_in_glossary",
                    "occurrences": occurrences,
                    "whitakers_suggestion": corrected_lemma,
                })
            continue

        # Find the actual glossary key to use (may differ in u/v from Whitaker's)
        # Use whichever form is actually in the glossary
        actual_key = corrected_lemma
        if corrected_lemma not in glossary:
            # Try u/v variants
            for gk in glossary.keys():
                if normalize_uv(gk) == corrected_norm:
                    actual_key = gk.lower()
                    break

        correction_key = f"{form}|{stanza_lemma}"
        corrections[correction_key] = {
            "old": stanza_lemma,
            "new": actual_key,
            "occurrences": occurrences,
            "upos": upos,
            "whitakers_options": [f"{c['lemma']} ({c['pos']})" for c in candidates[:5]],
        }

    # Step 5: Write outputs
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"  Unique pairs checked:           {total}")
    print(f"  Matches (Stanza correct):       {matches}")
    print(f"  Corrections proposed:           {len(corrections)}")
    print(f"  Whitaker's unknown:             {unknown}")
    print(f"  Skipped (PROPN):                {skipped_propn}")
    print(f"  Skipped (target not in gloss):  {skipped_not_in_glossary}")

    # Sort corrections by occurrence count
    sorted_corrections = dict(
        sorted(corrections.items(), key=lambda x: x[1]["occurrences"], reverse=True)
    )

    # Write proposed corrections file
    proposed = {
        "_comment": "Proposed lemma corrections from sweep. Merge into lemma_corrections.json after review.",
        "corrections": {k: v["new"] for k, v in sorted_corrections.items()}
    }
    with open(OUTPUT_CORRECTIONS, "w", encoding="utf-8") as f:
        json.dump(proposed, f, indent=2, ensure_ascii=False)

    # Write full report
    report = {
        "summary": {
            "unique_pairs_checked": total,
            "matches": matches,
            "corrections_proposed": len(corrections),
            "whitakers_unknown": unknown,
            "skipped_propn": skipped_propn,
            "skipped_target_not_in_glossary": skipped_not_in_glossary,
        },
        "corrections": sorted_corrections,
        "manual_review_needed": sorted(manual_review, key=lambda x: x["occurrences"], reverse=True),
    }
    with open(OUTPUT_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n  Proposed corrections: {OUTPUT_CORRECTIONS}")
    print(f"  Full report:          {OUTPUT_REPORT}")

    # Print top 20 corrections by occurrence
    print(f"\n  Top 20 corrections by occurrence count:")
    for i, (key, val) in enumerate(list(sorted_corrections.items())[:20]):
        print(f"    {key:30s} -> {val['new']:15s} (x{val['occurrences']}) ww={val['whitakers_options'][:3]}")


if __name__ == "__main__":
    main()
