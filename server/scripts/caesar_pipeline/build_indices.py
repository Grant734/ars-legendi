#!/usr/bin/env python3
import json
import os
from collections import defaultdict

# Adjust these if your filenames differ
INPUT_UD = "server/data/caesar/dbg1_ud.json"
OUT_SENTENCE_INDEX = "server/data/caesar/dbg1_sentence_index.json"
OUT_LEMMA_INDEX = "server/data/caesar/dbg1_lemma_index.json"
OUT_FORM_INDEX = "server/data/caesar/dbg1_form_index.json"


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, obj) -> None:
    ensure_parent_dir(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def normalize_form(s: str) -> str:
    # Simple MVP normalization: lowercase + strip surrounding whitespace.
    # We do NOT strip punctuation aggressively because sometimes students search it.
    return (s or "").strip().lower()


def main():
    if not os.path.exists(INPUT_UD):
        raise FileNotFoundError(
            f"Could not find {INPUT_UD}. If your file is elsewhere, update INPUT_UD at the top of this script."
        )

    data = load_json(INPUT_UD)

    chapters = data.get("chapters", {})
    if not isinstance(chapters, dict) or not chapters:
        raise ValueError("Input JSON does not have a 'chapters' object with content. Check dbg1_ud.json structure.")

    # Index structures
    sentence_index = {}  # sid -> {sid, chapter, index, text, tokens}
    lemma_index = defaultdict(list)  # lemma -> [occurrence]
    form_index = defaultdict(list)  # formLower -> [occurrence]

    total_sents = 0
    total_nonpunct_tokens = 0

    for chap_key, sents in chapters.items():
        # chap_key might be "1", "2", etc.
        # each sent entry should have: sid, chapter, index, text, tokens[]
        if not isinstance(sents, list):
            continue

        for sent in sents:
            sid = sent.get("sid")
            chapter = sent.get("chapter")
            sent_text = sent.get("text", "")
            tokens = sent.get("tokens", [])

            if not sid:
                # Skip malformed entries
                continue

            total_sents += 1

            # Store sentence entry
            sentence_index[sid] = {
                "sid": sid,
                "chapter": chapter,
                "index": sent.get("index"),
                "text": sent_text,
                "tokens": tokens,
            }

            # Token occurrences
            if not isinstance(tokens, list):
                continue

            for ti, tok in enumerate(tokens):
                upos = tok.get("upos")
                if upos == "PUNCT":
                    continue

                total_nonpunct_tokens += 1

                form = tok.get("text", "")
                lemma = tok.get("lemma", "")

                if not lemma:
                    # fallback: lemma sometimes missing; use form
                    lemma = form

                lemma_norm = str(lemma).strip().lower()
                form_norm = normalize_form(str(form))

                occ = {
                    "sid": sid,
                    "chapter": chapter,
                    "token_index": ti,
                    "form": form,
                    "lemma": lemma_norm,
                }

                # lemma index
                lemma_index[lemma_norm].append({
                    "sid": sid,
                    "chapter": chapter,
                    "token_index": ti,
                    "form": form,
                })

                # form index
                if form_norm:
                    form_index[form_norm].append({
                        "sid": sid,
                        "chapter": chapter,
                        "token_index": ti,
                        "lemma": lemma_norm,
                    })

    # Convert defaultdict to normal dict for JSON
    lemma_index = dict(lemma_index)
    form_index = dict(form_index)

    # Write outputs
    write_json(OUT_SENTENCE_INDEX, {
        "meta": {
            "source": data.get("meta", {}).get("source", "DBG Book 1"),
            "format": "sentence_index",
            "sentences": total_sents
        },
        "by_sid": sentence_index
    })

    write_json(OUT_LEMMA_INDEX, {
        "meta": {
            "source": data.get("meta", {}).get("source", "DBG Book 1"),
            "format": "lemma_index",
            "unique_lemmas": len(lemma_index),
            "total_nonpunct_tokens": total_nonpunct_tokens
        },
        "by_lemma": lemma_index
    })

    write_json(OUT_FORM_INDEX, {
        "meta": {
            "source": data.get("meta", {}).get("source", "DBG Book 1"),
            "format": "form_index",
            "unique_forms": len(form_index),
            "total_nonpunct_tokens": total_nonpunct_tokens
        },
        "by_form": form_index
    })

    # Print sanity stats
    print(f"Loaded chapters: {len(chapters)}")
    print(f"Total sentences: {total_sents}")
    print(f"Total non-punct tokens: {total_nonpunct_tokens}")
    print(f"Unique lemmas: {len(lemma_index)}")
    print(f"Unique forms: {len(form_index)}")
    # Show top lemmas
    top = sorted(lemma_index.items(), key=lambda kv: len(kv[1]), reverse=True)[:15]
    print("Top lemmas by frequency:")
    for lemma, occs in top:
        print(f"  {lemma}: {len(occs)}")

    # Sample check
    for test in ["sum", "qui", "is", "dico"]:
        if test in lemma_index:
            print(f"\nSample lemma '{test}' occurrences (first 3):")
            for o in lemma_index[test][:3]:
                print(f"  {o['sid']} (ch {o['chapter']}), token {o['token_index']}: {o['form']}")
        else:
            print(f"\nSample lemma '{test}' not found.")


if __name__ == "__main__":
    main()
