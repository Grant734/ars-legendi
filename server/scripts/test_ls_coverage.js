import fs from "fs";
import path from "path";
import { lookupLS } from "../../zarchive/lexicon/lsLexicon.js";

// Load Caesar lemmas
const LEMMA_INDEX = path.resolve("server/data/caesar/dbg1_lemma_index.json");
const lemmaIndex = JSON.parse(fs.readFileSync(LEMMA_INDEX, "utf8"));
const lemmas = Object.keys(lemmaIndex.by_lemma);

let hits = 0;
let misses = 0;
const missSamples = [];

for (const lemma of lemmas) {
  const res = lookupLS(lemma, 1);
  if (res.hits.length) {
    hits++;
  } else {
    misses++;
    if (missSamples.length < 30) missSamples.push(lemma);
  }
}

console.log("Total lemmas:", lemmas.length);
console.log("With gloss:", hits);
console.log("Missing:", misses);
console.log("Sample missing:", missSamples);
