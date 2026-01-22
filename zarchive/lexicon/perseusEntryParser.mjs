// server/data/lexicon/perseusEntryParser.mjs
// Parses a single <entryFree> block from the Perseus Latin lexicon XML.
// Goal: extract a stable id/key, a headword, and a compact set of English gloss strings.

function stripDiacritics(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe");
}

function decodeXmlEntities(s) {
  if (!s) return "";
  // basic named entities
  let out = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  // numeric entities
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const cp = parseInt(hex, 16);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });
  out = out.replace(/&#([0-9]+);/g, (_, dec) => {
    const cp = parseInt(dec, 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });
  return out;
}

function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, "");
}

function tidyText(s) {
  return decodeXmlEntities(stripTags(s))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeTrailingHomographDigits(s) {
  return (s || "").replace(/[0-9]+$/g, "");
}

// The lookup key we index by: lowercase, diacritics removed, j->i, v->u, letters only.
export function normalizeLookupKey(s) {
  const base = stripDiacritics(String(s || "").trim().toLowerCase())
    .replace(/j/g, "i")
    .replace(/v/g, "u");
  return base.replace(/[^a-z]/g, "");
}

function pickHeadword(xml) {
  const candidates = [];

  // Most common: <orth>headword</orth>
  for (const m of xml.matchAll(/<orth\b[^>]*>([\s\S]*?)<\/orth>/gi)) {
    const t = tidyText(m[1]);
    if (t) candidates.push(t);
  }

  // Fallback: bold (some entries)
  for (const m of xml.matchAll(/<hi\b[^>]*\brend=["'](?:bold|b)["'][^>]*>([\s\S]*?)<\/hi>/gi)) {
    const t = tidyText(m[1]);
    if (t) candidates.push(t);
  }

  // Pick first that has any letter
  for (const c of candidates) {
    if (/[A-Za-z]/.test(c)) return c;
  }
  return candidates[0] || "";
}

function extractGlosses(xml, limit = 12) {
  const out = [];
  const seen = new Set();

  const push = (s) => {
    const t = tidyText(s)
      .replace(/^[;:,.\-\s]+/g, "")
      .replace(/[;:,.\-\s]+$/g, "")
      .trim();
    if (!t) return;
    if (!/[A-Za-z]/.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  // Prefer explicit translations: italics in Perseus latlex
  for (const m of xml.matchAll(/<hi\b[^>]*\brend=["'](?:ital|italic)["'][^>]*>([\s\S]*?)<\/hi>/gi)) {
    push(m[1]);
    if (out.length >= limit) return out;
  }

  // Fallback: <tr>, <trans>, <gloss>
  for (const m of xml.matchAll(/<(?:tr|trans|gloss)\b[^>]*>([\s\S]*?)<\/(?:tr|trans|gloss)>/gi)) {
    push(m[1]);
    if (out.length >= limit) return out;
  }

  // Last resort: take a short English-looking chunk from raw text
  const plain = tidyText(xml).replace(/\b([IVXLC]+)\b/g, " "); // roman numerals can pollute
  const maybe = plain.split(/[\.;]/).slice(0, 6);
  for (const chunk of maybe) {
    if (/[A-Za-z]/.test(chunk) && /\s/.test(chunk)) push(chunk);
    if (out.length >= limit) break;
  }

  return out;
}

// Returns:
// {
//   idCandidate: string | null,
//   key: string | null,
//   head: string,
//   lemma: string,      // head without trailing homograph digits
//   lemmaNorm: string,  // normalized for index
//   homograph: string | null,
//   glosses: string[]
// }
export function parseEntryFreeXml(entryXml) {
  const xml = String(entryXml || "");

  const keyMatch =
    xml.match(/<entryFree\b[^>]*\bkey=["']([^"']+)["']/i) ||
    xml.match(/<entryFree\b[^>]*\bid=["']([^"']+)["']/i);

  const key = keyMatch ? String(keyMatch[1]).trim() : null;

  const head = pickHeadword(xml);
  const headClean = head.replace(/\s+/g, " ").trim();

  const homographMatch = headClean.match(/([0-9]+)\s*$/);
  const homograph = homographMatch ? homographMatch[1] : null;

  const lemma = removeTrailingHomographDigits(headClean).replace(/\s+/g, " ").trim();
  const lemmaNorm = normalizeLookupKey(lemma);

  const glosses = extractGlosses(xml);

  const idCandidate = key && key.length ? key : lemmaNorm || null;

  return { idCandidate, key, head: headClean, lemma, lemmaNorm, homograph, glosses };
}
