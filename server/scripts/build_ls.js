// server/scripts/build_ls.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Absolute paths based on THIS script's location (server/scripts/)
const RAW_PATH = path.resolve(__dirname, "../data/lexicon/ls_raw.txt");
const OUT_ENTRIES = path.resolve(__dirname, "../data/lexicon/ls_entries.json");
const OUT_INDEX = path.resolve(__dirname, "../data/lexicon/ls_index.json");

function latinKey(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "") // strip diacritics (macrons/breves)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z']/g, "");
}

function splitHeadBody(line) {
  const i = line.indexOf(",");
  if (i === -1) return null;
  return {
    head_display: line.slice(0, i).trim(),
    body_display: line.slice(i + 1).trim(),
  };
}

// Debug: prove the script is reading the file you think it is
if (!fs.existsSync(RAW_PATH)) {
  console.error("ERROR: ls_raw.txt not found at:", RAW_PATH);
  process.exit(1);
}

const raw = fs.readFileSync(RAW_PATH, "utf8");
const lines = raw.split(/\r?\n/);

const entries = [];
const index = {};

for (const line0 of lines) {
  const line = line0.trim();
  if (!line) continue;

  const parsed = splitHeadBody(line);
  if (!parsed) continue;

  const { head_display, body_display } = parsed;
  const head_key = latinKey(head_display);
  if (!head_key) continue;

  const id = entries.length;
  entries.push({ id, head_display, head_key, body_display });

  if (!index[head_key]) index[head_key] = [];
  index[head_key].push(id);
}

fs.writeFileSync(OUT_ENTRIES, JSON.stringify(entries, null, 2), "utf8");
fs.writeFileSync(OUT_INDEX, JSON.stringify(index, null, 2), "utf8");

console.log("OK");
console.log("Read:", RAW_PATH);
console.log("Wrote:", OUT_ENTRIES);
console.log("Wrote:", OUT_INDEX);
console.log("Entries:", entries.length);
