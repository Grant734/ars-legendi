// server/data/lexicon/perseusLexicon.js
// Runtime lookup helpers for the Perseus lexicon build (perseus_entries.json + perseus_index.json).

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

function normalizeLookupKey(s) {
  const base = stripDiacritics(String(s || "").trim().toLowerCase())
    .replace(/j/g, "i")
    .replace(/v/g, "u");
  return base.replace(/[^a-z]/g, "");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRIES_PATH = path.join(__dirname, "perseus_entries.json");
const INDEX_PATH = path.join(__dirname, "perseus_index.json");
const ALIASES_PATH = path.join(__dirname, "caesarLemmaAliases.json");

let _entriesById = null;
let _index = null;
let _aliases = null;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadPerseusData() {
  if (!_entriesById) {
    if (!fs.existsSync(ENTRIES_PATH) || !fs.existsSync(INDEX_PATH)) {
      throw new Error(
        [
          "Perseus lexicon files are missing.",
          "Expected:",
          ` - ${ENTRIES_PATH}`,
          ` - ${INDEX_PATH}`,
          "",
          "Run: node server/data/lexicon/buildPerseusLexicon.mjs",
        ].join("\n")
      );
    }
    _entriesById = loadJson(ENTRIES_PATH);
    _index = loadJson(INDEX_PATH);
  }
  return { entriesById: _entriesById, index: _index };
}

function loadAliases() {
  if (_aliases) return _aliases;
  _aliases = fs.existsSync(ALIASES_PATH) ? loadJson(ALIASES_PATH) : {};
  return _aliases;
}

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

function stripEnclitic(raw) {
  const norm = normalizeLookupKey(raw);
  if (!norm) return null;
  if (ENCLITIC_EXCEPTIONS.has(norm)) return null;

  if (norm.length > 4 && norm.endsWith("que")) return norm.slice(0, -3);
  if (norm.length > 3 && norm.endsWith("ve")) return norm.slice(0, -2);
  if (norm.length > 3 && norm.endsWith("ne")) return norm.slice(0, -2);

  // Caesar: quicum and friends. Not always a headword, but this helps coverage.
  if (norm.length > 5 && norm.endsWith("cum") && norm.startsWith("qui")) return "qui";

  return null;
}

function deinflectFallbackCandidates(raw) {
  // Lightweight heuristics used only when we have zero hits.
  const w = normalizeLookupKey(raw);
  const out = new Set();
  if (!w) return [];

  out.add(w.replace(/[0-9]+$/g, ""));

  if (w.endsWith("um") && w.length > 4) out.add(w.slice(0, -2) + "us"); // oceanum -> oceanus
  if (w.endsWith("am") && w.length > 3) out.add(w.slice(0, -2) + "a");  // galliam -> gallia
  if (w.endsWith("ae") && w.length > 3) out.add(w.slice(0, -2) + "a");  // viae -> via
  if (w.endsWith("is") && w.length > 3) {
    out.add(w.slice(0, -2) + "us"); // germanis -> germanus
    out.add(w.slice(0, -2) + "i");  // germanis -> germani
  }
  if (w.endsWith("os") && w.length > 3) out.add(w.slice(0, -2) + "us");
  if (w.endsWith("as") && w.length > 3) out.add(w.slice(0, -2) + "a");

  return Array.from(out).filter(Boolean);
}

export function lookupPerseusEntry(id) {
  const { entriesById } = loadPerseusData();
  return entriesById[id] || null;
}

// Returns array of hits:
// [{ id, head, lemma, glosses }]
export function lookupPerseusTopHits(rawLemma, { limit = 5 } = {}) {
  const { entriesById, index } = loadPerseusData();
  const aliases = loadAliases();

  const tried = new Set();

  const tryLookup = (candidateNorm) => {
    if (!candidateNorm) return [];
    if (tried.has(candidateNorm)) return [];
    tried.add(candidateNorm);

    const ids = index[candidateNorm] || [];
    const hits = [];
    for (const id of ids) {
      const e = entriesById[id];
      if (!e) continue;
      hits.push({ id, head: e.head, lemma: e.lemma, glosses: e.glosses || [] });
    }
    return hits;
  };

  const norm = normalizeLookupKey(rawLemma);

  // 1) direct lookup
  let hits = tryLookup(norm);

  // 2) alias mapping (Caesar cleanup)
  if (!hits.length && aliases && aliases[norm]) hits = tryLookup(normalizeLookupKey(aliases[norm]));

  // 3) enclitic stripping
  if (!hits.length) {
    const stripped = stripEnclitic(rawLemma);
    if (stripped) hits = tryLookup(stripped);
  }

  // 4) deinflection heuristics
  if (!hits.length) {
    for (const cand of deinflectFallbackCandidates(rawLemma)) {
      const h = tryLookup(cand);
      if (h.length) {
        hits = h;
        break;
      }
    }
  }

  // Prefer entries with glosses
  hits.sort((a, b) => {
    const ag = a.glosses && a.glosses.length ? 1 : 0;
    const bg = b.glosses && b.glosses.length ? 1 : 0;
    if (ag !== bg) return bg - ag;
    return String(a.id).localeCompare(String(b.id));
  });

  return hits.slice(0, limit);
}

export function _debugNormalizeLookupKey(s) {
  return normalizeLookupKey(s);
}
