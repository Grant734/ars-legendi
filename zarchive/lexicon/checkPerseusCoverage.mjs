import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { lookupPerseusTopHits } from "./perseusLexicon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Use the normalized lemma index you just generated
// You said your outputs are in server/data/, not server/data/caesar/
const LEMMA_INDEX_NORM = path.join(__dirname, "..", "dbg1_lemma_index_norm.json");

const data = JSON.parse(fs.readFileSync(LEMMA_INDEX_NORM, "utf8"));
const lemmas = Object.keys(data.by_lemma || {}).filter(Boolean);

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

console.log("Using:", LEMMA_INDEX_NORM);
console.log("Total lemmas:", lemmas.length);
console.log("With gloss:", have);
console.log("Missing:", missing.length);
console.log("Sample missing:", missing.slice(0, 25));
