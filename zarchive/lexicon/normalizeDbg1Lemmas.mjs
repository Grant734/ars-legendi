// server/data/lexicon/normalizeDbg1Lemmas.mjs
// Normalizes Caesar DBG1 lemma targets so Perseus lookups work.
//
// Inputs:
//   server/data/caesar/dbg1_lemma_index.json
//   server/data/caesar/dbg1_chapter_vocab.json
//
// Outputs:
//   server/data/dbg1_lemma_index_norm.json
//   server/data/dbg1_chapter_vocab_norm.json
//   server/data/dbg1_lemma_normalization_report.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripDiacritics(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe");
}

function normalizeToken(s) {
  let out = stripDiacritics(String(s || "").trim().toLowerCase())
    .replace(/j/g, "i")
    .replace(/v/g, "u");

  out = out.replace(/^[^a-z]+/g, "").replace(/[^a-z0-9]+$/g, "");
  out = out.replace(/[0-9]+$/g, "");
  out = out.replace(/[^a-z]/g, "");
  return out;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEXICON_DIR = __dirname;
const DATA_DIR = path.resolve(__dirname, "..");

const inLemmaIndexPath = path.join(DATA_DIR, "caesar", "dbg1_lemma_index.json");
const inChapterVocabPath = path.join(DATA_DIR, "caesar", "dbg1_chapter_vocab.json");

const outLemmaIndexPath = path.join(DATA_DIR, "dbg1_lemma_index_norm.json");
const outChapterVocabPath = path.join(DATA_DIR, "dbg1_chapter_vocab_norm.json");
const reportPath = path.join(DATA_DIR, "dbg1_lemma_normalization_report.json");

const aliasPath = path.join(LEXICON_DIR, "caesarLemmaAliases.json");
const aliases = fs.existsSync(aliasPath) ? JSON.parse(fs.readFileSync(aliasPath, "utf8")) : {};

const ENCLITIC_EXCEPTIONS = new Set([
  "atque",
  "neque",
  "quoque",
  "itaque",
  "absque",
  "usque",
  "denique",
  "quisque",
  "uterque",
  "ubique",
]);

function canonicalize(raw) {
  const norm = normalizeToken(raw);
  if (!norm) return null;

  // Caesar-specific alias map
  if (aliases[norm]) return normalizeToken(aliases[norm]) || null;

  // Enclitic stripping (avoid lexicalized -que words)
  if (!ENCLITIC_EXCEPTIONS.has(norm) && norm.length > 4 && norm.endsWith("que")) return norm.slice(0, -3) || null;
  if (norm.length > 3 && norm.endsWith("ve")) return norm.slice(0, -2) || null;
  if (norm.length > 3 && norm.endsWith("ne")) return norm.slice(0, -2) || null;

  // Pronoun + cum compounds
  if (norm.length > 5 && norm.endsWith("cum") && norm.startsWith("qui")) return "qui";

  // Drop common praenomen abbreviations that show up as tokens
  if (norm === "m" || norm === "p") return null;

  return norm;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function normalizeLemmaIndex(lemmaIndex) {
  const report = {
    total: 0,
    unchanged: 0,
    changed: 0,
    dropped: 0,
    collisions: 0,
    samples: { changed: [], dropped: [], collisions: [] },
    map: {},
  };

  const out = Object.assign({}, lemmaIndex, { by_lemma: {} });

  const byLemma = lemmaIndex.by_lemma || {};
  for (const orig of Object.keys(byLemma)) {
    report.total += 1;
    const canon = canonicalize(orig);

    report.map[orig] = canon;

    if (!canon) {
      report.dropped += 1;
      if (report.samples.dropped.length < 25) report.samples.dropped.push(orig);
      continue;
    }

    if (canon === normalizeToken(orig)) report.unchanged += 1;
    else {
      report.changed += 1;
      if (report.samples.changed.length < 25) report.samples.changed.push({ from: orig, to: canon });
    }

    if (out.by_lemma[canon]) {
      report.collisions += 1;
      if (report.samples.collisions.length < 25) report.samples.collisions.push({ from: orig, into: canon });

      const a = out.by_lemma[canon];
      const b = byLemma[orig];

      if (typeof a === "number" && typeof b === "number") {
        out.by_lemma[canon] = a + b;
      } else if (a && b && typeof a === "object" && typeof b === "object") {
        const merged = Object.assign({}, a, b);
        if (typeof a.count === "number" || typeof b.count === "number") merged.count = (Number(a.count) || 0) + (Number(b.count) || 0);
        out.by_lemma[canon] = merged;
      } else {
        out.by_lemma[canon] = a;
      }
    } else {
      out.by_lemma[canon] = byLemma[orig];
    }
  }

  out._normalizationReport = report;
  return out;
}

function remapChapterVocab(chapterVocab, lemmaMap) {
  const out = {};
  for (const [chapter, value] of Object.entries(chapterVocab || {})) {
    if (Array.isArray(value)) {
      const set = new Set();
      for (const raw of value) {
        const canon = lemmaMap[raw] !== undefined ? lemmaMap[raw] : canonicalize(raw);
        if (canon) set.add(canon);
      }
      out[chapter] = Array.from(set).sort();
      continue;
    }

    if (value && typeof value === "object" && Array.isArray(value.lemmas)) {
      const set = new Set();
      for (const raw of value.lemmas) {
        const canon = lemmaMap[raw] !== undefined ? lemmaMap[raw] : canonicalize(raw);
        if (canon) set.add(canon);
      }
      out[chapter] = Object.assign({}, value, { lemmas: Array.from(set).sort() });
      continue;
    }

    out[chapter] = value;
  }
  return out;
}

function main() {
  if (!fs.existsSync(inLemmaIndexPath)) {
    console.error("Missing input:", inLemmaIndexPath);
    process.exit(1);
  }
  if (!fs.existsSync(inChapterVocabPath)) {
    console.error("Missing input:", inChapterVocabPath);
    process.exit(1);
  }

  const lemmaIndex = loadJson(inLemmaIndexPath);
  const chapterVocab = loadJson(inChapterVocabPath);

  const normalizedIndex = normalizeLemmaIndex(lemmaIndex);
  const lemmaMap = normalizedIndex._normalizationReport?.map || {};

  const normalizedChapterVocab = remapChapterVocab(chapterVocab, lemmaMap);

  writeJson(outLemmaIndexPath, normalizedIndex);
  writeJson(outChapterVocabPath, normalizedChapterVocab);
  writeJson(reportPath, normalizedIndex._normalizationReport);

  const total = Object.keys(lemmaIndex.by_lemma || {}).length;
  const totalNorm = Object.keys(normalizedIndex.by_lemma || {}).length;

  console.log("✅ DBG1 lemma normalization complete.");
  console.log("Original lemmas:", total);
  console.log("Normalized lemmas:", totalNorm);
  console.log("Output:", outLemmaIndexPath);
  console.log("Output:", outChapterVocabPath);
  console.log("Report:", reportPath);
}

main();
