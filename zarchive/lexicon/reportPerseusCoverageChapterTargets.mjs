import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { lookupPerseusTopHits } from "./perseusLexicon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAPTER_VOCAB_NORM = path.join(__dirname, "..", "dbg1_chapter_vocab_norm.json");

const data = JSON.parse(fs.readFileSync(CHAPTER_VOCAB_NORM, "utf8"));
const byChapter = data.by_chapter || {};

const targetLemmas = new Set();
for (const ch of Object.values(byChapter)) {
  const targets = Array.isArray(ch.targets) ? ch.targets : [];
  for (const t of targets) {
    if (t?.lemma) targetLemmas.add(String(t.lemma));
  }
}

const lemmas = Array.from(targetLemmas);

let have = 0;
const missing = [];

for (const lemma of lemmas) {
  const hits = lookupPerseusTopHits(lemma, 1);
  const ok =
    hits &&
    hits.length &&
    Array.isArray(hits[0].meanings) &&
    hits[0].meanings.length > 0;

  if (ok) have++;
  else missing.push(lemma);
}

console.log("Using:", CHAPTER_VOCAB_NORM);
console.log("Unique target lemmas:", lemmas.length);
console.log("With gloss:", have);
console.log("Missing:", missing.length);
console.log("Sample missing:", missing.slice(0, 25));
