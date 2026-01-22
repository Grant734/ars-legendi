// src/vocab/llm.js
// Client helpers for calling your Express API from the Vite frontend.
//
// IMPORTANT:
// Your dev environment sometimes serves the API on different ports (3000 vs 3001).
// If we hardcode a port, you get 404s.
// This module auto-detects the working API base by probing /api/health, then caches it.

const JSON_HEADERS = { "Content-Type": "application/json" };

function normalizeBase(base) {
  if (!base) return "";
  return String(base).replace(/\/$/, "");
}

function getLocationParts() {
  if (typeof window === "undefined") {
    return { protocol: "", hostname: "localhost" };
  }
  const { protocol, hostname } = window.location;
  return { protocol, hostname };
}

// --- API base autodetection (cached) ---
let _apiBasePromise = null;

async function probeHealth(base) {
  try {
    const url = `${base}/api/health`;
    const res = await fetch(url, { method: "GET" });
    return !!res.ok;
  } catch {
    return false;
  }
}

async function computeApiBase() {
  // 1) If you set VITE_API_BASE, that wins.
  try {
    const envBase = import.meta?.env?.VITE_API_BASE;
    if (envBase) return normalizeBase(envBase);
  } catch {}

  // 2) If cached in sessionStorage, use it (can be "" for same-origin).
  try {
    const cached = sessionStorage.getItem("vt_api_base");
    if (cached != null) return cached;
  } catch {}

  // 3) Try candidates in order:
  //    a) same-origin (works if Vite proxy is configured correctly)
  //    b) localhost:3001 (your Express port in your logs)
  //    c) localhost:3000 (common alternative)
  const { protocol, hostname } = getLocationParts();
  const candidates = [
    "",
    `${protocol}//${hostname}:3001`,
    `${protocol}//${hostname}:3000`,
  ];

  for (const base of candidates) {
    const ok = await probeHealth(base);
    if (ok) {
      try {
        sessionStorage.setItem("vt_api_base", base);
      } catch {}
      return base;
    }
  }

  // 4) Fall back to same-origin.
  try {
    sessionStorage.setItem("vt_api_base", "");
  } catch {}
  return "";
}

async function apiBase() {
  if (!_apiBasePromise) _apiBasePromise = computeApiBase();
  return _apiBasePromise;
}

async function postJson(endpoint, body) {
  const base = await apiBase();
  const url = `${base}${endpoint}`;
  return fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body || {}),
  });
}
export async function fetchSentence(lemma, mode, entry, english) {
  try {
    // Prefer new route, fallback to old
    let res = await fetch("/api/latinSentence", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ lemma, mode, entry, english })
    });

    if (res.status === 404) {
      res = await fetch("/api/latinSentence", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ lemma, mode, entry, english })
      });
    }

    if (!res.ok) {
      return { latin_sentence: "", english_translation: "" };
    }

    const data = await res.json().catch(() => ({}));
    const latin_sentence = (data && typeof data.latin_sentence === "string") ? data.latin_sentence.trim() : "";
    const english_translation = (data && typeof data.english_translation === "string") ? data.english_translation.trim() : "";
    return { latin_sentence, english_translation };
  } catch (e) {
    console.error("fetchSentence error:", e);
    return { latin_sentence: "", english_translation: "" };
  }
}

// --- Mnemonic (on incorrect) ---
export async function fetchMnemonic(lemma, mode, entry, english) {
  try {
    const res = await fetch("/api/mnemonic", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ lemma, mode, entry, english })
    });
    if (!res.ok) throw new Error("mnemonic http " + res.status);

    const data = await res.json().catch(() => ({}));
    const mnemonic =
      (data && typeof data.mnemonic === "string" && data.mnemonic.trim())
        ? data.mnemonic.trim()
        : defaultMnemonic(lemma, english);

    return { mnemonic };
  } catch {
    return { mnemonic: defaultMnemonic(lemma, english) };
  }
}

function defaultMnemonic(lemma, english) {
  return `Picture “${lemma}” meaning “${english}” in a vivid scene you won’t forget.`;
}

// --- Phase 3 hint (after first wrong attempt) ---
export async function fetchHint(lemma, entry, english) {
  try {
    // Prefer new route, fallback to old
    let res = await fetch("/api/latinHint", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ lemma, entry, english })
    });

    if (res.status === 404) {
      res = await fetch("/api/hint", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ lemma, entry, english })
      });
    }

    if (!res.ok) throw new Error("hint http " + res.status);
    const data = await res.json().catch(() => ({}));
    const hint = (data && typeof data.hint === "string") ? data.hint.trim() : "";
    return hint;
  } catch {
    return "";
  }
}

export async function fetchImage(lemma, mode, entry, english) {
  try {
    let res = await fetch("/api/latinImage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lemma, mode, entry, english })
    });

    if (res.status === 404) {
      res = await fetch("/api/latin-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma, mode, entry, english })
      });
    }

    if (!res.ok) return { image_data_url: "", error: `latinImage HTTP ${res.status}` };

    const data = await res.json().catch(() => ({}));
    const image_data_url = typeof data.image_data_url === "string" ? data.image_data_url.trim() : "";
    const error = typeof data.error === "string" ? data.error.trim() : "";
    return { image_data_url, error };
  } catch (e) {
    return { image_data_url: "", error: e?.message || "fetchImage failed" };
  }
}


// --- Utilities (already used by VocabTrainer) ---
export async function downloadFlashcardsPDF(wordSet, mode) {
  try {
    const res = await fetch("/api/flashcards", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ wordSet, mode })
    });
    if (!res.ok) throw new Error("flashcards http " + res.status);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "latin-flashcards.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Could not generate flashcards PDF.");
    console.error(e);
  }
}