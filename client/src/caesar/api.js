// src/caesar/api.js
// Simple Caesar API client
import { API_BASE_URL } from "../lib/api";

export async function fetchCaesarSentence(sid) {
  const res = await fetch(`${API_BASE_URL}/api/caesar/sentence/${encodeURIComponent(sid)}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fetchCaesarSentence failed (${res.status}): ${txt}`);
  }
  return res.json();
}
