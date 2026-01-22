import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(express.json({ limit: "1mb" }));

// Resolves to: server/data/caesar/...
const CAESAR_DIR = path.join(__dirname, "..", "data", "caesar");

// NEW: teacher/assignment storage (kept outside Caesar data to avoid mixing)
const PILOT_DIR = path.join(__dirname, "..", "data", "pilot");
const TEACHERS_FILE = path.join(PILOT_DIR, "teachers.json");
const ASSIGNMENTS_FILE = path.join(PILOT_DIR, "assignments.json");
const SUBMISSIONS_FILE = path.join(PILOT_DIR, "submissions.json");

// Filenames under server/data/caesar. We try candidates in order and
// use the first that exists.
const FILES = {
  chapterVocab: [
    "dbg1_chapter_vocab_ok.json",
    "dbg1_vocab.json",
    "dbg1_targets.json",
    "targets.json",
    "dbg1_targets_flat.json",
    "dbg1_targets_by_chapter.json",
  ],
  lemmaGlosses: [
    "caesar_lemma_glosses_MASTER.json",
    "caesar_lemma_glosses.json",
    "caesar_lemma_glosses_REBUILT_core_ls.json",
  ],
  sentence: ["dbg1_sentences.json", "dbg1_sentence_index.json"],
  translations: ["dbg1_translations.json"],
  ud: ["dbg1_ud.json"],
  constructions: ["dbg1_constructions.json"],

};

const cache = {
  targets: null,
  glossary: null,
  sentence: null,
  translations: null,
  ud: null,
  constructions: null,
};

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function safeReadJson(filePath) {
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// atomic-ish write to reduce corruption risk
function safeWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function resolveFirstExisting(basenames) {
  for (const name of basenames) {
    const fp = path.join(CAESAR_DIR, name);
    if (exists(fp)) return fp;
  }
  return null;
}

function pickAndRead(basenames) {
  const fp = resolveFirstExisting(basenames);
  if (!fp) return null;
  return safeReadJson(fp);
}

function normalizeLemma(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function lemmaKeyVariants(lemma) {
  const base = normalizeLemma(lemma);
  if (!base) return [];
  const vToU = base.replace(/v/g, "u");
  const uToV = base.replace(/u/g, "v");
  return Array.from(new Set([base, vToU, uToV]));
}

function parseChapterFromSid(sid) {
  const m = String(sid || "").match(/^(\d+)[\.:]/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseIndexFromSid(sid) {
  const m = String(sid || "").match(/^\d+[\.:](\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function inferChapterFromTarget(t) {
  if (!t || typeof t !== "object") return null;
  const direct = Number(t.chapter ?? t.firstChapter);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const sid = t.example?.sid || t.sid;
  const parsed = parseChapterFromSid(sid);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return null;
}

function normalizeTargetsPayload(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.targets)) return payload.targets;

  const byChapter = payload.by_chapter || payload.byChapter;
  if (byChapter && typeof byChapter === "object") {
    const keys = Object.keys(byChapter).sort((a, b) => Number(a) - Number(b));
    const out = [];
    for (const k of keys) {
      const chObj = byChapter[k];
      const chNum = Number(k);
      const targets = Array.isArray(chObj?.targets) ? chObj.targets : [];
      for (const t of targets) {
        if (t && typeof t === "object") {
          out.push({ ...t, chapter: Number.isFinite(chNum) ? chNum : t.chapter });
        }
      }
    }
    return out;
  }

  return [];
}

function extractGlossShort(glosses) {
  if (Array.isArray(glosses) && glosses.length) {
    const g = String(glosses[0] || "").trim();
    return g || "";
  }
  if (typeof glosses === "string") return String(glosses).trim();
  return "";
}

function buildFormToLemmasIndex() {
  if (cache.formToLemmas) return cache.formToLemmas;

  const ud = loadUDOrThrow();
  const chaptersObj = normalizeUdChapters(ud);

  const map = {}; // formLower -> Set(lemmaNormalized)

  for (const chapterKey of Object.keys(chaptersObj || {})) {
    const sents = chaptersObj[chapterKey];
    if (!Array.isArray(sents)) continue;

    for (const sent of sents) {
      const toks = Array.isArray(sent?.tokens) ? sent.tokens : [];
      for (const t of toks) {
        const form = String(t?.text || "").trim().toLowerCase();
        const lem = String(t?.lemma || "").trim();
        if (!form || !lem) continue;

        const nl = normalizeLemma(lem);
        if (!map[form]) map[form] = new Set();
        map[form].add(nl);
      }
    }
  }

  // Convert Sets -> arrays for JSON friendliness
  const out = {};
  for (const [k, setv] of Object.entries(map)) out[k] = Array.from(setv);

  cache.formToLemmas = out;
  return out;
}


function loadGlossaryOrThrow() {
  if (cache.glossary) return cache.glossary;

  const payload = pickAndRead(FILES.lemmaGlosses);
  if (!payload) {
    throw new Error(`Missing lemma gloss file. Expected one of: ${FILES.lemmaGlosses.join(", ")}`);
  }

  const out = {};

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const [rawLemma, v] of Object.entries(payload)) {
      if (!rawLemma) continue;

      if (typeof v === "string" || typeof v === "number") {
        out[normalizeLemma(rawLemma)] = {
          lemma: normalizeLemma(rawLemma),
          dictionary_entry: "",
          glosses: [String(v)],
          gloss_short: String(v).trim(),
          raw: v,
        };
        continue;
      }

      if (v && typeof v === "object") {
        const dictEntry = String(v.dictionary_entry || v.entry || "").trim();
        const glosses = Array.isArray(v.glosses)
          ? v.glosses.map((g) => String(g)).filter(Boolean)
          : (typeof v.glosses === "string" ? [v.glosses] : []);

        out[normalizeLemma(rawLemma)] = {
          lemma: normalizeLemma(rawLemma),
          dictionary_entry: dictEntry,
          glosses,
          gloss_short: extractGlossShort(glosses),
          dictionary: v.dictionary || null,
          source: v.source || null,
          source_key: v.source_key || null,
          source_entry_raw: v.source_entry_raw || null,
        };
      }
    }
  }

  cache.glossary = out;
  return out;
}

function loadTargetsOrThrow() {
  if (cache.targets) return cache.targets;

  const payload = pickAndRead(FILES.chapterVocab);
  if (!payload) {
    throw new Error(`Missing targets file. Expected one of: ${FILES.chapterVocab.join(", ")}`);
  }

  const normalized = normalizeTargetsPayload(payload);
  cache.targets = normalized;
  return normalized;
}

function loadSentencesOrThrow() {
  if (cache.sentence) return cache.sentence;
  const s = pickAndRead(FILES.sentence);
  if (!s) throw new Error(`Missing sentences file. Expected one of: ${FILES.sentence.join(", ")}`);
  cache.sentence = s;
  return s;
}

function loadTranslationsOrThrow() {
  if (cache.translations) return cache.translations;
  const t = pickAndRead(FILES.translations);
  if (!t) throw new Error(`Missing translations file. Expected one of: ${FILES.translations.join(", ")}`);
  cache.translations = t;
  return t;
}

function normalizeUdChapters(ud) {
  if (ud && typeof ud === "object" && ud.chapters && typeof ud.chapters === "object") return ud.chapters;
  return ud;
}

function loadUDOrThrow() {
  if (cache.ud) return cache.ud;
  const ud = pickAndRead(FILES.ud);
  if (!ud) throw new Error(`Missing UD file. Expected one of: ${FILES.ud.join(", ")}`);
  cache.ud = ud;
  return ud;
}

function loadConstructions() {
  if (cache.constructions) return cache.constructions;

  const payload = pickAndRead(FILES.constructions);

  // Don't throw; allow frontend testing even if file isn't present yet.
  cache.constructions =
    (payload && typeof payload === "object") ? payload : { by_sentence: {} };

  return cache.constructions;
}

function getSentenceBySid(sid) {
  const s = loadSentencesOrThrow();

  let row = null;

  if (s && typeof s === "object") {
    if (s.by_sid && typeof s.by_sid === "object") row = s.by_sid[sid] || null;
    if (!row && Array.isArray(s.sentences)) row = s.sentences.find((x) => x?.sid === sid) || null;
    if (!row && Array.isArray(s)) row = s.find((x) => x?.sid === sid) || null;
    if (!row) row = s[sid] || null;

    // DBG chapter-array format: { "1": [ "latin...", ... ] }
    if (!row) {
      const ch = parseChapterFromSid(sid);
      const ix = parseIndexFromSid(sid);
      if (Number.isFinite(ch) && Number.isFinite(ix)) {
        const arr =
          (Array.isArray(s[String(ch)]) ? s[String(ch)] : null) ||
          (Array.isArray(s[ch]) ? s[ch] : null) ||
          null;
        if (arr && typeof arr[ix] === "string") row = arr[ix];
      }
    }
  }

  return row;
}

function extractLatinFromSentenceRow(row) {
  if (typeof row === "string") return row.trim();
  if (!row || typeof row !== "object") return "";

  const candidates = [
    row.latin,
    row.text,
    row.sentence,
    row.l,
    row.t,
    row.raw,
  ].filter((x) => typeof x === "string" && x.trim());

  if (candidates.length) return String(candidates[0]).trim();

  const tokens =
    (Array.isArray(row.tokens) ? row.tokens : null) ||
    (Array.isArray(row.words) ? row.words : null) ||
    null;

  if (tokens && tokens.length) {
    const forms = tokens
      .map((tok) => {
        if (typeof tok === "string") return tok;
        if (tok && typeof tok === "object") return tok.form || tok.text || tok.t || "";
        return "";
      })
      .filter(Boolean);
    return forms.join(" ").trim();
  }

  return "";
}

function getTranslationBySid(sid) {
  const t = loadTranslationsOrThrow();

  if (t && typeof t === "object") {
    if (t.by_sid && typeof t.by_sid === "object") {
      const v = t.by_sid[sid];
      if (typeof v === "string") return v.trim();
      if (v && typeof v === "object") return String(v.english || v.translation || "").trim();
    }

    const direct = t[sid];
    if (typeof direct === "string") return direct.trim();
    if (direct && typeof direct === "object") return String(direct.english || direct.translation || "").trim();

    if (Array.isArray(t)) {
      const row = t.find((x) => x?.sid === sid);
      if (row && typeof row === "object") return String(row.english || row.translation || "").trim();
    }

    if (Array.isArray(t.translations)) {
      const row = t.translations.find((x) => x?.sid === sid);
      if (row && typeof row === "object") return String(row.english || row.translation || "").trim();
    }
  }

  return "";
}

// --- Canonical alignment: merge dbg1_UD rows to match dbg1_sentences boundaries ---

function normForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    // keep letters/digits only for robust matching across punctuation/abbr splits
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/j/g, "i")
    .replace(/v/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

function mergeTokensWithOffsets(udRows) {
  const out = [];
  let offset = 0;

  for (const row of udRows) {
    const toks = Array.isArray(row?.tokens) ? row.tokens : [];
    for (const t of toks) {
      const id = Number(t.id);
      const head = Number(t.head);

      const next = { ...t };

      // renumber token ids sequentially across merged rows
      if (Number.isFinite(id)) next.id = id + offset;
      else next.id = out.length + 1;

      // offset dependency heads if present (0 stays 0)
      if (Number.isFinite(head)) {
        next.head = head === 0 ? 0 : head + offset;
      }

      out.push(next);
    }
    offset = out.length;
  }

  // ensure strictly 1..N if anything odd slipped in
  out.forEach((t, i) => {
    t.id = i + 1;
    if (typeof t.text !== "string") t.text = t.form ?? t.word ?? "";
    if (typeof t.form !== "string") t.form = t.text ?? "";
  });

  return out;
}

function offsetConstruction(c, tokenOffset) {
  const o = { ...c };

  // common span fields
  if (o.start != null && Number.isFinite(Number(o.start))) o.start = Number(o.start) + tokenOffset;
  if (o.end != null && Number.isFinite(Number(o.end))) o.end = Number(o.end) + tokenOffset;

  // highlight_spans: [[s,e],...]
  if (Array.isArray(o.highlight_spans)) {
    o.highlight_spans = o.highlight_spans.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) return pair;
      const s = Number(pair[0]);
      const e = Number(pair[1]);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return pair;
      return [s + tokenOffset, e + tokenOffset];
    });
  }

  return o;
}

function mergeConstructionsBySid(consBySentence, udRows) {
  const merged = [];
  let tokenOffset = 0;

  for (const row of udRows) {
    const sid = String(row?.sid ?? "");
    const toks = Array.isArray(row?.tokens) ? row.tokens : [];
    const cs = Array.isArray(consBySentence?.[sid]) ? consBySentence[sid] : [];

    for (const c of cs) {
      merged.push(offsetConstruction(c, tokenOffset));
    }

    tokenOffset += toks.length;
  }

  return merged;
}

// Align one chapter:
// - canonicalSentences: array of full Latin sentences (dbg1_sentences.json[chapter])
// - udRows: array of UD sentence rows (dbg1_UD.json.chapters[chapter])
// Returns: merged sentence bundles with canonical sid `${chapter}.${i}`
function alignChapterToCanonical({ chapterNum, canonicalSentences, udRows, consBySentence }) {
  const canon = Array.isArray(canonicalSentences) ? canonicalSentences : [];
  const ud = Array.isArray(udRows) ? udRows : [];

  const out = [];
  let j = 0; // pointer into ud rows

  for (let i = 0; i < canon.length; i++) {
    const targetText = String(canon[i] || "");
    const targetNorm = normForMatch(targetText);

    const startJ = j;
    let accText = "";
    let accRows = [];

    // Merge UD rows until normalized text matches canonical
    while (j < ud.length) {
      const piece = String(ud[j]?.text || "");
      accText = (accText ? accText + " " : "") + piece;
      accRows.push(ud[j]);

      if (normForMatch(accText) === targetNorm) {
        break;
      }
      j++;
    }

    // If we matched, build merged bundle.
    // If we failed to match (ran off end or mismatch), fall back to one UD row to avoid infinite loops.
    let rowsToUse = accRows;
    if (!rowsToUse.length || normForMatch(accText) !== targetNorm) {
      // fallback: use single UD row (if available), and don’t advance canon too aggressively
      rowsToUse = ud[startJ] ? [ud[startJ]] : [];
      j = Math.max(startJ, j); // keep j sane
    }

    // Advance UD pointer past what we consumed (only if we actually consumed multiple)
    // If we matched in the while loop, j currently points at last included row.
    // If we failed, rowsToUse is 1 row and j may be unchanged; set j = startJ + 1.
    if (rowsToUse.length) {
      const consumed = rowsToUse.length;
      j = startJ + consumed;
    }

    const sid = `${chapterNum}.${i}`;

    const tokens = mergeTokensWithOffsets(rowsToUse);
    const constructions = mergeConstructionsBySid(consBySentence, rowsToUse);

    out.push({
      sid,
      chapter: chapterNum,
      index: i,
      text: targetText,
      tokens,
      constructions,
      // optional debug field (handy while validating)
      _ud_sids: rowsToUse.map((r) => String(r?.sid ?? "")),
    });
  }

  return out;
}

// Build a cache so both chapterBundle and sentenceBundle share the same aligned view.
let __ALIGNED_CACHE = null;

function clearCaesarCaches() {
  __ALIGNED_CACHE = null;

  // clear file-level caches too (these are defined at the top of caesar.mjs)
  cache.targets = null;
  cache.glossary = null;
  cache.sentence = null;
  cache.translations = null;
  cache.ud = null;
  cache.constructions = null;
  cache.formToLemmas = null;
}

function maybeRefreshFromQuery(req) {
  const v = req.query.refresh ?? req.query.reload ?? req.query.nocache;
  if (v == null) return;
  const s = String(v).toLowerCase();
  if (s === "1" || s === "true" || s === "yes") clearCaesarCaches();
}



function getAlignedCache({ loadUDOrThrow, loadSentencesOrThrow, loadConstructionsOrThrow }) {
  if (__ALIGNED_CACHE) return __ALIGNED_CACHE;

  const ud = loadUDOrThrow();                 // dbg1_UD.json
  const sentences = loadSentencesOrThrow();   // dbg1_sentences.json
  const constructions = loadConstructionsOrThrow(); // { by_sentence: {sid: [...]}, ... }

  const consBySentence = constructions?.by_sentence || {};

  const byChapter = {};
  const bySid = {};

  const chaptersObj = ud?.chapters || {};
  const chapterNums = Object.keys(sentences || {})
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const ch of chapterNums) {
    const canon = sentences[String(ch)] || [];
    const udRows = chaptersObj[String(ch)] || [];

    const aligned = alignChapterToCanonical({
      chapterNum: ch,
      canonicalSentences: canon,
      udRows,
      consBySentence,
    });

    byChapter[String(ch)] = aligned;
    for (const b of aligned) bySid[String(b.sid)] = b;
  }

  __ALIGNED_CACHE = { byChapter, bySid };
  return __ALIGNED_CACHE;
}

// ---- endpoints ----

router.get("/targets", (req, res) => {
  try {
    const rawTargets = loadTargetsOrThrow();
    const glossary = loadGlossaryOrThrow();

    const enriched = rawTargets
      .filter((t) => t && typeof t === "object")
      .map((t) => {
        const lemma = t.lemma;
        let entry = null;

        for (const k of lemmaKeyVariants(lemma)) {
          if (glossary[k]) {
            entry = glossary[k];
            break;
          }
        }

        const chapter = inferChapterFromTarget(t);

        const dictEntry = String(entry?.dictionary_entry || "").trim();
        const glosses = Array.isArray(entry?.glosses) ? entry.glosses : [];
        const glossShort = String(entry?.gloss_short || "").trim();

        // Frontend expects `gloss` (single short definition). Keep `gloss_short` too.
        const gloss = glossShort || (glosses[0] ? String(glosses[0]) : "");

        return {
          ...t,
          chapter: chapter ?? t.chapter ?? t.firstChapter ?? null,
          dictionary_entry: dictEntry,
          glosses,
          gloss,
          gloss_short: gloss,
        };
      });

    res.json({ targets: enriched });
  } catch (e) {
    res.status(404).json({ error: e?.message || "targets error" });
  }
});

// OLD: simple example (plain latin + english). Keep it for compatibility.
router.get("/example", (req, res) => {
  try {
    const sid = String(req.query.sid || "").trim();
    if (!sid) return res.status(400).json({ error: "missing sid" });

    const row = getSentenceBySid(sid);
    const latin = extractLatinFromSentenceRow(row);
    const english = getTranslationBySid(sid);

    res.json({ sid, latin, english });
  } catch (e) {
    res.status(500).json({ error: e?.message || "example error" });
  }
});

// NEW: tokenized bundle for CaesarSentence.jsx
router.get("/sentenceBundle", (req, res) => {
  
  try {
    maybeRefreshFromQuery(req);

    const sid = String(req.query.sid || "").trim();
    if (!sid) return res.status(400).json({ error: "missing sid" });

    const cache = getAlignedCache({
      loadUDOrThrow,
      loadSentencesOrThrow,
      loadConstructionsOrThrow: loadConstructions,
    });

    const s = cache.bySid[sid];
    if (!s) return res.status(404).json({ error: "sid not found" });

    const translation = getTranslationBySid(sid);

    const bundle = {
      sid,
      chapter: s?.chapter ?? parseChapterFromSid(sid),
      index: s?.index ?? null,
      text: s?.text ?? "",
      tokens: Array.isArray(s?.tokens) ? s.tokens : [],
      constructions: Array.isArray(s?.constructions) ? s.constructions : [],
      translation,
      _ud_sids: s?._ud_sids, // optional: keep while debugging
    };

    res.json({ ...bundle, sentence: bundle });
  } catch (e) {
    res.status(500).json({ error: e?.message || "sentenceBundle error" });
  }
});

router.get("/examples", (req, res) => {
  try {
    maybeRefreshFromQuery(req);

    const raw = String(req.query.types || req.query.type || "").trim();
    if (!raw) return res.status(400).json({ error: "missing ?types= (comma-separated)" });

    const types = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!types.length) return res.status(400).json({ error: "no valid types provided" });

    const typeSet = new Set(types);

    const cache = getAlignedCache({
      loadUDOrThrow,
      loadSentencesOrThrow,
      loadConstructionsOrThrow: loadConstructions,
    });

    const chapterNums = Object.keys(cache.byChapter || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const items = [];
    const instanceCounts = {};
    const subtypeCounts = {};

    for (const ch of chapterNums) {
      const arr = cache.byChapter[String(ch)] || [];
      for (const s of arr) {
        const sid = String(s?.sid || "");
        const cons = Array.isArray(s?.constructions) ? s.constructions : [];
        const matches = [];

        for (const c of cons) {
          const t = String(c?.type || "");
          if (!typeSet.has(t)) continue;

          instanceCounts[t] = (instanceCounts[t] || 0) + 1;

          // subtype accounting (conditionals use c.conditional.label)
          let subKey = null;
          if (t === "conditional_protasis" || t === "conditional_apodosis") {
            const label = c?.conditional?.label || "mixed";
            subKey = `conditional:${label}`;
          } else {
            const st = c?.subtype || "default";
            subKey = `${t}:${st}`;
          }
          subtypeCounts[subKey] = (subtypeCounts[subKey] || 0) + 1;

          matches.push({
            type: c.type,
            subtype: c.subtype || null,
            confidence: c.confidence ?? null,
            conditional: c.conditional || null,
          });
        }

        if (matches.length) {
          items.push({
            sid,
            chapter: s?.chapter ?? ch,
            index: s?.index ?? null,
            matches,
          });
        }
      }
    }

    res.json({
      types,
      sentence_count: items.length,
      instance_counts: instanceCounts,
      subtype_counts: subtypeCounts,
      items, // Caesar order (chapter then sentence order)
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get("/chapters", (req, res) => {
  try {
    const ud = loadUDOrThrow();
    const chaptersObj = normalizeUdChapters(ud);

    const chapters = Object.keys(chaptersObj || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    // You can keep this minimal, or include counts (helpful for UI)
    const chapterMeta = chapters.map((ch) => ({
      chapter: ch,
      sentence_count: Array.isArray(chaptersObj[String(ch)]) ? chaptersObj[String(ch)].length : 0,
    }));

    res.json({ chapters: chapterMeta });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get("/chapterBundle", (req, res) => {
  try {
    maybeRefreshFromQuery(req);

    const ch = Number(req.query.chapter);
    if (!Number.isFinite(ch)) return res.status(400).json({ error: "Missing or invalid ?chapter=" });

    const cache = getAlignedCache({
      loadUDOrThrow,
      loadSentencesOrThrow,
      loadConstructionsOrThrow: loadConstructions, // your existing loader
    });

    const aligned = cache.byChapter[String(ch)];
    if (!Array.isArray(aligned)) {
      return res.status(404).json({ error: `Chapter not found: ${ch}` });
    }

    // Only thing left to do here: attach translation by canonical sid
    const bundle = aligned.map((s) => {
      const sid = String(s?.sid || "");
      return {
        ...s,
        sid,
        chapter: s?.chapter ?? ch,
        index: s?.index ?? null,
        text: s?.text ?? "",
        tokens: Array.isArray(s?.tokens) ? s.tokens : [],
        constructions: Array.isArray(s?.constructions) ? s.constructions : [],
        translation: sid ? getTranslationBySid(sid) : null,
      };
    });

    res.json({ chapter: ch, sentences: bundle });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ------------------------------
// Coverage Data Endpoints
// ------------------------------

// GET /api/caesar/constructionCounts
// Returns total count of each construction type in the entire corpus
// Used for calculating grammar coverage (instances correct / total instances in text)
router.get("/constructionCounts", (req, res) => {
  try {
    maybeRefreshFromQuery(req);

    const constructions = loadConstructions();
    const bySentence = constructions?.by_sentence || {};

    const counts = {};
    const bySubtype = {};

    for (const [sid, instances] of Object.entries(bySentence)) {
      if (!Array.isArray(instances)) continue;

      for (const instance of instances) {
        const type = String(instance?.type || "").trim();
        if (!type) continue;

        counts[type] = (counts[type] || 0) + 1;

        // Also track by subtype for more detailed analysis
        const subtype = instance.subtype || "default";
        const key = `${type}:${subtype}`;
        bySubtype[key] = (bySubtype[key] || 0) + 1;
      }
    }

    res.json({
      ok: true,
      counts,
      bySubtype,
      totalSentences: Object.keys(bySentence).length,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "constructionCounts error" });
  }
});

// GET /api/caesar/vocabCounts
// Returns total vocab count per chapter
// Used for calculating vocabulary coverage (items correct / total items in chapter)
router.get("/vocabCounts", (req, res) => {
  try {
    const targets = loadTargetsOrThrow();

    const byChapter = {};
    let totalWords = 0;

    for (const t of targets) {
      const ch = inferChapterFromTarget(t);
      if (ch && Number.isFinite(ch)) {
        byChapter[ch] = (byChapter[ch] || 0) + 1;
        totalWords++;
      }
    }

    // Sort chapters numerically
    const sortedChapters = Object.keys(byChapter)
      .map(Number)
      .sort((a, b) => a - b);

    const orderedByChapter = {};
    for (const ch of sortedChapters) {
      orderedByChapter[ch] = byChapter[ch];
    }

    res.json({
      ok: true,
      byChapter: orderedByChapter,
      totalWords,
      chapterCount: sortedChapters.length,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "vocabCounts error" });
  }
});

// ------------------------------
// Grammar Practice: chunk generator
// ------------------------------

function sentenceHasType(sentence, type) {
  const cons = Array.isArray(sentence?.constructions) ? sentence.constructions : [];
  return cons.some((c) => String(c?.type || "") === type);
}

function countInstancesByType(sentences) {
  const counts = {};
  for (const s of sentences) {
    const cons = Array.isArray(s?.constructions) ? s.constructions : [];
    for (const c of cons) {
      const t = String(c?.type || "").trim();
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

function uniqueTypesInSentences(sentences) {
  const set = new Set();
  for (const s of sentences) {
    const cons = Array.isArray(s?.constructions) ? s.constructions : [];
    for (const c of cons) {
      const t = String(c?.type || "").trim();
      if (t) set.add(t);
    }
  }
  return set;
}

function attachTranslation(s) {
  const sid = String(s?.sid || "");
  return {
    sid,
    chapter: s?.chapter ?? parseChapterFromSid(sid),
    index: s?.index ?? null,
    text: s?.text ?? "",
    tokens: Array.isArray(s?.tokens) ? s.tokens : [],
    constructions: Array.isArray(s?.constructions) ? s.constructions : [],
    translation: sid ? getTranslationBySid(sid) : null,
  };
}

function blockMetaFromSlice(slice) {
  const startSid = String(slice?.[0]?.sid || "");
  const endSid = String(slice?.[slice.length - 1]?.sid || "");
  return {
    startSid,
    endSid,
    label: startSid && endSid ? `DBG1 ${startSid}–${endSid}` : "DBG1 excerpt",
  };
}

/**
 * Normalize span from construction, matching client-side logic.
 * Returns [start, end] pair.
 */
function normalizedSpanFromConstruction(c) {
  const s = Number(c?.start ?? -1);
  const e = Number(c?.end ?? -1);
  if (Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e >= 0) {
    return [Math.min(s, e), Math.max(s, e)];
  }
  const hs = Array.isArray(c?.highlight_spans) ? c.highlight_spans : [];
  if (!hs.length) return [0, 0];
  let min = Infinity;
  let max = -Infinity;
  for (const pair of hs) {
    const a = Number(pair?.[0]);
    const b = Number(pair?.[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    min = Math.min(min, a, b);
    max = Math.max(max, a, b);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  return [min, max];
}

/**
 * Generate a stable instance ID for a non-conditional construction.
 * Must match the format used in GrammarPractice.jsx (line 732):
 *   `${sid}|${type}|${subtype}|${span[0]}|${span[1]}|${index}`
 */
function generateInstanceId(sid, construction, index) {
  const type = String(construction?.type || "");
  const subtype = construction?.subtype ? String(construction.subtype) : "";
  const span = normalizedSpanFromConstruction(construction);
  return `${sid}|${type}|${subtype}|${span[0]}|${span[1]}|${index}`;
}

/**
 * Count unmastered instances of a specific type in a window.
 * Note: This only handles non-conditional types. Conditionals use complex pairKey-based IDs
 * and are filtered client-side to keep existing conditionals logic untouched.
 * @param {Array} sentences - Array of sentence objects
 * @param {string} targetType - The construction type to count
 * @param {Set} masteredSet - Set of mastered instance IDs
 * @returns {number} Count of unmastered instances
 */
function countUnmasteredInstances(sentences, targetType, masteredSet) {
  // Skip mastery filtering for conditionals (handled client-side)
  if (targetType === "conditional_protasis" || targetType === "conditional_apodosis") {
    // Just count all instances
    let count = 0;
    for (const s of sentences) {
      const cons = Array.isArray(s?.constructions) ? s.constructions : [];
      for (const c of cons) {
        if (String(c?.type || "") === targetType) count++;
      }
    }
    return count;
  }

  let count = 0;
  for (const s of sentences) {
    const sid = String(s?.sid || "");
    const cons = Array.isArray(s?.constructions) ? s.constructions : [];
    for (let i = 0; i < cons.length; i++) {
      const c = cons[i];
      const t = String(c?.type || "");
      if (t !== targetType) continue;
      const instanceId = generateInstanceId(sid, c, i);
      if (!masteredSet.has(instanceId)) {
        count++;
      }
    }
  }
  return count;
}

// GET /api/caesar/practiceChunk?type=all&n=12
// GET /api/caesar/practiceChunk?type=cum_clause   (single-type mode)
// GET /api/caesar/practiceChunk?type=all&n=12
// GET /api/caesar/practiceChunk?type=cum_clause
router.get("/practiceChunk", (req, res) => {
  try {
    maybeRefreshFromQuery(req);
    res.set("Cache-Control", "no-store");

    const typeRaw = String(req.query.type || "all").trim();
    const type = typeRaw || "all";
    const excludeRaw = String(req.query.exclude || "");
    const excludeSet = new Set(
      excludeRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    // Parse mastered instance IDs for instance-level filtering
    const masteredRaw = String(req.query.mastered || "");
    const masteredSet = new Set(
      masteredRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const cache = getAlignedCache({
      loadUDOrThrow,
      loadSentencesOrThrow,
      loadConstructionsOrThrow: loadConstructions,
    });

    // Build global in-order list across all chapters
    const chapterNums = Object.keys(cache.byChapter || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const global = [];
    for (const ch of chapterNums) {
      const arr = cache.byChapter[String(ch)] || [];
      for (const s of arr) global.push(s);
    }

    if (!global.length) {
      return res.status(500).json({ error: "No aligned sentences available" });
    }

    // Helpers kept local so this block is truly drop-in.
    function attachTranslation(s) {
      const sid = String(s?.sid || "");
      return {
        sid,
        chapter: s?.chapter ?? parseChapterFromSid(sid),
        index: s?.index ?? null,
        text: s?.text ?? "",
        tokens: Array.isArray(s?.tokens) ? s.tokens : [],
        constructions: Array.isArray(s?.constructions) ? s.constructions : [],
        translation: sid ? getTranslationBySid(sid) : null,
      };
    }

    function blockMetaFromSlice(slice) {
      const startSid = String(slice?.[0]?.sid || "");
      const endSid = String(slice?.[slice.length - 1]?.sid || "");
      return {
        startSid,
        endSid,
        label: startSid && endSid ? `DBG1 ${startSid}–${endSid}` : "DBG1 excerpt",
      };
    }

    function sentenceHasType(sentence, t) {
      const cons = Array.isArray(sentence?.constructions) ? sentence.constructions : [];
      return cons.some((c) => String(c?.type || "") === t);
    }

    function countInstancesByType(sentences) {
      const counts = {};
      for (const s of sentences) {
        const cons = Array.isArray(s?.constructions) ? s.constructions : [];
        for (const c of cons) {
          const t = String(c?.type || "").trim();
          if (!t) continue;
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      return counts;
    }

    // ---------- ALL MODE ----------
    if (type === "all") {
      const nQuery = Number(req.query.n);
      const N = Number.isFinite(nQuery) && nQuery >= 6 && nQuery <= 20 ? nQuery : 12;
      
      if (global.length < N) return res.status(500).json({ error: `Not enough sentences for N=${N}` });

      function normalizedTypeForVariety(t) {
        if (t === "conditional_protasis" || t === "conditional_apodosis") return "conditionals";
        return t;
      }

      let slice = null;
      let startIndex = null;

      for (let attempt = 0; attempt < 800; attempt++) {
        const start = crypto.randomInt(0, global.length - N + 1);
        const candidate = global.slice(start, start + N);
        const excerptIdTry = `all:all:${start}:${N}`;
        if (excludeSet.has(excerptIdTry)) continue;
        
        const variety = new Set();
        for (const s of candidate) {
          const cons = Array.isArray(s?.constructions) ? s.constructions : [];
          for (const c of cons) {
            const t = String(c?.type || "").trim();
            if (!t) continue;
            variety.add(normalizedTypeForVariety(t));
          }
        }

        if (variety.size >= 4) {
          slice = candidate;
          startIndex = start;
          break;
        }
      }

      if (!slice) {
        // still honor exclude list if possible
        for (let tries = 0; tries < 80; tries++) {
          startIndex = crypto.randomInt(0, global.length - N + 1);
          const excerptIdTry = `all:all:${startIndex}:${N}`;
          if (!excludeSet.has(excerptIdTry)) break;
        }
        slice = global.slice(startIndex, startIndex + N);
      }
      

      const sentencesOut = slice.map(attachTranslation);
      const countsByType = countInstancesByType(sentencesOut);
      const excerptId = `all:all:${startIndex}:${N}`;

      return res.json({
        mode: "all",
        type: "all",
        n: sentencesOut.length,
        countsByType,
        blocks: [
          {
            excerptId,
            ...blockMetaFromSlice(sentencesOut),
            startIndex,
            sentences: sentencesOut,
          },
        ],
      });
    }

    // ---------- SINGLE MODE ----------
    // This is where you were accidentally deterministic.
    // We now choose RANDOMLY among the best eligible windows.
    // ---------- SINGLE MODE CONFIG ----------
    const CONFIG = {
      // 4-sentence modes (2 instances required, except where noted)
      abl_abs: { n: 4, minTargets: 2, targetType: "abl_abs" },
      cum_clause: { n: 4, minTargets: 2, targetType: "cum_clause" },
      gerund: { n: 4, minTargets: 2, targetType: "gerund" },
      gerundive: { n: 4, minTargets: 2, targetType: "gerundive" },
      gerund_gerundive_flip: { n: 4, minTargets: 1, targetType: "gerund_gerundive_flip" },
      subjunctive_relative_clause: { n: 4, minTargets: 1, targetType: "subjunctive_relative_clause" },

      // 5-sentence modes (2 instances required)
      indirect_statement: { n: 5, minTargets: 2, targetType: "indirect_statement" },
      purpose_clause: { n: 5, minTargets: 2, targetType: "purpose_clause" },
      result_clause: { n: 5, minTargets: 2, targetType: "result_clause" },
      relative_clause: { n: 5, minTargets: 2, targetType: "relative_clause" },

      // conditionals special (2 protases, prefers apodoses too)
      conditionals: {
        n: 4,
        minTargets: 2,
        targetType: "conditional_protasis",
        preferAlso: "conditional_apodosis",
      },
    };


    const cfg = CONFIG[type] || { n: 6, minTargets: 2, targetType: type, preferAlso: null };

    // allow client to request the exact window size it’s displaying
    const nQuery = Number(req.query.n);
    const N = Number.isFinite(nQuery) && nQuery >= 2 && nQuery <= 20 ? nQuery : cfg.n;

    const minTargets = cfg.minTargets;
    const targetType = cfg.targetType;
    const preferAlso = cfg.preferAlso;

    if (global.length < N) return res.status(500).json({ error: `Not enough sentences for N=${N}` });

    // Build all eligible windows (with mastery filtering for non-conditional types)
    const eligible = [];
    const eligibleIgnoringMastery = []; // for fallback when all instances mastered
    for (let start = 0; start <= global.length - N; start++) {
      const candidate = global.slice(start, start + N);

      let targetCount = 0;
      let preferCount = 0;

      for (const s of candidate) {
        if (sentenceHasType(s, targetType)) targetCount++;
        if (preferAlso && sentenceHasType(s, preferAlso)) preferCount++;
      }

      if (targetCount < minTargets) continue;

      const extra = targetCount - minTargets; // smaller is better

      // Always track eligibleIgnoringMastery for fallback
      eligibleIgnoringMastery.push({ start, candidate, targetCount, preferCount, extra });

      // Apply mastery filtering for non-conditional types
      if (masteredSet.size > 0) {
        const unmasteredCount = countUnmasteredInstances(candidate, targetType, masteredSet);
        // Skip windows where all target instances are already mastered
        if (unmasteredCount === 0) continue;
      }

      eligible.push({ start, candidate, targetCount, preferCount, extra });
    }

    let chosen = null;
    let warning = null;
    let allMastered = false;

    if (eligible.length) {
      // Find the "best band": min extra, then max preferCount
      let bestExtra = Infinity;
      for (const e of eligible) bestExtra = Math.min(bestExtra, e.extra);

      const band = eligible.filter((e) => e.extra === bestExtra);

      let bestPrefer = -Infinity;
      for (const e of band) bestPrefer = Math.max(bestPrefer, e.preferCount);

      const top = band.filter((e) => e.preferCount === bestPrefer);

      const topNotExcluded = top.filter(
        (e) => !excludeSet.has(`single:${type}:${e.start}:${N}`)
      );

      const pool = topNotExcluded.length ? topNotExcluded : top;

      const pick = pool[crypto.randomInt(0, pool.length)];
      chosen = pick;

    } else if (masteredSet.size > 0 && eligibleIgnoringMastery.length) {
      // All instances of this type are mastered - allow re-practice
      allMastered = true;

      // Use the same band selection logic on eligibleIgnoringMastery
      let bestExtra = Infinity;
      for (const e of eligibleIgnoringMastery) bestExtra = Math.min(bestExtra, e.extra);

      const band = eligibleIgnoringMastery.filter((e) => e.extra === bestExtra);

      let bestPrefer = -Infinity;
      for (const e of band) bestPrefer = Math.max(bestPrefer, e.preferCount);

      const top = band.filter((e) => e.preferCount === bestPrefer);

      const topNotExcluded = top.filter(
        (e) => !excludeSet.has(`single:${type}:${e.start}:${N}`)
      );

      const pool = topNotExcluded.length ? topNotExcluded : top;

      const pick = pool[crypto.randomInt(0, pool.length)];
      chosen = pick;

    } else {
      let start = 0;

      for (let tries = 0; tries < 80; tries++) {
        start = crypto.randomInt(0, global.length - N + 1);
        const excerptIdTry = `single:${type}:${start}:${N}`;
        if (!excludeSet.has(excerptIdTry)) break;
      }

      chosen = {
        start,
        candidate: global.slice(start, start + N),
        targetCount: 0,
        preferCount: 0,
        extra: 0,
      };

      warning = `Could not satisfy minTargets=${minTargets} for type="${type}" (targetType="${targetType}"). Returned a random excerpt.`;

    }

    const sentencesOut = chosen.candidate.map(attachTranslation);
    const countsByType = countInstancesByType(sentencesOut);
    const excerptId = `single:${type}:${chosen.start}:${N}`;

    return res.json({
      mode: "single",
      type,
      n: sentencesOut.length,
      countsByType,
      blocks: [
        {
          excerptId,
          ...blockMetaFromSlice(sentencesOut),
          startIndex: chosen.start,
          sentences: sentencesOut,
        },
      ],
      constraints: { n: N, minTargets, targetType, preferAlso },
      warning,
      allMastered, // true when user has mastered all instances and we're allowing re-practice
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// GET /api/caesar/practicePoolSize?type=all&n=12
// Returns the total number of available excerpt windows for a given type and window size.
// Used by the client to compute "seen X of Y" progress.
router.get("/practicePoolSize", (req, res) => {
  try {
    maybeRefreshFromQuery(req);
    res.set("Cache-Control", "no-store");

    const typeRaw = String(req.query.type || "all").trim();
    const type = typeRaw || "all";

    const cache = getAlignedCache({
      loadUDOrThrow,
      loadSentencesOrThrow,
      loadConstructionsOrThrow: loadConstructions,
    });

    // Build global in-order list across all chapters
    const chapterNums = Object.keys(cache.byChapter || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const global = [];
    for (const ch of chapterNums) {
      const arr = cache.byChapter[String(ch)] || [];
      for (const s of arr) global.push(s);
    }

    if (!global.length) {
      return res.status(500).json({ error: "No aligned sentences available" });
    }

    function sentenceHasType(sentence, t) {
      const cons = Array.isArray(sentence?.constructions) ? sentence.constructions : [];
      return cons.some((c) => String(c?.type || "") === t);
    }

    // ---------- ALL MODE ----------
    if (type === "all") {
      const nQuery = Number(req.query.n);
      const N = Number.isFinite(nQuery) && nQuery >= 6 && nQuery <= 20 ? nQuery : 12;

      if (global.length < N) {
        return res.status(500).json({ error: `Not enough sentences for N=${N}` });
      }

      // All possible starting positions
      const totalWindows = global.length - N + 1;

      return res.json({ type: "all", n: N, totalWindows });
    }

    // ---------- SINGLE MODE ----------
    const CONFIG = {
      abl_abs: { n: 4, minTargets: 2, targetType: "abl_abs" },
      gerund: { n: 4, minTargets: 2, targetType: "gerund" },
      gerundive: { n: 4, minTargets: 2, targetType: "gerundive" },
      gerund_gerundive_flip: { n: 4, minTargets: 1, targetType: "gerund_gerundive_flip" },
      cum_clause: { n: 6, minTargets: 2, targetType: "cum_clause" },
      purpose_clause: { n: 6, minTargets: 2, targetType: "purpose_clause" },
      result_clause: { n: 6, minTargets: 2, targetType: "result_clause" },
      relative_clause: { n: 6, minTargets: 2, targetType: "relative_clause" },
      indirect_statement: { n: 6, minTargets: 2, targetType: "indirect_statement" },
      conditionals: { n: 4, minTargets: 2, targetType: "conditional_protasis", preferAlso: "conditional_apodosis" },
    };

    const cfg = CONFIG[type] || { n: 6, minTargets: 2, targetType: type, preferAlso: null };

    const nQuery = Number(req.query.n);
    const N = Number.isFinite(nQuery) && nQuery >= 2 && nQuery <= 20 ? nQuery : cfg.n;
    const minTargets = cfg.minTargets;
    const targetType = cfg.targetType;

    if (global.length < N) {
      return res.status(500).json({ error: `Not enough sentences for N=${N}` });
    }

    // Count eligible windows that meet minTargets criteria
    let eligibleCount = 0;
    for (let start = 0; start <= global.length - N; start++) {
      const candidate = global.slice(start, start + N);
      let targetCount = 0;
      for (const s of candidate) {
        if (sentenceHasType(s, targetType)) targetCount++;
      }
      if (targetCount >= minTargets) eligibleCount++;
    }

    // If no eligible windows, fall back to total possible windows
    const totalWindows = eligibleCount > 0 ? eligibleCount : global.length - N + 1;

    return res.json({ type, n: N, totalWindows, eligibleWindows: eligibleCount });

  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});






router.get("/glossary", (req, res) => {
  try {
    const lemma = String(req.query.lemma || "").trim();
    if (!lemma) return res.status(400).json({ error: "missing lemma" });

    const glossary = loadGlossaryOrThrow();
    let entry = null;

    for (const k of lemmaKeyVariants(lemma)) {
      if (glossary[k]) {
        entry = glossary[k];
        break;
      }
    }

    res.json({ lemma, entry });
  } catch (e) {
    res.status(500).json({ error: e?.message || "glossary error" });
  }
});



router.get("/health", (req, res) => {
  res.json({
    ok: true,
    dir: CAESAR_DIR,
    found: {
      chapterVocab: resolveFirstExisting(FILES.chapterVocab),
      lemmaGlosses: resolveFirstExisting(FILES.lemmaGlosses),
      sentence: resolveFirstExisting(FILES.sentence),
      translations: resolveFirstExisting(FILES.translations),
      ud: resolveFirstExisting(FILES.ud),
      constructions: resolveFirstExisting(FILES.constructions),

    },
  });
});


router.get("/chapterVocab", (req, res) => {
  try {
    const ch = Number(req.query.chapter);
    if (!Number.isFinite(ch)) {
      return res.status(400).json({ error: "Missing or invalid ?chapter=" });
    }

    const rawTargets = loadTargetsOrThrow();
    const glossary = loadGlossaryOrThrow();

    const enriched = rawTargets
      .filter((t) => t && typeof t === "object")
      .map((t) => {
        const lemma = t.lemma;
        let entry = null;

        for (const k of lemmaKeyVariants(lemma)) {
          if (glossary[k]) {
            entry = glossary[k];
            break;
          }
        }

        const chapter = inferChapterFromTarget(t);
        const dictEntry = String(entry?.dictionary_entry || "").trim();
        const glosses = Array.isArray(entry?.glosses) ? entry.glosses : [];
        const glossShort = String(entry?.gloss_short || "").trim();
        const gloss = glossShort || (glosses[0] ? String(glosses[0]) : "");

        return {
          ...t,
          chapter: chapter ?? t.chapter ?? t.firstChapter ?? null,
          dictionary_entry: dictEntry,
          glosses,
          gloss,
          gloss_short: gloss,
        };
      })
      .filter((t) => Number(t.chapter) === ch);

    res.json({ chapter: ch, targets: enriched });
  } catch (e) {
    res.status(500).json({ error: e?.message || "chapterVocab error" });
  }
});




//
// ============================
// Teacher / Pilot Layer (NEW)
// ============================
//

function nowMs() {
  return Date.now();
}

function loadTeachers() {
  return safeReadJson(TEACHERS_FILE) || {};
}

function loadAssignments() {
  return safeReadJson(ASSIGNMENTS_FILE) || {};
}

function loadSubmissions() {
  return safeReadJson(SUBMISSIONS_FILE) || {};
}

function saveTeachers(obj) {
  safeWriteJson(TEACHERS_FILE, obj);
}

function saveAssignments(obj) {
  safeWriteJson(ASSIGNMENTS_FILE, obj);
}

function saveSubmissions(obj) {
  safeWriteJson(SUBMISSIONS_FILE, obj);
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

// Password hashing (no deps): PBKDF2
function hashPassword(password, salt) {
  const pw = String(password || "");
  const s = String(salt || "");
  const iterations = 150000;
  const keylen = 32;
  const digest = "sha256";
  const dk = crypto.pbkdf2Sync(pw, s, iterations, keylen, digest);
  return dk.toString("hex");
}

function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

// Simple signed token (no deps, persistent secret)
function tokenSecret() {
  return process.env.TEACHER_SECRET || "DEV_TEACHER_SECRET_CHANGE_ME";
}

function signToken(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const t = String(token || "");
  const parts = t.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expect = crypto.createHmac("sha256", tokenSecret()).update(payloadB64).digest("base64url");
  if (sig !== expect) return null;

  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (!payload || typeof payload !== "object") return null;
    if (payload.exp && nowMs() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function authTeacher(req) {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifyToken(m[1]);
}

function getPublicAppBase(req) {
  const envBase = String(process.env.PUBLIC_APP_URL || "").trim();
  const origin = String(req.get("origin") || "").trim();

  const candidate = envBase || origin || "http://localhost:5173";

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad proto");
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:5173";
  }
}


// Teacher registers once, keeps same password forever
router.post("/teacher/register", express.json(), (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) return res.status(400).json({ error: "missing email or password" });
    if (password.length < 6) return res.status(400).json({ error: "password too short" });

    const teachers = loadTeachers();
    if (teachers[email]) return res.status(409).json({ error: "teacher already exists" });

    const salt = makeSalt();
    const pwHash = hashPassword(password, salt);

    teachers[email] = {
      teacherId: randomId("teacher"),
      email,
      salt,
      pwHash,
      createdAt: nowMs(),
      lastLoginAt: null,
    };

    saveTeachers(teachers);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "register error" });
  }
});

router.post("/teacher/login", express.json(), (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) return res.status(400).json({ error: "missing email or password" });

    const teachers = loadTeachers();
    const row = teachers[email];
    if (!row) return res.status(401).json({ error: "bad credentials" });

    const pwHash = hashPassword(password, row.salt);
    if (pwHash !== row.pwHash) return res.status(401).json({ error: "bad credentials" });

    row.lastLoginAt = nowMs();
    teachers[email] = row;
    saveTeachers(teachers);

    const token = signToken({
      teacherId: row.teacherId,
      email: row.email,
      exp: nowMs() + 1000 * 60 * 60 * 12, // 12 hours
    });

    res.json({ ok: true, token, teacher: { teacherId: row.teacherId, email: row.email } });
  } catch (e) {
    res.status(500).json({ error: e?.message || "login error" });
  }
});

router.get("/teacher/me", (req, res) => {
  const payload = authTeacher(req);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  res.json({ ok: true, teacher: { teacherId: payload.teacherId, email: payload.email } });
});

// Create assignment (teacher chooses chapter range)
// List assignments for the logged-in teacher
router.get("/teacher/assignments", (req, res) => {
  try {
    const payload = authTeacher(req);
    if (!payload) return res.status(401).json({ error: "unauthorized" });

    const assignments = loadAssignments();

    const base = getPublicAppBase(req);


    const list = Object.values(assignments || {})
      .filter((a) => a && a.teacherId === payload.teacherId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((a) => ({
        assignmentId: a.assignmentId,
        createdAt: a.createdAt,
        chapterStart: a.chapterStart,
        chapterEnd: a.chapterEnd,
        active: a.active !== false,
        settings: a.settings || {},
        studentLink: `${base}/CaesarDBG1?assignment=${encodeURIComponent(a.assignmentId)}`,
      }));

    res.json({ ok: true, assignments: list });
  } catch (e) {
    res.status(500).json({ error: e?.message || "list assignments error" });
  }
});


router.post("/teacher/assignments", express.json(), (req, res) => {
  try {
    const payload = authTeacher(req);
    if (!payload) return res.status(401).json({ error: "unauthorized" });

    const chapterStart = Number(req.body?.chapterStart);
    const chapterEnd = Number(req.body?.chapterEnd);
    const settings = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};

    if (!Number.isFinite(chapterStart) || !Number.isFinite(chapterEnd)) {
      return res.status(400).json({ error: "missing chapterStart/chapterEnd" });
    }
    if (chapterStart <= 0 || chapterEnd <= 0 || chapterEnd < chapterStart) {
      return res.status(400).json({ error: "invalid chapter range" });
    }

    const assignments = loadAssignments();
    const assignmentId = randomId("assign");

    assignments[assignmentId] = {
      assignmentId,
      createdAt: nowMs(),
      teacherId: payload.teacherId,
      chapterStart,
      chapterEnd,
      settings,
      active: true,
    };

    saveAssignments(assignments);

    const base =
      process.env.PUBLIC_APP_URL ||
      `${req.protocol}://${req.get("host")}`;

    const studentLink =
      `${base}/CaesarDBG1?assignment=${encodeURIComponent(assignmentId)}`;


    res.json({ ok: true, assignmentId, studentLink });
  } catch (e) {
    res.status(500).json({ error: e?.message || "create assignment error" });
  }
});

// Assignment metadata for students (no auth)
router.get("/assignments/meta", (req, res) => {
  try {
    const assignmentId = String(req.query.assignmentId || "").trim();
    if (!assignmentId) return res.status(400).json({ error: "missing assignmentId" });

    const assignments = loadAssignments();
    const a = assignments[assignmentId];
    if (!a || !a.active) return res.status(404).json({ error: "assignment not found" });

    // deliberately do NOT expose teacherId
    res.json({
      ok: true,
      assignment: {
        assignmentId: a.assignmentId,
        createdAt: a.createdAt,
        chapterStart: a.chapterStart,
        chapterEnd: a.chapterEnd,
        settings: a.settings || {},
      },
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "assignment meta error" });
  }
});



// Student starts an attempt (creates attemptId)
// Phase 1: Now accepts studentId for stable identity tracking
router.post("/assignments/start", express.json(), (req, res) => {
  try {
    const assignmentId = String(req.body?.assignmentId || "").trim();
    const studentName = String(req.body?.studentName || "").trim();
    const studentId = String(req.body?.studentId || "").trim(); // Phase 1: stable ID

    if (!assignmentId || !studentName) return res.status(400).json({ error: "missing assignmentId/studentName" });

    const assignments = loadAssignments();
    const a = assignments[assignmentId];
    if (!a || !a.active) return res.status(404).json({ error: "assignment not found" });

    const submissions = loadSubmissions();
    if (!submissions[assignmentId]) submissions[assignmentId] = {};
    if (!submissions[assignmentId][studentName]) submissions[assignmentId][studentName] = [];

    const attemptId = randomId("attempt");
    submissions[assignmentId][studentName].push({
      attemptId,
      studentId: studentId || null, // Phase 1: store stable ID
      startedAt: nowMs(),
      finishedAt: null,
      durationSec: null,
      chapterStart: a.chapterStart,
      chapterEnd: a.chapterEnd,
      settings: a.settings || {},
      events: [],
      finalReport: null,
    });

    saveSubmissions(submissions);

    res.json({ ok: true, attemptId, studentId: studentId || null });
  } catch (e) {
    res.status(500).json({ error: e?.message || "start attempt error" });
  }
});

// Optional: record per-answer events (does not affect quiz)
// Phase 1: Now includes studentId in events for identity tracking
router.post("/assignments/event", express.json(), (req, res) => {
  try {
    const assignmentId = String(req.body?.assignmentId || "").trim();
    const attemptId = String(req.body?.attemptId || "").trim();
    const studentName = String(req.body?.studentName || "").trim();
    const studentId = String(req.body?.studentId || "").trim(); // Phase 1
    const event = req.body?.event;

    if (!assignmentId || !attemptId || !studentName || !event) {
      return res.status(400).json({ error: "missing required fields" });
    }

    const submissions = loadSubmissions();
    const arr = submissions?.[assignmentId]?.[studentName];
    if (!Array.isArray(arr)) return res.status(404).json({ error: "attempt not found" });

    const idx = arr.findIndex((x) => x?.attemptId === attemptId);
    if (idx < 0) return res.status(404).json({ error: "attempt not found" });

    const row = arr[idx];
    if (!Array.isArray(row.events)) row.events = [];

    row.events.push({
      t: Number(event.t) || nowMs(),
      type: String(event.type || "event"),
      studentId: studentId || row.studentId || null, // Phase 1: include in event
      ...event,
    });

    arr[idx] = row;
    submissions[assignmentId][studentName] = arr;
    saveSubmissions(submissions);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "event error" });
  }
});

// Finish attempt with final report bundle
// Phase 1: Now includes studentId in final report for identity tracking
router.post("/assignments/finish", express.json(), (req, res) => {
  try {
    const assignmentId = String(req.body?.assignmentId || "").trim();
    const attemptId = String(req.body?.attemptId || "").trim();
    const studentName = String(req.body?.studentName || "").trim();
    const studentId = String(req.body?.studentId || "").trim(); // Phase 1
    const report = req.body?.report;

    if (!assignmentId || !attemptId || !studentName || !report) {
      return res.status(400).json({ error: "missing required fields" });
    }

    const submissions = loadSubmissions();
    const arr = submissions?.[assignmentId]?.[studentName];
    if (!Array.isArray(arr)) return res.status(404).json({ error: "attempt not found" });

    const idx = arr.findIndex((x) => x?.attemptId === attemptId);
    if (idx < 0) return res.status(404).json({ error: "attempt not found" });

    const row = arr[idx];
    row.finishedAt = nowMs();
    row.durationSec = Math.max(0, Math.round((row.finishedAt - (row.startedAt || row.finishedAt)) / 1000));
    row.finalReport = { ...report, studentId: studentId || row.studentId || null }; // Phase 1

    arr[idx] = row;
    submissions[assignmentId][studentName] = arr;
    saveSubmissions(submissions);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "finish error" });
  }
});

// Teacher pulls results (auth required)
router.get("/teacher/assignments/:assignmentId/results", (req, res) => {
  try {
    const payload = authTeacher(req);
    if (!payload) return res.status(401).json({ error: "unauthorized" });

    const assignmentId = String(req.params.assignmentId || "").trim();
    if (!assignmentId) return res.status(400).json({ error: "missing assignmentId" });

    const assignments = loadAssignments();
    const a = assignments[assignmentId];
    if (!a) return res.status(404).json({ error: "assignment not found" });
    if (a.teacherId !== payload.teacherId) return res.status(403).json({ error: "forbidden" });

    const submissions = loadSubmissions();
    const block = submissions[assignmentId] || {};

    // basic aggregation
    const students = Object.keys(block).sort().map((name) => {
      const attempts = Array.isArray(block[name]) ? block[name] : [];
      const latest = attempts.slice().sort((x, y) => (y.startedAt || 0) - (x.startedAt || 0))[0] || null;
      return {
        studentName: name,
        attemptsCount: attempts.length,
        latestAttempt: latest,
      };
    });

    res.json({
      ok: true,
      assignment: {
        assignmentId: a.assignmentId,
        createdAt: a.createdAt,
        chapterStart: a.chapterStart,
        chapterEnd: a.chapterEnd,
        settings: a.settings || {},
      },
      students,
      raw: block,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "results error" });
  }
});

router.get("/glossaryByForm", (req, res) => {
  try {
    const formRaw = String(req.query.form || "").trim();
    if (!formRaw) return res.status(400).json({ error: "Missing ?form=" });

    const form = formRaw.toLowerCase();
    const idx = buildFormToLemmasIndex();
    const lemmas = idx[form] || [];

    const glossary = loadGlossaryOrThrow();

    // Return all matching entries
    const entries = lemmas
      .map((l) => glossary[l])
      .filter(Boolean);

    res.json({
      form: formRaw,
      lemmas,
      entries,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});


export default router;
