// client/src/lib/textApi.js
// Parameterized API client for multi-text support.
// All endpoints use /api/text/:textId/...

import { API_BASE_URL } from "./api";

function textBase(textId) {
  return `${API_BASE_URL}/api/text/${textId}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

function qs(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

// --- Sentence / Chapter data ---

export async function fetchSentenceBundle(textId, sid) {
  return fetchJson(`${textBase(textId)}/sentenceBundle?sid=${encodeURIComponent(sid)}`);
}

export async function fetchChapterBundle(textId, chapter) {
  return fetchJson(`${textBase(textId)}/chapterBundle?chapter=${encodeURIComponent(chapter)}`);
}

export async function fetchChapters(textId) {
  return fetchJson(`${textBase(textId)}/chapters`);
}

// --- Vocabulary ---

export async function fetchTargets(textId) {
  return fetchJson(`${textBase(textId)}/targets`);
}

export async function fetchChapterVocab(textId, chapter) {
  return fetchJson(`${textBase(textId)}/chapterVocab?chapter=${encodeURIComponent(chapter)}`);
}

// --- Glossary ---

export async function fetchGlossary(textId, lemma) {
  return fetchJson(`${textBase(textId)}/glossary?lemma=${encodeURIComponent(lemma)}`);
}

export async function fetchGlossaryByForm(textId, form) {
  return fetchJson(`${textBase(textId)}/glossaryByForm?form=${encodeURIComponent(form)}`);
}

// --- Examples / Constructions ---

export async function fetchExamples(textId, types) {
  const q = Array.isArray(types) ? types.join(",") : String(types || "");
  return fetchJson(`${textBase(textId)}/examples?types=${encodeURIComponent(q)}`);
}

export async function fetchConstructionCounts(textId) {
  return fetchJson(`${textBase(textId)}/constructionCounts`);
}

export async function fetchVocabCounts(textId) {
  return fetchJson(`${textBase(textId)}/vocabCounts`);
}

// --- Practice ---

export async function fetchPracticeChunk(textId, { type, n, exclude, mastered } = {}) {
  const query = qs({ type, n, exclude, mastered, nonce: Date.now() });
  return fetchJson(`${textBase(textId)}/practiceChunk?${query}`);
}

export async function fetchPracticePoolSize(textId, { type, n } = {}) {
  const query = qs({ type, n });
  return fetchJson(`${textBase(textId)}/practicePoolSize?${query}`);
}

// --- Single example sentence ---

export async function fetchExample(textId, sid) {
  return fetchJson(`${textBase(textId)}/example?sid=${encodeURIComponent(sid)}`);
}
