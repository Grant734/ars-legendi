// server/routes/latinHint.mjs
// Returns a short English-only hint for Phase 3.
// Contract: always 200, JSON { hint: "..." }.
//
// IMPORTANT:
// - We do NOT include the Latin lemma as a standalone word.
// - We *can* include an English derivative/cognate (even if it shares letters), because that's the point.

import "dotenv/config";
import OpenAI from "openai";
import express from "express";

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripToLetters(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

function baseEnglish(english) {
  const e = String(english || "").trim();
  return e.replace(/^to\s+/i, "").trim();
}

function fallbackHint(lemma, english) {
  const l = stripToLetters(lemma);

  const MAP = [
    { re: /port/, hint: "Think: portable." },
    { re: /scrib|script/, hint: "Think: scribe / script." },
    { re: /dict|dic/, hint: "Think: diction." },
    { re: /vid/, hint: "Think: video / vision." },
    { re: /aud/, hint: "Think: audio / audience." },
    { re: /duc/, hint: "Think: conduct." },
    { re: /mit/, hint: "Think: emit / transmit." },
    { re: /cap/, hint: "Think: capture." },
    { re: /ven/, hint: "Think: convene." },
    { re: /pos|pon/, hint: "Think: position." },
    { re: /cred/, hint: "Think: credit." },
    { re: /pac/, hint: "Think: pacify / peace." },
    { re: /reg/, hint: "Think: regal." },
    { re: /temp/, hint: "Think: temporary." },
    { re: /mater/, hint: "Think: maternal." },
    { re: /frat/, hint: "Think: fraternal." },
    { re: /corp/, hint: "Think: corporal." },
    { re: /terr/, hint: "Think: terrain." },
    { re: /nav/, hint: "Think: navy." },
    { re: /luc|lumin/, hint: "Think: luminous." },
    { re: /mort/, hint: "Think: mortal." },
    { re: /vit/, hint: "Think: vital." },
    { re: /man/, hint: "Think: manual." },
    { re: /ped/, hint: "Think: pedestrian." },
    { re: /equ/, hint: "Think: equestrian." },
    { re: /mar/, hint: "Think: maritime." },
    { re: /aqu/, hint: "Think: aquatic." },
  ];

  for (const m of MAP) {
    if (m.re.test(l)) return m.hint;
  }

  const b = baseEnglish(english);
  if (b) return `Picture the idea: ${b}.`;
  return "Picture the meaning.";
}

function systemPrompt() {
  return [
    "You are a careful Latin study assistant.",
    "Give ONE short English-only hint to help recall a Latin vocabulary item.",
    "Hard rules:",
    "- Do NOT output the Latin lemma as a standalone word.",
    "- Prefer a real English derivative/cognate if you know one.",
    "- Otherwise, use a simple association (sound-alike in English, or a concrete image).",
    "- Keep it under 16 words.",
    "- Plain text. No markdown. No quotation marks.",
    "Output JSON only, minified: {\"hint\":\"...\"}",
  ].join("\n");
}

function userPrompt({ lemma, english, entry }) {
  return [
    `lemma (do not output as a standalone word): ${lemma}`,
    `dictionary entry: ${entry || ""}`,
    `english meaning: ${english}`,
    "Return ONLY minified JSON: {\"hint\":\"...\"}",
  ].join("\n");
}

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const last = String(text || "").match(/\{[\s\S]*\}$/);
  if (last) {
    try {
      return JSON.parse(last[0]);
    } catch {}
  }
  const first = String(text || "").match(/\{[\s\S]*?\}/);
  if (first) {
    try {
      return JSON.parse(first[0]);
    } catch {}
  }
  return null;
}

function cleanHint(hint) {
  let h = String(hint || "").replace(/[\n\r\t]+/g, " ").trim();
  h = h.replace(/^["']+|["']+$/g, "");
  if (h.length > 120) h = h.slice(0, 120).trim();
  return h;
}

router.post("/", async (req, res) => {
  try {
    const { lemma, english, entry } = req.body || {};
    if (!lemma || !english) {
      return res.status(200).json({ hint: "" });
    }

    // If no key, still return a usable fallback.
    if (!process.env.OPENAI_API_KEY) {
      return res.status(200).json({ hint: fallbackHint(lemma, english) });
    }

    const resp = await client.responses.create({
      model: MODEL,
      temperature: 0.45,
      max_output_tokens: 120,
      input: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt({ lemma, english, entry }) },
      ],
    });

    const text = resp.output_text ?? resp.output?.[0]?.content?.[0]?.text ?? "";
    const data = extractJSON(text);
    let hint = cleanHint(data?.hint);

    // Safety check: lemma must not appear as a standalone word.
    // (But we allow derivatives where the lemma letters appear inside a longer English word.)
    const lemmaWord = new RegExp(`\\b${escapeRegExp(String(lemma).trim())}\\b`, "i");
    if (hint && lemmaWord.test(hint)) hint = "";

    if (!hint) hint = fallbackHint(lemma, english);

    return res.status(200).json({ hint });
  } catch (err) {
    console.error("latinHint error:", err?.response?.data || err);
    try {
      const { lemma, english } = req.body || {};
      return res.status(200).json({ hint: fallbackHint(lemma, english) });
    } catch {
      return res.status(200).json({ hint: "" });
    }
  }
});

export default router;
