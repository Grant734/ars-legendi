// MULTI-FILE VALIDATOR (supports declension*.json)
// Usage (from client/):  node scripts/validate_vocab.mjs
// Validates scripts/data_raw/*.json (nouns & verbs)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, "data_raw");
const MACRONS = /[āēīōūȳĀĒĪŌŪȲ]/;

function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }
function readJSON(absPath){ return JSON.parse(fs.readFileSync(absPath,"utf8")); }
function uniq(arr){ return Array.from(new Set(arr)); }

function listRawFiles() {
  if (!exists(RAW_DIR)) throw new Error(`RAW dir not found: ${RAW_DIR}`);
  return fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
}

function loadNouns() {
  const files = listRawFiles();
  const nounPaths = files.includes("nouns.json")
    ? [path.join(RAW_DIR, "nouns.json")]
    : [
        ...files.filter(f => /^nouns_decl[1-5]\.json$/i.test(f)).sort(),
        ...files.filter(f => /^declension[1-5]\.json$/i.test(f)).sort(), // NEW
      ].map(f => path.join(RAW_DIR, f));

  const out = []; const origins = [];
  for (const p of nounPaths) {
    const arr = readJSON(p);
    if (!Array.isArray(arr)) throw new Error(`Expected array in ${p}`);
    for (const it of arr) { out.push(it); origins.push(p); }
  }
  return { items: out, origins };
}

function loadVerbs() {
  const files = listRawFiles();
  const verbPaths = files.includes("verbs.json")
    ? [path.join(RAW_DIR, "verbs.json")]
    : [
        ...files.filter(f => /^conjugation[1-4]\.json$/i.test(f)).sort(),
        ...(files.includes("irregular.json") ? ["irregular.json"] : []),
      ].map(f => path.join(RAW_DIR, f));

  const out = []; const origins = [];
  for (const p of verbPaths) {
    const arr = readJSON(p);
    if (!Array.isArray(arr)) throw new Error(`Expected array in ${p}`);
    for (const it of arr) { out.push(it); origins.push(p); }
  }
  return { items: out, origins };
}

// ---------- Validation ----------
function validateNouns(arr, origins) {
  const errors = [];
  const byKey = new Set();
  arr.forEach((w, i) => {
    const where = `${path.basename(origins[i])}[${i}] (${w.lemma || "?"})`;
    for (const k of ["lemma","english","entry","declension","distractors"]) {
      if (!(k in w)) errors.push(`${where}: missing ${k}`);
    }
    if (w.lemma && MACRONS.test(w.lemma)) errors.push(`${where}: macrons not allowed in lemma`);
    if (w.entry && MACRONS.test(w.entry)) errors.push(`${where}: macrons not allowed in entry`);
    if (typeof w.declension !== "number" || w.declension < 1 || w.declension > 5) {
      errors.push(`${where}: declension must be 1..5`);
    }
    if (!Array.isArray(w.distractors) || w.distractors.length !== 3) {
      errors.push(`${where}: distractors must be length 3`);
    } else {
      const d = w.distractors.map(x => (x||"").trim().toLowerCase());
      if (uniq(d).length !== 3) errors.push(`${where}: distractors must be distinct`);
      const ans = (w.english||"").trim().toLowerCase();
      if (d.includes(ans)) errors.push(`${where}: distractor equals correct answer`);
    }
    const key = `${w.declension}::${(w.lemma||"").trim().toLowerCase()}`;
    if (byKey.has(key)) errors.push(`${where}: duplicate lemma in same declension (${key})`);
    byKey.add(key);
  });
  return errors;
}

function validateVerbs(arr, origins) {
  const errors = [];
  const byKey = new Set();
  const validConj = new Set([1,2,3,4,"irregular"]);
  arr.forEach((w, i) => {
    const where = `${path.basename(origins[i])}[${i}] (${w.lemma || "?"})`;
    for (const k of ["lemma","english","entry","conjugation","distractors"]) {
      if (!(k in w)) errors.push(`${where}: missing ${k}`);
    }
    if (w.lemma && MACRONS.test(w.lemma)) errors.push(`${where}: macrons not allowed in lemma`);
    if (w.entry && MACRONS.test(w.entry)) errors.push(`${where}: macrons not allowed in entry`);
    if (!validConj.has(w.conjugation)) errors.push(`${where}: conjugation must be 1..4 or "irregular"`);
    if (!Array.isArray(w.distractors) || w.distractors.length !== 3) {
      errors.push(`${where}: distractors must be length 3`);
    } else {
      const d = w.distractors.map(x => (x||"").trim().toLowerCase());
      if (uniq(d).length !== 3) errors.push(`${where}: distractors must be distinct`);
      const ans = (w.english||"").trim().toLowerCase();
      if (d.includes(ans)) errors.push(`${where}: distractor equals correct answer`);
    }
    const parts = (w.entry||"").split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) errors.push(`${where}: entry should include principal parts (>= 2)`);
    const key = `${String(w.conjugation)}::${(w.lemma||"").trim().toLowerCase()}`;
    if (byKey.has(key)) errors.push(`${where}: duplicate lemma in same conjugation (${key})`);
    byKey.add(key);
  });
  return errors;
}

function main() {
  if (!exists(RAW_DIR)) {
    console.error(`❌ RAW dir not found: ${RAW_DIR}`);
    process.exit(1);
  }

  const { items: nouns, origins: nOrigins } = loadNouns();
  const { items: verbs, origins: vOrigins } = loadVerbs();

  const nErr = validateNouns(nouns, nOrigins);
  const vErr = validateVerbs(verbs, vOrigins);

  if (nErr.length || vErr.length) {
    console.error("❌ Validation failed.");
    [...nErr, ...vErr].forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log(`✅ Validation OK. (${nouns.length} nouns, ${verbs.length} verbs)`);
}
main();
