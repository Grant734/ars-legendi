// src/caesar/api.js
// Simple Caesar API client (no AI).
// Uses the same "find the server" trick as your existing llm.js.

let _base = null;

async function apiBase() {
  if (_base) return _base;

  // First try relative (works if you have a proxy configured)
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      _base = "";
      return _base;
    }
  } catch (e) {
    // ignore
  }

  // Otherwise probe common dev ports (same idea as llm.js)
  const candidates = [3001, 3002, 3000, 5174, 5173];
  for (const port of candidates) {
    const base = `http://localhost:${port}`;
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        _base = base;
        return _base;
      }
    } catch (e) {
      // keep trying
    }
  }

  throw new Error("Could not find server (api/health not reachable). Is backend running?");
}

export async function fetchCaesarSentence(sid) {
  const base = await apiBase();
  const res = await fetch(`${base}/api/caesar/sentence/${encodeURIComponent(sid)}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fetchCaesarSentence failed (${res.status}): ${txt}`);
  }
  return res.json();
}
