#!/usr/bin/env python3
"""Audit Pliny construction tags for human review."""
import json

BASE = "/Users/grant/latin-edu-website/server/data/pliny"
with open(f"{BASE}/pliny_constructions.json") as f:
    cons = json.load(f)
with open(f"{BASE}/pliny_ud.json") as f:
    ud = json.load(f)

# Build sid -> sentence text and tokens
sentences = {}
for ch_id, sents in ud.get("chapters", {}).items():
    for s in sents:
        sentences[s["sid"]] = s

by_type = {}
for sid, tags in cons.get("by_sentence", {}).items():
    for tag in tags:
        t = tag.get("type", "unknown")
        if t not in by_type:
            by_type[t] = []
        by_type[t].append((sid, tag))

out_lines = []
for ctype in sorted(by_type.keys()):
    instances = sorted(by_type[ctype], key=lambda x: x[0])
    out_lines.append(f"\n{'='*70}")
    out_lines.append(f"  {ctype.upper()} ({len(instances)} instances)")
    out_lines.append(f"{'='*70}\n")

    for sid, tag in instances:
        sent = sentences.get(sid, {})
        text = sent.get("text", "(not found)")
        tokens = sent.get("tokens", [])

        # Build highlighted text
        hs = tag.get("highlight_spans", [])
        highlight_ids = set()
        for pair in hs:
            for i in range(pair[0], pair[1] + 1):
                highlight_ids.add(i)

        highlighted = []
        for tok in tokens:
            tid = tok.get("id", 0)
            form = tok.get("text", "")
            if tid in highlight_ids:
                highlighted.append(f"[{form}]")
            else:
                highlighted.append(form)

        conf = tag.get("confidence", "?")
        out_lines.append(f"  {sid}")
        out_lines.append(f"    Type: {ctype}")
        out_lines.append(f"    Confidence: {conf}")
        out_lines.append(f"    Latin: {text}")
        out_lines.append(f"    Highlighted: {' '.join(highlighted)}")
        out_lines.append("")

output_path = "/Users/grant/latin-edu-website/scripts/output/pliny_constructions_audit.txt"
with open(output_path, "w") as f:
    f.write("\n".join(out_lines))
print(f"Written: {output_path}")
print(f"Total constructions: {sum(len(v) for v in by_type.values())}")
for t in sorted(by_type):
    print(f"  {t}: {len(by_type[t])}")
