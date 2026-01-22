// server/data/lexicon/extractLemmaList.mjs
import fs from "fs";
import path from "path";

function usage() {
  console.log(
    "Usage:\n  node extractLemmaList.mjs <input_lemma_index.json> <output_lemmas.json>\n\n" +
      "Example:\n  node extractLemmaList.mjs ../dbg1_lemma_index_norm.json ./build/caesar_lemmas.json"
  );
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function normalizeLemmaKey(s) {
  // Keep this conservative. You can expand later.
  // The index is already "norm", so mainly defensive cleanup.
  let x = String(s).trim().toLowerCase();

  // Remove surrounding punctuation/spaces
  x = x.replace(/^[^a-z]+/i, "").replace(/[^a-z]+$/i, "");

  // Collapse internal whitespace (shouldn't exist, but safe)
  x = x.replace(/\s+/g, " ");

  return x;
}

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  usage();
  process.exit(1);
}

const absIn = path.resolve(inputPath);
const absOut = path.resolve(outputPath);

if (!fs.existsSync(absIn)) {
  console.error("Input not found:", absIn);
  process.exit(1);
}

const data = readJSON(absIn);
if (!data || typeof data !== "object") {
  console.error("Invalid JSON.");
  process.exit(1);
}

const byLemma = data.by_lemma;
if (!byLemma || typeof byLemma !== "object") {
  console.error("Expected top-level key: by_lemma");
  process.exit(1);
}

// Extract + normalize + dedupe
const set = new Set();
for (const k of Object.keys(byLemma)) {
  const norm = normalizeLemmaKey(k);
  if (norm) set.add(norm);
}

const lemmas = Array.from(set).sort((a, b) => a.localeCompare(b));

writeJSON(absOut, {
  meta: {
    source: data.meta?.source ?? null,
    format: "lemma_list",
    created_at: new Date().toISOString(),
    input: absIn,
    unique_lemmas: lemmas.length
  },
  lemmas
});

console.log("Wrote:", absOut);
console.log("Unique lemmas:", lemmas.length);
