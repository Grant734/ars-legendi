// routes/latinImage.mjs
import "dotenv/config";
import OpenAI from "openai";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Defaults: primary gpt-image-1, fallback dall-e-3
const PRIMARY_MODEL  = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const FALLBACK_MODEL = process.env.OPENAI_IMAGE_FALLBACK_MODEL || "dall-e-3";

// Size: smaller for gpt-image-1 speeds things up
const PRIMARY_SIZE  = process.env.OPENAI_IMAGE_SIZE_PRIMARY  || "1024x1024";
const FALLBACK_SIZE = process.env.OPENAI_IMAGE_SIZE_FALLBACK || "1024x1024";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disk cache
const CACHE_DIR = path.join(__dirname, "..", "cache", "latin_images");
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

const memCache = new Map(); // key -> dataUrl

function safeKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 100);
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.txt`);
}

function buildPrompt({ lemma, english, mode, entry }) {
  const core = [
    "Create a clean, classroom-safe cartoon illustration.",
    "Simple shapes, bold outlines, friendly style, minimal background.",
    "No text, no letters, no captions, no watermarks, no logos.",
    "Centered subject, high contrast, one main concept only."
  ].join(" ");

  const meaning = english ? `Meaning: ${english}.` : "";
  const dict = entry ? `Dictionary entry: ${entry}.` : "";
  const part = mode ? `Part of speech: ${mode}.` : "";

  const guidance = [
    "If abstract, use a simple metaphor (anger -> angry person with steam puff).",
    "If noun, show one clear object/person.",
    "If verb, show the action happening.",
    "If adjective, show a noun embodying the quality."
  ].join(" ");

  return `${core} ${guidance} Latin lemma: ${lemma}. ${meaning} ${dict} ${part}`.trim();
}

async function generateWithModel(model, size, prompt) {
  const isDalle = /^dall-e/i.test(String(model));

  // DALL·E supports response_format; gpt-image-1 does NOT.
  const req = {
    model,
    prompt,
    size,
    ...(isDalle ? { response_format: "b64_json" } : { output_format: "png" })
  };

  const img = await client.images.generate(req);

  const first = img?.data?.[0] || {};
  let b64 = first.b64_json || first.b64 || "";

  // If a URL is returned (rare), convert to base64 so caching stays consistent.
  if (!b64) {
    const url = first.url || "";
    if (!url) return "";
    const r = await fetch(url);
    if (!r.ok) return "";
    const buf = Buffer.from(await r.arrayBuffer());
    b64 = buf.toString("base64");
  }

  return b64 ? `data:image/png;base64,${b64}` : "";
}

function looksLikeOrgVerification403(err) {
  const msg = err?.error?.message || err?.message || "";
  const status = err?.status || err?.response?.status;
  return status === 403 && /must be verified|verify organization|gpt-image-1/i.test(msg);
}

router.post("/", async (req, res) => {
  try {
    const { lemma, english, mode, entry, prefetch } = req.body || {};

    if (!lemma) return res.status(200).json({ image_data_url: "", error: "Missing lemma." });
    if (!process.env.OPENAI_API_KEY) return res.status(200).json({ image_data_url: "", error: "Missing OPENAI_API_KEY." });

    // Cache key: include model + size so swapping models/sizes doesn’t clash
    // (prevents serving a 1024 fallback when you wanted 512 primary, etc.)
    const key = safeKey(`${mode || "word"}__${lemma}__${PRIMARY_MODEL}__${PRIMARY_SIZE}`);
    const p = cachePath(key);

    // Memory cache
    if (memCache.has(key)) {
      return res.status(200).json({ image_data_url: memCache.get(key), error: "" });
    }

    // Disk cache
    if (fs.existsSync(p)) {
      const cached = fs.readFileSync(p, "utf-8").trim();
      if (cached) {
        memCache.set(key, cached);
        return res.status(200).json({ image_data_url: cached, error: "" });
      }
    }

    const prompt = buildPrompt({ lemma, english, mode, entry });

    // Try primary first
    try {
      const dataUrl = await generateWithModel(PRIMARY_MODEL, PRIMARY_SIZE, prompt);
      if (dataUrl) {
        memCache.set(key, dataUrl);
        try { fs.writeFileSync(p, dataUrl, "utf-8"); } catch {}
        return res.status(200).json({ image_data_url: dataUrl, error: "" });
      }
    } catch (e) {
      // If gpt-image-1 isn't enabled yet, use fallback automatically.
      if (!looksLikeOrgVerification403(e)) {
        // For prefetch requests, don’t spam errors (just return empty)
        if (prefetch) return res.status(200).json({ image_data_url: "", error: "" });

        const msg = e?.error?.message || e?.message || "Primary image generation failed.";
        console.error("latinImage primary error:", e?.response?.data || e);
        return res.status(200).json({ image_data_url: "", error: msg });
      }
      // else fall through to fallback
    }

    // Fallback (dall-e-3)
    try {
      const fallbackPrompt = prompt; // same prompt is fine
      const dataUrl2 = await generateWithModel(FALLBACK_MODEL, FALLBACK_SIZE, fallbackPrompt);
      if (!dataUrl2) {
        return res.status(200).json({ image_data_url: "", error: prefetch ? "" : "Fallback returned no image." });
      }

      // Cache fallback too, but under its own key so it doesn’t overwrite primary cache
      const key2 = safeKey(`${mode || "word"}__${lemma}__${FALLBACK_MODEL}__${FALLBACK_SIZE}`);
      const p2 = cachePath(key2);
      memCache.set(key2, dataUrl2);
      try { fs.writeFileSync(p2, dataUrl2, "utf-8"); } catch {}

      return res.status(200).json({
        image_data_url: dataUrl2,
        error: looksLikeOrgVerification403({ status: 403, error: { message: "gpt-image-1 not enabled" } })
          ? "Used fallback model because gpt-image-1 is not enabled for this org yet."
          : ""
      });
    } catch (e2) {
      if (prefetch) return res.status(200).json({ image_data_url: "", error: "" });

      const msg2 = e2?.error?.message || e2?.message || "Fallback image generation failed.";
      console.error("latinImage fallback error:", e2?.response?.data || e2);
      return res.status(200).json({ image_data_url: "", error: msg2 });
    }
  } catch (err) {
    console.error("latinImage fatal error:", err?.response?.data || err);
    return res.status(200).json({ image_data_url: "", error: "Server error." });
  }
});

export default router;
