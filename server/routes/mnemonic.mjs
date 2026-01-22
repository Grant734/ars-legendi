// routes/mnemonic.mjs — always return 200; never inject generic fallbacks.
// Strong derivative-first prompt, with a single repair pass ONLY if the line is generic.
// We cache only "good" mnemonics (that name a concrete derivative).

import 'dotenv/config';
import OpenAI from 'openai';
import express from 'express';

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ---------- lightweight cache ----------
const CACHE_ENABLED = String(process.env.LLM_CACHE || '').toLowerCase() === 'on';
const CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const CACHE_MAX = Number(process.env.LLM_CACHE_MAX || 1000);
const _cache = new Map();
const ckey = ({ lemma, english }) => `mn7:${lemma.toLowerCase()}::${english.toLowerCase()}`;
const cget = (k) => {
  if (!CACHE_ENABLED) return null;
  const v = _cache.get(k);
  if (!v) return null;
  if (Date.now() > v.expiresAt) { _cache.delete(k); return null; }
  return v.value;
};
const cset = (k, value) => {
  if (!CACHE_ENABLED) return;
  if (_cache.size >= CACHE_MAX) {
    const first = _cache.keys().next().value;
    if (first) _cache.delete(first);
  }
  _cache.set(k, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

// ---------- helpers ----------
const stripMarks = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function extractMinifiedJSON(text) {
  try { return JSON.parse(text); } catch {}
  const last = text.match(/\{[\s\S]*\}$/);
  if (last) { try { return JSON.parse(last[0]); } catch {} }
  const first = text.match(/\{[\s\S]*?\}/);
  if (first) { try { return JSON.parse(first[0]); } catch {} }
  return null;
}

function clamp(s, n) {
  const t = String(s || '').trim();
  return t.length <= n ? t : (t.slice(0, n - 1) + '…');
}

// Heuristics for “generic” lines we want to repair.
// We keep this very narrow so we don't over-trigger.
const GENERIC_RE = /\b(related|close)\s+english\s+word\b|apply\s+this\s+idea|find\s+an\s+english\s+word|derivative\s+like|something\s+like/i;

function looksGeneric(s) {
  const t = (s || '').toLowerCase();
  return GENERIC_RE.test(t) || /remember\s+“[^”]*”\s*\.\s*$/.test(t); // ends with hollow template
}

function goodMnemonicOrNull(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (looksGeneric(t)) return null;
  // require at least one “candidate derivative”-looking word (>= 5 letters, not the lemma, not the meaning article)
  if (!/\b[a-z]{5,}\b/i.test(t)) return null;
  return clamp(stripMarks(t), 180);
}

// ---------- prompts ----------
function systemPrompt({ repair = false } = {}) {
  return [
    "You write short, friendly ENGLISH mnemonics for Latin vocabulary.",
    "PRIMARY REQUIREMENT: Name ONE specific English derivative that actually comes from the Latin lemma.",
    "If no well-known derivative exists, create a vivid, school-safe image that links the SOUND/SHAPE of the lemma to its meaning.",
    "Absolute rules:",
    "- Always NAME the specific English derivative when one exists (e.g., timid from timeo; vision from video; terrain from terra; portable from porto; regal from rex).",
    "- Include the Latin lemma and the English meaning in the sentence.",
    "- Exactly ONE sentence, at most 22 words. No quotes. No macrons.",
    "- Do NOT use phrases like “related English word”, “close English word”, “apply this idea”, or “find an English word”.",
    "",
    "Return ONLY a MINIFIED JSON object: {\"mnemonic\":\"...\"}",
    "",
    "Examples:",
    '{"mnemonic":"Think of timid — from timeo — to remember the meaning ‘to fear’."}',
    '{"mnemonic":"Video links to vision — that root helps you remember ‘to see’."}',
    '{"mnemonic":"Connect terra to terrain — from terra — to remember ‘earth, land’."}',
    '{"mnemonic":"Porto → portable — that English word reminds you the verb means ‘to carry’."}',
    '{"mnemonic":"If no derivative fits, picture the lemma’s SOUND shaping the meaning in a vivid way."}',
    repair ? 'REPAIR: Your previous line was too generic. NAME a concrete derivative if one exists; otherwise use a vivid sound-alike image. Return ONLY {"mnemonic":"..."}' : ""
  ].filter(Boolean).join('\n');
}

function userPrompt({ lemma, mode, entry, english }) {
  return [
    `lemma: ${lemma}`,
    `part: ${mode} (noun/verb)`,
    `dictionary entry: ${entry}`,
    `english meaning: ${english}`,
    'Return ONLY: {"mnemonic":"<one friendly sentence naming an English derivative OR a vivid sound-alike image>"}'
  ].join('\n');
}

async function callOnce({ lemma, mode, entry, english, repair }) {
  const resp = await client.responses.create({
    model: MODEL,
    temperature: repair ? 0.5 : 0.8,
    input: [
      { role: 'system', content: systemPrompt({ repair }) },
      { role: 'user', content: userPrompt({ lemma, mode, entry, english }) }
    ],
    max_output_tokens: 160
  });
  const text = resp.output_text ?? resp.output?.[0]?.content?.[0]?.text ?? '';
  const json = extractMinifiedJSON(text);
  return { text, json };
}

// ---------- route ----------
router.post('/', async (req, res) => {
  try {
    const { lemma, mode, entry, english } = req.body || {};
    if (!lemma || !mode || !entry || !english) {
      return res.status(200).json({ mnemonic: "" });
    }

    const key = ckey({ lemma, english });
    const cached = cget(key);
    if (cached) return res.status(200).json(cached);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(200).json({ mnemonic: "" });
    }

    // First attempt
    let { text, json } = await callOnce({ lemma, mode, entry, english, repair: false });
    let candidate = goodMnemonicOrNull(json?.mnemonic) || goodMnemonicOrNull(text);

    // If generic/weak, do one repair attempt
    if (!candidate) {
      ({ text, json } = await callOnce({ lemma, mode, entry, english, repair: true }));
      candidate = goodMnemonicOrNull(json?.mnemonic) || goodMnemonicOrNull(text);
    }

    const payload = { mnemonic: candidate || "" };

    // Cache only good mnemonics
    if (payload.mnemonic) cset(key, payload);

    return res.status(200).json(payload);

  } catch (err) {
    console.error('mnemonic fatal:', err?.response?.data || err);
    return res.status(200).json({ mnemonic: "" });
  }
});

export default router;
