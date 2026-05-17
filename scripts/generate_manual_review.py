#!/usr/bin/env python3
"""
Generate manual_review.json for unresolved entries.
Cross-references vocab file for context, queries Whitaker's for raw parses.
"""

import json
import os
import time
import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATCHES_PATH = os.path.join(BASE, "scripts", "output", "patches.json")
MASTER_PATH = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.json")
VOCAB_PATH = os.path.join(BASE, "server", "data", "caesar", "dbg1_chapter_vocab_ok.json")
OUTPUT_PATH = os.path.join(BASE, "scripts", "output", "manual_review.json")

WHITAKERS_URL = "https://latin-words.com/cgi-bin/translate.cgi"


def query_whitakers_raw(lemma):
    """Get raw Whitaker's message for a lemma."""
    try:
        resp = requests.get(WHITAKERS_URL, params={"query": lemma}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                return data.get("message", "")
    except:
        pass
    return None


def build_vocab_context(vocab):
    """Build context map from vocab: {lemma: {count, firstChapter, example_form, example_sid}}"""
    context_map = {}
    by_chapter = vocab.get("by_chapter", {})
    for ch_key, ch_data in by_chapter.items():
        targets = ch_data.get("targets", [])
        for t in targets:
            lemma = t.get("lemma", "").strip().lower()
            if not lemma:
                continue
            count = t.get("count", 0)
            first_ch = t.get("firstChapter", int(ch_key) if ch_key.isdigit() else 0)
            example = t.get("example", {})
            context_map[lemma] = {
                "occurrences_in_text": count,
                "first_chapter": first_ch,
                "example_form": example.get("form", ""),
                "example_sid": example.get("sid", ""),
            }
    return context_map


def main():
    print("Loading patches (for unresolved list)...")
    with open(PATCHES_PATH, "r", encoding="utf-8") as f:
        patches_data = json.load(f)

    unresolved = patches_data["unresolved"]
    print(f"  {len(unresolved)} unresolved entries.")

    print("Loading current master...")
    with open(MASTER_PATH, "r", encoding="utf-8") as f:
        master = json.load(f)

    print("Loading vocab for context...")
    with open(VOCAB_PATH, "r", encoding="utf-8") as f:
        vocab = json.load(f)
    context_map = build_vocab_context(vocab)

    # Also load the original report for upos info
    report_path = os.path.join(BASE, "scripts", "output", "bad_entries_report.json")
    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    print("Querying Whitaker's for raw parses on unresolved entries...")
    entries = []
    total = len(unresolved)

    for idx, item in enumerate(unresolved):
        lemma = item["lemma"]
        reason = item["reason"]

        if (idx + 1) % 20 == 0:
            print(f"  [{idx+1}/{total}] {lemma}...")

        # Get current master entry
        current_entry = master.get(lemma, None)

        # Get upos from report
        upos = None
        if lemma in report["entries"]:
            upos = report["entries"][lemma].get("upos_from_vocab")

        # Get context from vocab
        context = context_map.get(lemma.lower(), {
            "occurrences_in_text": 0,
            "first_chapter": 0,
            "example_form": "",
            "example_sid": "",
        })

        # Query Whitaker's for raw output
        raw = query_whitakers_raw(lemma)
        time.sleep(0.2)

        # Parse raw into lines for readability
        whitakers_raw = []
        if raw:
            whitakers_raw = [line.strip() for line in raw.split("\n") if line.strip() and line.strip() != "*"]

        entry = {
            "lemma": lemma,
            "reason": reason,
            "current_master_entry": current_entry,
            "upos_from_vocab": upos,
            "whitakers_raw": whitakers_raw,
            "context": context,
        }

        # Include extra info from the unresolved item
        for key in ("target_pos", "available_pos", "whitakers_headwords"):
            if key in item:
                entry[key] = item[key]

        entries.append(entry)

    # Sort by occurrences descending (highest impact first)
    entries.sort(key=lambda e: e["context"]["occurrences_in_text"], reverse=True)

    # Build summary
    from collections import Counter
    reason_counts = Counter(e["reason"] for e in entries)

    output = {
        "summary": {
            "total": len(entries),
            "by_reason": dict(reason_counts),
        },
        "entries": entries,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Written to: {OUTPUT_PATH}")
    print(f"Total: {len(entries)} entries for manual review.")
    print(f"By reason: {dict(reason_counts)}")


if __name__ == "__main__":
    main()
