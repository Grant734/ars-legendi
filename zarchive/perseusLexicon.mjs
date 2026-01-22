// server/routes/perseusLexicon.mjs

import express from "express";
import { lookupPerseus } from "./lexicon/perseusLexicon.js";

const router = express.Router();

router.get("/perseus", (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Number(req.query.limit || 6);
    const result = lookupPerseus(q, { limit });
    res.json(result);
  } catch (err) {
    console.error("Perseus lexicon error:", err);
    res.status(500).json({ error: "Perseus lexicon lookup failed" });
  }
});

export default router;
