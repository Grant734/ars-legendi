const CAESAR_API_BASE = "/api/caesar";

function withDevRefresh(url) {
  // only in dev
  if (!import.meta?.env?.DEV) return url;
  const u = new URL(url, window.location.origin);
  u.searchParams.set("refresh", "1");
  return u.pathname + u.search;
}

async function fetchJson(url) {
  const res = await fetch(withDevRefresh(url), { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function fetchSentenceBundle(sid) {
  return fetchJson(`${CAESAR_API_BASE}/sentenceBundle?sid=${encodeURIComponent(sid)}`);
}

export async function fetchChapterBundle(chapter) {
  return fetchJson(`${CAESAR_API_BASE}/chapterBundle?chapter=${encodeURIComponent(chapter)}`);
}

export async function fetchExamples(types) {
  const q = Array.isArray(types) ? types.join(",") : String(types || "");
  return fetchJson(`${CAESAR_API_BASE}/examples?types=${encodeURIComponent(q)}`);
}

export async function fetchPracticeChunk({ type = "all" } = {}) {
  const qs = new URLSearchParams();
  qs.set("type", type);
  return fetchJson(`${CAESAR_API_BASE}/practiceChunk?${qs.toString()}`);
}
