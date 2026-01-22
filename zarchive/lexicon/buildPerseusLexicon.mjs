// server/data/lexicon/buildPerseusLexicon.mjs
// Builds runtime-friendly Perseus lexicon files:
//   - perseus_entries.json : { [id]: { id, key, head, lemma, glosses } }
//   - perseus_index.json   : { [lemmaNorm]: [id list] }
// Also writes debug artifacts into ./build/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEntryFreeXml, normalizeLookupKey } from "./perseusEntryParser.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEXICON_DIR = __dirname;
const BUILD_DIR = path.join(LEXICON_DIR, "build");

const OUTPUT_ENTRIES = path.join(LEXICON_DIR, "perseus_entries.json");
const OUTPUT_INDEX = path.join(LEXICON_DIR, "perseus_index.json");
const OUTPUT_DEBUG = path.join(BUILD_DIR, "perseus_debug_entries.json");
const OUTPUT_META = path.join(BUILD_DIR, "perseus_build_meta.json");

// Try to auto-detect your Perseus XML.
const INPUT_CANDIDATES = [
  path.join(LEXICON_DIR, "perseus_latlex.xml"),
  path.join(LEXICON_DIR, "perseus", "latin-lexicon.xml"),
  path.join(LEXICON_DIR, "perseus", "latin-lexicon", "latin-lexicon.xml"),
  path.join(LEXICON_DIR, "perseus_latlex", "perseus_latlex.xml"),
  path.join(LEXICON_DIR, "perseus", "perseus_latlex.xml"),
];

function existingInputFiles() {
  const found = [];
  for (const p of INPUT_CANDIDATES) if (fs.existsSync(p)) found.push(p);
  return found;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safePush(map, key, value) {
  if (!key) return;
  if (!map[key]) map[key] = [];
  map[key].push(value);
}

// Streaming extraction of <entryFree> blocks.
async function extractEntryFreeBlocks(xmlPath, onEntry) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(xmlPath, { encoding: "utf8" });

    let buffer = "";
    let inEntry = false;
    let entryBuf = "";
    let count = 0;

    const START = "<entryFree";
    const END = "</entryFree>";

    stream.on("data", (chunk) => {
      buffer += chunk;

      while (true) {
        if (!inEntry) {
          const startIdx = buffer.indexOf(START);
          if (startIdx === -1) {
            buffer = buffer.slice(Math.max(0, buffer.length - 1024));
            break;
          }
          buffer = buffer.slice(startIdx);
          inEntry = true;
          entryBuf = "";
        }

        const endIdx = buffer.indexOf(END);
        if (endIdx === -1) {
          entryBuf += buffer;
          buffer = "";
          break;
        }

        const endPos = endIdx + END.length;
        entryBuf += buffer.slice(0, endPos);
        buffer = buffer.slice(endPos);
        inEntry = false;

        count += 1;
        onEntry(entryBuf, count);
        entryBuf = "";
      }
    });

    stream.on("end", () => resolve(count));
    stream.on("error", reject);
  });
}

function makeUniqueId(desired, used) {
  let id = desired || "entry";
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  let i = 2;
  while (used.has(`${id}__${i}`)) i += 1;
  const out = `${id}__${i}`;
  used.add(out);
  return out;
}

async function build() {
  const inputs = existingInputFiles();
  if (!inputs.length) {
    console.error("INPUT XML FILE(S) NOT FOUND. Checked:");
    for (const p of INPUT_CANDIDATES) console.error(" - " + p);
    console.error("\nFix: put your Perseus XML at one of the above locations, or add your path to INPUT_CANDIDATES.");
    process.exit(1);
  }

  ensureDir(BUILD_DIR);

  const entriesById = {};
  const index = {}; // lemmaNorm -> [ids]
  const usedIds = new Set();

  const debug = {
    parsed: 0,
    skippedNoLemma: 0,
    entriesWithoutGlosses: 0,
    sampleNoGloss: [],
    sampleBadHead: [],
  };

  for (const xmlPath of inputs) {
    console.log("Reading XML:", xmlPath);

    await extractEntryFreeBlocks(xmlPath, (entryXml, n) => {
      const parsed = parseEntryFreeXml(entryXml);
      debug.parsed += 1;

      if (!parsed.lemmaNorm) {
        debug.skippedNoLemma += 1;
        if (debug.sampleBadHead.length < 10) debug.sampleBadHead.push({ key: parsed.key, head: parsed.head });
        return;
      }

      // Preserve homograph numbering if Perseus provides it (key like exercitus1/exercitus2).
      const desiredId = parsed.key || parsed.idCandidate || parsed.lemmaNorm;
      const id = makeUniqueId(desiredId, usedIds);

      const entry = {
        id,
        key: parsed.key || null,
        head: parsed.head || parsed.lemma || null,
        lemma: parsed.lemma || null,
        lemmaNorm: parsed.lemmaNorm,
        homograph: parsed.homograph || null,
        glosses: Array.isArray(parsed.glosses) ? parsed.glosses : [],
      };

      entriesById[id] = entry;
      safePush(index, parsed.lemmaNorm, id);

      // Extra index key: digit-less head (just in case)
      const headKey = normalizeLookupKey(parsed.head || "");
      if (headKey && headKey !== parsed.lemmaNorm) safePush(index, headKey, id);

      if (!entry.glosses.length) {
        debug.entriesWithoutGlosses += 1;
        if (debug.sampleNoGloss.length < 20) debug.sampleNoGloss.push({ id, head: entry.head, lemma: entry.lemma });
      }

      if (n % 5000 === 0) console.log("  parsed entryFree blocks:", n);
    });
  }

  // Deduplicate index arrays for deterministic output.
  for (const k of Object.keys(index)) index[k] = Array.from(new Set(index[k]));

  const lemmaCount = Object.keys(index).length;
  const entryCount = Object.keys(entriesById).length;

  console.log("\n✅ Perseus lexicon build complete.");
  console.log("Entries:", entryCount);
  console.log("Unique lemmas:", lemmaCount);

  console.log("Writing:", OUTPUT_ENTRIES);
  fs.writeFileSync(OUTPUT_ENTRIES, JSON.stringify(entriesById, null, 2), "utf8");

  console.log("Writing:", OUTPUT_INDEX);
  fs.writeFileSync(OUTPUT_INDEX, JSON.stringify(index, null, 2), "utf8");

  fs.writeFileSync(OUTPUT_DEBUG, JSON.stringify(debug, null, 2), "utf8");
  fs.writeFileSync(
    OUTPUT_META,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        inputs,
        outputs: { entries: OUTPUT_ENTRIES, index: OUTPUT_INDEX, debug: OUTPUT_DEBUG },
        stats: {
          entryFreeBlocksParsed: debug.parsed,
          entriesWritten: entryCount,
          lemmasWritten: lemmaCount,
          entriesWithoutGlosses: debug.entriesWithoutGlosses,
          entriesWithoutLemma: debug.skippedNoLemma,
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
