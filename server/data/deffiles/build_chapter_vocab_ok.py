#!/usr/bin/env python3
"""
build_chapter_vocab_ok.py

Rebuilds DBG Book 1 chapter vocab targets using only "known/ok" lemmas (from a glossary JSON),
with conservative proper-name handling and a global stop-lemma list.

Usage:
  python3 build_chapter_vocab_ok.py <dbg1_ud.json> <dbg1_lemma_index_norm.json> <caesar_lemma_glosses_REBUILT_core_ls.json> <output.json>

  Example (from repo root):
  python3 server/data/build_chapter_vocab_ok.py server/data/dbg1_ud.json server/data/dbg1_lemma_index_norm.json \
    server/data/caesar_lemma_glosses_REBUILT_core_ls.json server/data/dbg1_chapter_vocab_ok.json
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple


CONTENT_UPOS = {"NOUN", "VERB", "ADJ", "ADV", "PROPN", "NUM"}


def norm_uv(s: str) -> str:
    # Treat u/v as the same letter: map v → u
    return (s or "").lower().replace("v", "u")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def usage() -> None:
    print(
        "Usage:\n"
        "  python3 build_chapter_vocab_ok.py <dbg1_ud.json> <dbg1_lemma_index_norm.json> <ok_glosses.json> <output.json>\n\n"
        "Example:\n"
        "  python3 server/data/build_chapter_vocab_ok.py server/data/dbg1_ud.json server/data/dbg1_lemma_index_norm.json "
        "server/data/caesar_lemma_glosses_REBUILT_core_ls.json server/data/dbg1_chapter_vocab_ok.json"
    )


def main(argv: List[str]) -> int:
    if len(argv) != 5:
        usage()
        return 2

    ud_path, lemma_index_path, ok_glosses_path, out_path = argv[1:]

    ud = load_json(ud_path)
    lemma_index = load_json(lemma_index_path)
    ok_glosses = load_json(ok_glosses_path)

    chapters: Dict[str, List[Dict[str, Any]]] = ud.get("chapters", {})
    by_lemma: Dict[str, List[Any]] = lemma_index.get("by_lemma", {})

    # "ok" lemmas are simply the lemmas present in the known glossary file.
    ok_set = {norm_uv(k) for k in ok_glosses.keys()}

    # Map SID → token list (so we can later infer capitalization/properness if needed)
    sid_map: Dict[str, List[Dict[str, Any]]] = {}
    for _ch, sents in chapters.items():
        for sent in sents:
            sid = sent.get("sid")
            if sid:
                sid_map[sid] = sent.get("tokens", [])

    # firstChapter for lemma (from normalized lemma index)
    first_chapter: Dict[str, int] = {}
    occ_map: Dict[str, Dict[int, List[Dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for lemma, occs in by_lemma.items():
        lem = norm_uv(lemma)
        if not occs:
            continue

        for o in occs:
            if not isinstance(o, dict):
                continue
            ch = o.get("chapter")
            if ch is None:
                continue
            ch_i = int(ch)
            occ_map[lem][ch_i].append(o)
            if lem not in first_chapter or ch_i < first_chapter[lem]:
                first_chapter[lem] = ch_i

    for lem, chmap in occ_map.items():
        for ch_i, lst in chmap.items():
            # keep a stable "first example" ordering
            lst.sort(key=lambda x: (str(x.get("sid", "")), int(x.get("token_index", 0))))

    # Global counts and properness detection (from UD tokens)
    global_counts: Counter[str] = Counter()
    lemma_is_proper: Dict[str, bool] = defaultdict(bool)

    for _ch, sents in chapters.items():
        for sent in sents:
            toks = sent.get("tokens", [])
            for i, t in enumerate(toks):
                upos = t.get("upos")
                if upos == "PUNCT":
                    continue
                lemma = norm_uv(t.get("lemma", ""))
                if lemma in ok_set and upos in CONTENT_UPOS:
                    global_counts[lemma] += 1

                form = t.get("form", "") or ""
                if upos == "PROPN" or (form[:1].isupper() and i != 0):
                    lemma_is_proper[lemma] = True

    stop_lemmas = [lem for lem, _ in global_counts.most_common(40)]
    stop_set = set(stop_lemmas)

    out_by_chapter: Dict[str, Any] = {}

    for ch_str, sents in chapters.items():
        ch = int(ch_str)

        counts: Counter[str] = Counter()
        lemma_upos: Dict[str, Counter[str]] = defaultdict(Counter)

        for sent in sents:
            toks = sent.get("tokens", [])
            for i, t in enumerate(toks):
                upos = t.get("upos")
                if upos == "PUNCT":
                    continue
                lemma = norm_uv(t.get("lemma", ""))
                if lemma not in ok_set:
                    continue
                if upos not in CONTENT_UPOS:
                    continue
                counts[lemma] += 1
                lemma_upos[lemma][upos] += 1

        unique = len(counts)
        target_count = int(math.ceil(0.3 * unique)) if unique else 0

        # Candidates: drop stop lemmas, then sort by freq desc
        candidates = [lem for lem in counts.keys() if lem not in stop_set]
        candidates.sort(key=lambda lem: (-counts[lem], lem))

        # Proper-name rule: include only in earliest chapter
        filtered: List[str] = []
        for lem in candidates:
            if lemma_is_proper.get(lem, False):
                fc = first_chapter.get(lem)
                if fc is not None and fc != ch:
                    continue
            filtered.append(lem)

        chosen = filtered[:target_count]

        targets: List[Dict[str, Any]] = []
        for lem in chosen:
            upos = None
            if lemma_upos.get(lem):
                upos = lemma_upos[lem].most_common(1)[0][0]

            is_proper = bool(lemma_is_proper.get(lem, False))
            fc = first_chapter.get(lem, ch)

            ex = None
            occs = occ_map.get(lem, {}).get(ch, [])
            if occs:
                o = occs[0]
                ex = {"sid": o.get("sid"), "token_index": o.get("token_index"), "form": o.get("form")}
            else:
                # Fallback: first occurrence found in UD tokens
                found = False
                for sent in sents:
                    toks = sent.get("tokens", [])
                    for i, t in enumerate(toks):
                        if norm_uv(t.get("lemma", "")) == lem:
                            ex = {"sid": sent.get("sid"), "token_index": i, "form": t.get("form")}
                            found = True
                            break
                    if found:
                        break

            targets.append(
                {
                    "lemma": lem,
                    "upos": upos,
                    "count": int(counts[lem]),
                    "firstChapter": int(fc),
                    "isProper": is_proper,
                    "example": ex,
                }
            )

        out_by_chapter[str(ch)] = {
            "chapter": ch,
            "uniqueContentLemmas": unique,
            "targetCount": target_count,
            "targets": targets,
        }

    out = {
        "meta": {
            "source": "DBG Book 1",
            "format": "chapter_vocab",
            "target_frac_unique_content_lemmas": 0.3,
            "stop_lemmas_count": 40,
            "notes": [
                "Built from dbg1_ud.json (canonical tokens) + dbg1_lemma_index_norm.json (firstChapter + occurrences).",
                f"Filtered to lemmas present in {ok_glosses_path} (known/ok lemmas only). Missing/unknown lemmas are excluded.",
                "Proper-name handling is conservative: UPOS=PROPN OR capitalized token not at sentence start.",
                "Proper names are included only in their earliest chapter (firstChapter).",
                "Lemma matching normalizes u/v: treat u and v as the same letter by mapping v→u on both sides.",
            ],
        },
        "by_chapter": out_by_chapter,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    total_targets = sum(len(v.get("targets", [])) for v in out_by_chapter.values())
    print(f"Wrote: {out_path}")
    print(f"Chapters: {len(out_by_chapter)}")
    print(f"Total targets (all chapters): {total_targets}")
    print(f"Stop lemmas (N=50): {', '.join(stop_lemmas[:10])}{'...' if len(stop_lemmas) > 10 else ''}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
