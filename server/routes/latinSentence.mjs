// latinSentence.mjs
// server/routes/latinSentence.mjs
import "dotenv/config";
import OpenAI from "openai";
import express from "express";

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------- helpers ----------
const stripMarks = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function extractMinifiedJSON(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const last = text.match(/\{[\s\S]*\}$/);
  if (last) {
    try {
      return JSON.parse(last[0]);
    } catch {}
  }
  const first = text.match(/\{[\s\S]*?\}/);
  if (first) {
    try {
      return JSON.parse(first[0]);
    } catch {}
  }
  return null;
}

function buildUsage(lemma, analysis) {
  const part = (analysis?.part || "").toLowerCase().trim();

  if (part === "verb") {
    const bits = [
      (analysis.person || "").trim(),
      (analysis.number || "").trim(),
      (analysis.tense || "").trim(),
      (analysis.mood || "").trim(),
      (analysis.voice || "").trim(),
    ]
      .filter(Boolean)
      .join(", ");
    return `Lemma: ${lemma} — Verb: ${bits}`;
  }

  if (part === "adjective") {
    const kase = (analysis?.case || "").trim();
    const num = (analysis?.number || "").trim();
    const gen = (analysis?.gender || "").trim();
    const bits = [kase, num, gen].filter(Boolean).join(", ");
    return `Lemma: ${lemma} — Adjective: ${bits}`;
  }

  // nouns (and default): case only
  const kase = (analysis?.case || "").trim();
  return `Lemma: ${lemma} — Case: ${kase}`;
}

// ---------- prompts ----------
function systemPrompt(repairNote) {
  return [
    "You are a meticulous Latin teacher.",
    "Produce EXACTLY ONE short, grammatical Latin sentence (6–10 words) that correctly uses the given lemma.",
    "",
    "GRAMMAR FIRST — hard requirements:",
    "1) If the lemma is a VERB:",
    "   - Choose a subject (puella, puer, agricola, Marcus, Julia) and CONJUGATE the lemma to agree with that subject.",
    "   - Use ONE finite verb ONLY (the lemma in the chosen form). Do NOT add extra verbs like 'est', 'facit', 'agit'.",
    "   - Prefer present with a named subject unless another tense fits naturally.",
    "   - Example good: “Marcus videt stellas.” (lemma video → videt).",
    "   - Example good (ire): “Puella it ad forum.” (lemma eo/ire → it).",
    "   - Anti-example (DO NOT): “Puella eo videt.” (two verbs; mismatch).",
    "",
    "2) If the lemma is a NOUN:",
    "   - Use the noun in a natural sentence and DECLINE the noun appropriately.",
    "   - You must report ONLY the CASE of the declined lemma in analysis (not its syntactic role/use, and not its number).",
    "   - Example: “Magister puellae librum dat.” (lemma puella → puellae is Dative).",
    "",
    "3) If the lemma is an ADJECTIVE:",
    "   - Choose a simple noun (puella, puer, agricola, rex, urbs, bellum, donum, via) that the adjective can naturally describe.",
    "   - DECLINE the adjective to agree with the noun in CASE, NUMBER, and GENDER.",
    "   - Keep the sentence 6–10 words and avoid extra clauses.",
    "   - Example: “Puella bona librum legit.” (bonus → bona agreeing with puella).",
    "",
    "4) ENGLISH translation:",
    "   - Natural finite English (NEVER an infinitive like “to see”, “to go”).",
    "   - Translate tense/person sensibly.",
    "",
    "OUTPUT — return ONLY a MINIFIED JSON object with keys:",
    "{\"latin_sentence\":\"...\",\"english_translation\":\"...\",\"analysis\":{...}}",
    "Where analysis is FOR THE DECLINED/CONJUGATED FORM OF THE LEMMA ONLY:",
    "  - For verbs: {part:'verb', person:'1st|2nd|3rd', number:'singular|plural', tense:'...', mood:'indicative|subjunctive|imperative', voice:'active|passive|deponent'}",
    "  - For nouns: {part:'noun', case:'Nominative|Accusative|Genitive|Dative|Ablative|Vocative'}",
    "  - For adjectives: {part:'adjective', case:'Nominative|Accusative|Genitive|Dative|Ablative|Vocative', number:'singular|plural', gender:'masculine|feminine|neuter', agrees_with:'<noun>'}",
    "",
    "STYLE:",
    "- No macrons; no quotes; stay under 10 Latin words; keep vocabulary simple.",
    "- Vary subjects/contexts across calls.",
    "Example (verb): {\"latin_sentence\":\"Marcus videt stellas.\",\"english_translation\":\"Marcus sees the stars.\",\"analysis\":{\"part\":\"verb\",\"person\":\"3rd\",\"number\":\"singular\",\"tense\":\"present\",\"mood\":\"indicative\",\"voice\":\"active\"}}",
    "Example (verb - ire): {\"latin_sentence\":\"Julia it ad urbem.\",\"english_translation\":\"Julia goes to the city.\",\"analysis\":{\"part\":\"verb\",\"person\":\"3rd\",\"number\":\"singular\",\"tense\":\"present\",\"mood\":\"indicative\",\"voice\":\"active\"}}",
    "Example (noun): {\"latin_sentence\":\"Magister puellae librum dat.\",\"english_translation\":\"The teacher gives a book to the girl.\",\"analysis\":{\"part\":\"noun\",\"case\":\"Dative\"}}",
    "Example (adjective): {\"latin_sentence\":\"Puella bona librum legit.\",\"english_translation\":\"The good girl reads a book.\",\"analysis\":{\"part\":\"adjective\",\"case\":\"Nominative\",\"number\":\"singular\",\"gender\":\"feminine\",\"agrees_with\":\"puella\"}}",
    repairNote ? `REPAIR: ${repairNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function userPrompt({ lemma, mode, entry, english, variety }) {
  return [
    `lemma: ${lemma}`,
    `part: ${mode} (noun/verb/adjective)`,
    `dictionary entry: ${entry}`,
    `english meaning: ${english}`,
    `variety index: ${variety}`,
    "Return ONLY the minified JSON object described above.",
  ].join("\n");
}

async function callOnce({ lemma, mode, entry, english, repairNote }) {
  const variety = Math.floor(Math.random() * 8) + 1;

  const resp = await client.responses.create({
    model: MODEL,
    temperature: repairNote ? 0.35 : 0.55,
    input: [
      { role: "system", content: systemPrompt(repairNote) },
      { role: "user", content: userPrompt({ lemma, mode, entry, english, variety }) },
    ],
    max_output_tokens: 320,
  });

  const text = resp.output_text ?? resp.output?.[0]?.content?.[0]?.text ?? "";
  return extractMinifiedJSON(text);
}

// ---------- route ----------
router.post("/", async (req, res) => {
  try {
    const { lemma, mode, entry, english } = req.body || {};

    if (!lemma || !mode || !entry || !english) {
      return res
        .status(200)
        .json({ latin_sentence: "", english_translation: "", usage_note: "" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(200)
        .json({ latin_sentence: "", english_translation: "", usage_note: "" });
    }

    let data = await callOnce({ lemma, mode, entry, english, repairNote: null });
    if (!data) {
      data = await callOnce({
        lemma,
        mode,
        entry,
        english,
        repairNote: "Your previous output was not valid JSON. Return only minified JSON.",
      });
    }

    const latin = stripMarks(data?.latin_sentence || "");
    const eng = String(data?.english_translation || "");
    const usage = buildUsage(lemma, data?.analysis || {});

    return res.status(200).json({
      latin_sentence: latin,
      english_translation: eng,
      usage_note: usage,
    });
  } catch (err) {
    console.error("latinSentence error:", err?.response?.data || err);
    return res
      .status(200)
      .json({ latin_sentence: "", english_translation: "", usage_note: "" });
  }
});

export default router;
