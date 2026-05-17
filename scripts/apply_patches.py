#!/usr/bin/env python3
"""
Phase 3: Apply patches to the master glosses file.
Reads from backup, applies patches, writes to live master file.
"""

import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_PATH = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.backup.json")
MASTER_PATH = os.path.join(BASE, "server", "data", "caesar", "caesar_lemma_glosses_MASTER.json")
PATCHES_PATH = os.path.join(BASE, "scripts", "output", "patches.json")


def main():
    print("Loading backup file...")
    with open(BACKUP_PATH, "r", encoding="utf-8") as f:
        master = json.load(f)
    print(f"  {len(master)} entries in backup.")

    print("Loading patches...")
    with open(PATCHES_PATH, "r", encoding="utf-8") as f:
        patches_data = json.load(f)

    patches = patches_data["patches"]
    print(f"  {len(patches)} patches to apply.")

    applied = 0
    for lemma, patch in patches.items():
        if lemma not in master:
            print(f"  [WARN] Lemma '{lemma}' not found in master, skipping.")
            continue

        new_entry = dict(patch["new"])
        # Strip the debug field before writing
        new_entry.pop("patched_from_issues", None)

        master[lemma] = new_entry
        applied += 1

    print(f"\nApplied {applied} patches.")
    print(f"Writing to: {MASTER_PATH}")

    with open(MASTER_PATH, "w", encoding="utf-8") as f:
        json.dump(master, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {applied} entries changed.")
    print(f"Backup preserved at: {BACKUP_PATH}")
    print(f"To revert: cp backup over master.")


if __name__ == "__main__":
    main()
