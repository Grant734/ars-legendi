import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function tokenizeEnglish(s) {
  if (!s) return [];
  return s
    .replace(/[’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .flatMap((t) => (t.includes("-") ? t.split("-") : [t]))
    .filter(Boolean);
}

const STOP = new Set(
  `
a an the and or but if then else when while where who whom whose which that this these those
to of in on at by for from with without as is are was were be been being have has had do does did
not no nor so too very can could may might will would shall should
i you he she it we they me him her us them my your his its our their mine yours hers ours theirs
into over under again further more most some any each few such only own same than
`.trim().split(/\s+/)
);

function filteredWords(words) {
  return words.filter((w) => !STOP.has(w) && !/^\d+$/.test(w));
}

// Bigram Dice similarity (fast + good enough for headword vs form matching)
function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;

  const counts = new Map();
  for (const x of A) counts.set(x, (counts.get(x) || 0) + 1);

  let overlap = 0;
  for (const y of B) {
    const c = counts.get(y) || 0;
    if (c > 0) {
      overlap++;
      counts.set(y, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

// Roman numeral helpers (treat 'u' as 'v' because your lemmatizer sometimes does that)
const ROM = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(raw) {
  const s = raw.toLowerCase().replace(/u/g, "v");
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const val = ROM[s[i]];
    if (val < prev) total -= val;
    else {
      total += val;
      prev = val;
    }
  }
  return total;
}
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 10 && mod100 <= 20) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}
function romanGloss(lemma) {
  const m = lemma.toLowerCase().match(/^([ivxlcdmu]+)(us|a|um)?$/);
  if (!m) return null;
  const n = romanToInt(m[1]);
  if (n == null) return null;
  if (m[2]) return ordinal(n);
  return String(n);
}

// Praenomen abbreviations / weird single-letter lemmatizer artifacts
const PRAENOMEN = {
  "m.": "Marcus (abbr.)",
  "p.": "Publius (abbr.)",
  "q.": "Quintus (abbr.)",
  "l.": "Lucius (abbr.)",
  "c.": "Gaius (abbr.)",
  "cn.": "Gnaeus (abbr.)",
  "ti.": "Tiberius (abbr.)",
  "ser.": "Servius (abbr.)",
  "sex.": "Sextus (abbr.)",
  "sp.": "Spurius (abbr.)",
  "a.": "Aulus (abbr.)",
  "d.": "Decimus (abbr.)",
  // no-dot variants that sometimes show up:
  q: "Quintus (abbr.)",
  t: "Titus (abbr.)",
  cus: "Gaius (abbr.)", // common corruption of "C."
};

// English exonyms (override even if Perseus gives something else)
const EXONYM = {
  gallia: "Gaul",
  belga: "Belgae",
  belgae: "Belgae",
  aquitani: "Aquitani",
  celta: "Celts",
  celtus: "Celt",
  helvetia: "Helvetia",
  helvetii: "Helvetii",
  sequani: "Sequani",
  germanus: "German",
  germani: "Germans",
  oceanus: "Ocean",
  pyrenaeus: "Pyrenees",
  hispania: "Spain",
  provincia: "the Province (Roman Province)",
  rhodanus: "Rhône (river)",
  garumna: "Garonne (river)",
  matrona: "Marne (river)",
  sequana: "Seine (river)",
  rhenus: "Rhine (river)",
  arar: "Saône (river)",
  jura: "Jura (mountains)",
  boius: "Boii (Gallic tribe)",
  diuiciax: "Diviciacus (Aeduan leader)",
  uergobretus: "Vergobret (Aeduan chief magistrate)",
  uergobretum: "Vergobret (Aeduan chief magistrate)",
  treuer: "Treveri (Gallic tribe)",
  treueri: "Treveri (Gallic tribe)",
  segusiauus: "Segusiavi (Gallic tribe)",
  sequanis: "Sequani",
  sequanus: "Sequani",
};

// If a candidate gloss list is huge, keep the first 1–3 “headline” senses
function simplifyGlossList(glosses, maxItems = 3) {
  if (!Array.isArray(glosses)) return [];
  const out = [];
  const seen = new Set();
  for (const gRaw of glosses) {
    if (!gRaw || typeof gRaw !== "string") continue;
    let g = gRaw.trim();
    if (!g) continue;

    // split on semicolons, keep first chunk as main
    const parts = g.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      if (!p) continue;
      const cleaned = p.replace(/[.;:,]+$/, "").trim();
      if (!cleaned) continue;
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        out.push(cleaned);
      }
      if (out.length >= maxItems) break;
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

// Pull a guessed exonym-like token from translations (capitalized words excluding sentence-initial)
function guessCapitalName(translations) {
  const counts = new Map();
  for (const t of translations || []) {
    if (!t) continue;
    const words = t.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
    if (!words.length) continue;

    const first = (t.match(/^\s*([A-Z][a-zA-Z]+)/) || [])[1];
    for (const w of words) {
      if (first && w === first) continue;
      if (w === "I") continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  let best = null;
  let bestN = 0;
  for (const [w, n] of counts.entries()) {
    if (n > bestN) {
      best = w;
      bestN = n;
    }
  }
  return best;
}

function sidToSentence(dbg1Sentences, sid) {
  // sid like "10.3" => chapter "10", idx 3
  const [ch, idxStr] = String(sid).split(".");
  const idx = Number(idxStr);
  const arr = dbg1Sentences?.[ch];
  if (!Array.isArray(arr)) return "";
  return arr[idx] || "";
}

function normLetters(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, "");
}

function chooseBestSuggestion(lemma, entry, occs, translations) {
  const suggestions = entry?.suggestions || [];
  if (!suggestions.length) return null;

  const forms = (occs || []).map((o) => normLetters(o.form)).filter(Boolean);
  const transWords = new Set(filteredWords(tokenizeEnglish((translations || []).join(" "))));

  let best = null;
  let bestScore = -1;

  for (const s of suggestions) {
    const head = normLetters(s.headword || s.head_norm || "");
    const glossText = Array.isArray(s.glosses) ? s.glosses.join(" ") : "";
    const glossWords = new Set(filteredWords(tokenizeEnglish(glossText)));

    // form similarity
    let formScore = 0;
    if (head && forms.length) {
      for (const f of forms) {
        formScore = Math.max(formScore, dice(head, f));
      }
      // tiny prefix bonus
      if (forms.some((f) => f.startsWith(head.slice(0, Math.min(4, head.length))))) {
        formScore += 0.05;
      }
    }

    // translation overlap
    let overlap = 0;
    for (const w of glossWords) if (transWords.has(w)) overlap++;
    const transScore = overlap / (1 + glossWords.size);

    const score = 0.7 * formScore + 0.3 * transScore;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return best;
}

function main() {
  const ROOT = process.cwd();
  const DATA = path.join(ROOT, "server", "data");

  const PATH_LEMMAS = path.join(DATA, "caesar_lemmas.json");
  const PATH_GLOSSES = path.join(DATA, "caesar_lemma_glosses.json");
  const PATH_INDEX = path.join(DATA, "caesar/dbg1_lemma_index.json");
  const PATH_SENT = path.join(DATA, "caesar/dbg1_sentences.json");
  const PATH_TRANS = path.join(DATA, "caesar/dbg1_translations.json");

  for (const p of [PATH_LEMMAS, PATH_GLOSSES, PATH_INDEX, PATH_SENT, PATH_TRANS]) {
    if (!fs.existsSync(p)) {
      console.error("Missing required file:", p);
      process.exit(1);
    }
  }

  const lemmas = readJson(PATH_LEMMAS)?.lemmas || [];
  const baseGlosses = readJson(PATH_GLOSSES) || {};
  const lemmaIndex = readJson(PATH_INDEX);
  const dbg1Sentences = readJson(PATH_SENT);
  const translations = readJson(PATH_TRANS)?.by_sid || {};

  // backup
  const bak = PATH_GLOSSES + ".bak";
  fs.copyFileSync(PATH_GLOSSES, bak);

  const updated = { ...baseGlosses };
  const review = [];

  for (const lemma of lemmas) {
    const key = String(lemma);

    // overrides first
    if (PRAENOMEN[key]) {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: [PRAENOMEN[key]],
        note: "praenomen_abbrev_override",
      };
      continue;
    }
    if (EXONYM[key]) {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: [EXONYM[key]],
        note: "english_exonym_override",
      };
      continue;
    }

    const entry = updated[key] || {};
    const occsAll = lemmaIndex?.by_lemma?.[key] || [];
    const occs = occsAll.slice(0, 12);
    const transList = occs.map((o) => translations[o.sid]).filter(Boolean);

    // already good
    if (entry.status === "ok" && Array.isArray(entry.glosses) && entry.glosses.length) {
      entry.glosses = simplifyGlossList(entry.glosses, 3);
      updated[key] = entry;
      continue;
    }

    // roman numeral-ish
    const r = romanGloss(key);
    if (r) {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: [r],
        note: "roman_numeral_inferred",
      };
      continue;
    }

    // ellipsis token
    if (key === "..." || key === "…") {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: ["… (ellipsis)"],
        note: "punctuation",
      };
      continue;
    }

    // choose from suggestions (context-scored)
    if (entry.suggestions && entry.suggestions.length) {
      const best = chooseBestSuggestion(key, entry, occs, transList);
      if (best) {
        const gl = simplifyGlossList(best.glosses || [], 3);
        if (gl.length) {
          updated[key] = {
            status: "ok",
            source_headword: best.headword || key,
            matched_head_norm: best.head_norm || key,
            glosses: gl,
            note: "chosen_from_suggestions_using_forms+translation",
          };
          continue;
        }
      }
    }

    // guess capitalized proper-name from translation context
    const cap = guessCapitalName(transList);
    if (cap) {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: [cap],
        note: "guessed_from_translation_capitalization",
      };
      continue;
    }

    // enclitic handling: -que / -ve / -ne
    const enclitics = [
      ["que", "and"],
      ["ve", "or"],
      ["ne", "(question particle)"],
    ];
    let derived = null;
    for (const [suf, eng] of enclitics) {
      if (key.endsWith(suf) && key.length > suf.length + 1) {
        const base = key.slice(0, -suf.length);
        const baseEntry = updated[base];
        if (baseEntry?.status === "ok" && Array.isArray(baseEntry.glosses) && baseEntry.glosses.length) {
          derived = `${baseEntry.glosses[0]} + ${eng}`;
          break;
        }
      }
    }
    if (derived) {
      updated[key] = {
        status: "ok",
        source_headword: key,
        matched_head_norm: key,
        glosses: [derived],
        note: "derived_from_enclitic_suffix",
      };
      continue;
    }

    // last resort: keep lemma itself (but log it for manual review)
    const oneSid = occs[0]?.sid;
    const lat = oneSid ? sidToSentence(dbg1Sentences, oneSid) : "";
    const eng = oneSid ? (translations[oneSid] || "") : "";

    updated[key] = {
      status: "ok",
      source_headword: key,
      matched_head_norm: key,
      glosses: [key],
      note: "last_resort_lemma_as_gloss",
    };

    review.push(
      [
        `LEMMA: ${key}`,
        oneSid ? `SID: ${oneSid}` : `SID: (none)`,
        lat ? `LAT: ${lat}` : `LAT: (none)`,
        eng ? `ENG: ${eng}` : `ENG: (none)`,
        "",
      ].join("\n")
    );
  }

  writeJson(PATH_GLOSSES, updated);

  const reviewPath = path.join(DATA, "needs_manual_review.txt");
  fs.writeFileSync(reviewPath, review.join("\n-----------------------------\n"), "utf8");

  // report
  const total = lemmas.length;
  let ok = 0;
  let fallback = 0;
  for (const k of lemmas) {
    const e = updated[k];
    if (e?.status === "ok" && Array.isArray(e.glosses) && e.glosses.length) ok++;
    if (e?.note?.includes("last_resort")) fallback++;
  }

  console.log("✅ Gloss fill complete.");
  console.log("Output:", PATH_GLOSSES);
  console.log("Backup:", bak);
  console.log("Manual review file:", reviewPath);
  console.log(`Total lemmas: ${total}`);
  console.log(`With gloss: ${ok}`);
  console.log(`Needs manual review (fallback): ${fallback}`);
}

main();
