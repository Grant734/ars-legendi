#!/usr/bin/env python3
"""
Build the full Pliny pipeline from hand-curated source files.
Generates: pliny_sentences.json, pliny_chapters.json, pliny_translations.json,
           pliny_ud.json, pliny_constructions.json, pliny_lemma_index.json,
           pliny_form_index.json
"""

import json
import os
import sys
import subprocess
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(BASE, "server", "data", "pliny", "source")
OUTPUT_DIR = os.path.join(BASE, "server", "data", "pliny")

# Ordered list of letters (chapter IDs)
LETTER_ORDER = ["6_16", "7_27", "10_96", "10_97", "6_4"]


def load_sources():
    """Load all source files in order."""
    all_sentences = []
    chapters_meta = []

    for order_idx, ch_id in enumerate(LETTER_ORDER, 1):
        fpath = os.path.join(SOURCE_DIR, f"pliny_{ch_id}.json")
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)

        sents = data.get("sentences", [])
        chapters_meta.append({
            "chapter": ch_id,
            "displayName": data.get("displayName", f"Letter {ch_id}"),
            "sentence_count": len(sents),
            "order": order_idx,
        })

        for idx, s in enumerate(sents):
            all_sentences.append({
                "sid": s["sid"],
                "chapter": ch_id,
                "index": idx,
                "latin": s["latin"],
                "english": s.get("english", ""),
            })

    return all_sentences, chapters_meta


def write_sentences_json(sentences):
    """Step 2: pliny_sentences.json — {chapter: [text, text, ...]}"""
    by_chapter = defaultdict(list)
    for s in sentences:
        by_chapter[s["chapter"]].append(s["latin"])

    out = {}
    for ch_id in LETTER_ORDER:
        out[ch_id] = by_chapter[ch_id]

    path = os.path.join(OUTPUT_DIR, "pliny_sentences.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {path} ({sum(len(v) for v in out.values())} sentences)")


def write_chapters_json(chapters_meta):
    """Step 3: pliny_chapters.json"""
    path = os.path.join(OUTPUT_DIR, "pliny_chapters.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(chapters_meta, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {path} ({len(chapters_meta)} chapters)")


def write_translations_json(sentences):
    """Step 4: pliny_translations.json — {meta, by_sid}"""
    by_sid = {}
    for s in sentences:
        by_sid[s["sid"]] = s["english"]

    out = {
        "meta": {"source": "Pliny Letters", "format": "translations_by_sid"},
        "by_sid": by_sid,
    }
    path = os.path.join(OUTPUT_DIR, "pliny_translations.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {path} ({len(by_sid)} entries)")


def parse_with_stanza(sentences):
    """Step 5: Run Stanza on all sentences, return UD data."""
    import stanza

    print("  Loading Stanza Latin pipeline...")
    nlp = stanza.Pipeline("la", processors="tokenize,mwt,pos,lemma,depparse", verbose=False)
    print("  Pipeline loaded.")

    ud_by_chapter = defaultdict(list)
    failures = []
    offset_mismatches = []

    for i, s in enumerate(sentences):
        if (i + 1) % 20 == 0:
            print(f"    Parsing [{i+1}/{len(sentences)}] {s['sid']}...")

        latin = s["latin"]
        try:
            doc = nlp(latin)
        except Exception as e:
            failures.append({"sid": s["sid"], "error": str(e)})
            continue

        tokens = []
        tid = 1
        for sent in doc.sentences:
            for word in sent.words:
                # Parse feats into dict
                feats_str = word.feats or ""
                feats_dict = {}
                if feats_str:
                    for pair in feats_str.split("|"):
                        if "=" in pair:
                            k, v = pair.split("=", 1)
                            feats_dict[k] = v

                tok = {
                    "id": tid,
                    "text": word.text,
                    "lemma": word.lemma or word.text,
                    "upos": word.upos or "X",
                    "xpos": word.xpos,
                    "feats": feats_str if feats_str else None,
                    "head": word.head if word.head is not None else 0,
                    "deprel": word.deprel or "dep",
                }

                # Check character offsets
                if word.start_char is not None and word.end_char is not None:
                    tok["start"] = word.start_char
                    tok["end"] = word.end_char
                    # Verify alignment
                    expected = latin[word.start_char:word.end_char]
                    if expected != word.text:
                        offset_mismatches.append({
                            "sid": s["sid"],
                            "token_id": tid,
                            "text": word.text,
                            "expected_from_offset": expected,
                            "start": word.start_char,
                            "end": word.end_char,
                        })

                tokens.append(tok)
                tid += 1

        sent_obj = {
            "sid": s["sid"],
            "chapter": s["chapter"],
            "index": s["index"],
            "text": latin,
            "tokens": tokens,
        }
        ud_by_chapter[s["chapter"]].append(sent_obj)

    return ud_by_chapter, failures, offset_mismatches


def write_ud_json(ud_by_chapter):
    """Step 5 output: pliny_ud.json"""
    out = {
        "meta": {"source": "Pliny Letters", "format": "ud_parsed", "parser": "stanza"},
        "chapters": {},
    }
    for ch_id in LETTER_ORDER:
        out["chapters"][ch_id] = ud_by_chapter.get(ch_id, [])

    path = os.path.join(OUTPUT_DIR, "pliny_ud.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    total_tokens = sum(
        len(s["tokens"]) for sents in out["chapters"].values() for s in sents
    )
    print(f"  Wrote {path} ({total_tokens} tokens)")
    return total_tokens


def run_construction_detectors(ud_path):
    """Step 6: Run tag_constructions.py adapted for Pliny data."""
    # We'll import the detection functions from the existing script
    # by loading it as a module, or simply invoke it with modified paths.
    # Easiest: copy the logic into a subprocess with overridden INPUT/OUTPUT.

    tagger_path = os.path.join(
        BASE, "server", "scripts", "caesar_pipeline", "tag_constructions.py"
    )
    output_path = os.path.join(OUTPUT_DIR, "pliny_constructions.json")

    # Read the tagger script, replace INPUT and OUTPUT paths, run it
    with open(tagger_path, "r", encoding="utf-8") as f:
        script = f.read()

    # Replace the hardcoded paths
    script = script.replace(
        '(BASE / "../../data/caesar/dbg1_ud.json").resolve()',
        f'Path("{ud_path}")',
    )
    script = script.replace(
        '(BASE / "../../data/caesar/dbg1_constructions.json").resolve()',
        f'Path("{output_path}")',
    )

    # Write temp script and execute
    tmp_script = os.path.join(OUTPUT_DIR, "_tmp_tag_constructions.py")
    with open(tmp_script, "w", encoding="utf-8") as f:
        f.write(script)

    print("  Running construction detectors...")
    result = subprocess.run(
        [sys.executable, tmp_script],
        capture_output=True, text=True, cwd=BASE,
    )
    print(f"    stdout: {result.stdout.strip()}")
    if result.stderr:
        print(f"    stderr: {result.stderr.strip()[:300]}")
    if result.returncode != 0:
        print(f"    WARNING: tagger exited with code {result.returncode}")

    # Clean up temp script
    try:
        os.remove(tmp_script)
    except:
        pass

    # Read and return construction counts
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            cons = json.load(f)
        by_type = defaultdict(int)
        for sid, tags in cons.get("by_sentence", {}).items():
            for tag in tags:
                by_type[tag.get("type", "unknown")] += 1
        return dict(by_type)
    return {}


def build_indices(ud_by_chapter):
    """Step 7: Build lemma_index and form_index."""
    lemma_index = defaultdict(list)
    form_index = defaultdict(list)

    for ch_id in LETTER_ORDER:
        for sent in ud_by_chapter.get(ch_id, []):
            sid = sent["sid"]
            chapter = sent["chapter"]
            for tok in sent.get("tokens", []):
                if tok.get("upos") in ("PUNCT", "SYM"):
                    continue
                form = (tok.get("text") or "").strip().lower()
                lemma = (tok.get("lemma") or "").strip().lower()
                tok_id = tok.get("id", 0)
                if not form or not lemma:
                    continue

                lemma_index[lemma].append({
                    "sid": sid,
                    "chapter": chapter,
                    "token_index": tok_id - 1,  # 0-based
                    "form": tok.get("text", ""),
                })
                form_index[form].append({
                    "sid": sid,
                    "chapter": chapter,
                    "token_index": tok_id - 1,
                    "lemma": lemma,
                })

    # Write lemma_index
    total_nonpunct = sum(len(v) for v in lemma_index.values())
    lemma_out = {
        "meta": {
            "source": "Pliny Letters",
            "format": "lemma_index",
            "unique_lemmas": len(lemma_index),
            "total_nonpunct_tokens": total_nonpunct,
        },
        "by_lemma": dict(lemma_index),
    }
    path = os.path.join(OUTPUT_DIR, "pliny_lemma_index.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(lemma_out, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {path} ({len(lemma_index)} unique lemmas)")

    # Write form_index
    form_out = {
        "meta": {
            "source": "Pliny Letters",
            "format": "form_index",
            "unique_forms": len(form_index),
            "total_nonpunct_tokens": total_nonpunct,
        },
        "by_form": dict(form_index),
    }
    path = os.path.join(OUTPUT_DIR, "pliny_form_index.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(form_out, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {path} ({len(form_index)} unique forms)")


def verify(sentences, ud_by_chapter, failures, offset_mismatches, construction_counts, total_tokens):
    """Print verification output."""
    print("\n" + "=" * 70)
    print("VERIFICATION")
    print("=" * 70)

    # 1. Sentence counts
    print("\n1. Sentence counts:")
    total = 0
    for ch_id in LETTER_ORDER:
        count = len([s for s in sentences if s["chapter"] == ch_id])
        total += count
        print(f"   {ch_id}: {count}")
    print(f"   TOTAL: {total}")

    # 2. Token count
    print(f"\n2. Total tokens: {total_tokens}")

    # 3. Construction counts
    print("\n3. Construction counts by type:")
    if construction_counts:
        for t, c in sorted(construction_counts.items(), key=lambda x: -x[1]):
            print(f"   {t:35s} {c}")
        print(f"   TOTAL: {sum(construction_counts.values())}")
    else:
        print("   (none detected or tagger failed)")

    # 4. First sentence of 6.16
    print("\n4. First sentence of 6.16:")
    sents_6_16 = ud_by_chapter.get("6_16", [])
    if sents_6_16:
        s = sents_6_16[0]
        print(f"   sid: {s['sid']}")
        print(f"   text: {s['text'][:100]}...")
        print(f"   tokens ({len(s['tokens'])}):")
        for t in s["tokens"][:15]:
            feats_short = t.get("feats", "") or ""
            if len(feats_short) > 40:
                feats_short = feats_short[:37] + "..."
            print(f"     {t['id']:3d} {t['text']:15s} lemma={t['lemma']:15s} upos={t['upos']:5s} head={t['head']:3d} deprel={t['deprel']:12s} feats={feats_short}")
        if len(s["tokens"]) > 15:
            print(f"     ... ({len(s['tokens']) - 15} more tokens)")

    # 5. pliny_10_96.0
    print("\n5. pliny_10_96.0 parse:")
    sents_10_96 = ud_by_chapter.get("10_96", [])
    if sents_10_96:
        s = sents_10_96[0]
        print(f"   sid: {s['sid']}")
        print(f"   text: {s['text']}")
        for t in s["tokens"]:
            print(f"     {t['id']:3d} {t['text']:15s} lemma={t['lemma']:15s} upos={t['upos']:5s} head={t['head']:3d} deprel={t['deprel']}")

    # 6. Failures
    print(f"\n6. Parse failures: {len(failures)}")
    for fail in failures:
        print(f"   {fail['sid']}: {fail['error'][:80]}")

    # 7. Offset mismatches
    print(f"\n7. Offset mismatches: {len(offset_mismatches)}")
    for m in offset_mismatches[:10]:
        print(f"   {m['sid']} token {m['token_id']}: text='{m['text']}' vs offset='{m['expected_from_offset']}' [{m['start']}:{m['end']}]")
    if len(offset_mismatches) > 10:
        print(f"   ... and {len(offset_mismatches) - 10} more")


def main():
    print("=" * 70)
    print("PLINY PIPELINE BUILD")
    print("=" * 70)

    # Step 1: Load sources
    print("\nStep 1: Loading source files...")
    sentences, chapters_meta = load_sources()
    print(f"  Loaded {len(sentences)} sentences from {len(chapters_meta)} letters")

    # Step 2: Sentences
    print("\nStep 2: Writing pliny_sentences.json...")
    write_sentences_json(sentences)

    # Step 3: Chapters
    print("\nStep 3: Writing pliny_chapters.json...")
    write_chapters_json(chapters_meta)

    # Step 4: Translations
    print("\nStep 4: Writing pliny_translations.json...")
    write_translations_json(sentences)

    # Step 5: Stanza parsing
    print("\nStep 5: Parsing with Stanza...")
    ud_by_chapter, failures, offset_mismatches = parse_with_stanza(sentences)
    total_tokens = write_ud_json(ud_by_chapter)

    # Step 6: Construction detection
    print("\nStep 6: Running construction detectors...")
    ud_path = os.path.join(OUTPUT_DIR, "pliny_ud.json")
    construction_counts = run_construction_detectors(ud_path)

    # Step 7: Indices
    print("\nStep 7: Building indices...")
    build_indices(ud_by_chapter)

    # Verification
    verify(sentences, ud_by_chapter, failures, offset_mismatches, construction_counts, total_tokens)


if __name__ == "__main__":
    main()
