// src/vocab/data/storage.js
// LocalStorage-backed state + safe in-memory fallback

const hasLS = (() => {
  try {
    const k = "__vt_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch { return false; }
})();

const mem = new Map();
function getItem(k){ return hasLS ? window.localStorage.getItem(k) : mem.get(k) ?? null; }
function setItem(k,v){ return hasLS ? window.localStorage.setItem(k, v) : mem.set(k, v); }
function removeItem(k){ return hasLS ? window.localStorage.removeItem(k) : mem.delete(k); }

const KEYS = {
  prefs: "vt_prefs",
  seenNouns: "vt_seen_nouns",
  seenVerbs: "vt_seen_verbs",
  snapshot: "vt_snapshot",
  history: "vt_history",
  points: "vt_points",
  mnemonics: "vt_mnemonics",
  images: "vt_images",
};

export function initStorage(){
  // no-op, but here if we need migrations later
}

// ---------- Prefs ----------
const DEFAULT_PREFS = {
  useAIExamples: true,
  useTTS: true,
  sessionSize: 30,    // NEW
  // (Step 2 will add includeSeen)
  // (Step 3 will add seed)
};

export function loadPrefs() {
  try {
    const raw = getItem(KEYS.prefs);
    if (!raw) return { ...DEFAULT_PREFS };
    const obj = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...obj };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch) {
  const cur = loadPrefs();
  const next = { ...cur, ...(patch || {}) };
  setItem(KEYS.prefs, JSON.stringify(next));
  return next;
}

// ---------- Seen words ----------
function ensureSeenShape(mode, obj) {
  // shape: { "1": Set([...]), ... } keyed by decl/conj label
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (v instanceof Set) out[k] = v;
    else if (Array.isArray(v)) out[k] = new Set(v);
    else if (v && typeof v === "object") out[k] = new Set(Object.values(v));
  });
  return out;
}

export function loadSeenWords(mode) {
  const key = mode === "verb" ? KEYS.seenVerbs : KEYS.seenNouns;
  try {
    const raw = getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return ensureSeenShape(mode, obj);
  } catch {
    return {};
  }
}

export function saveSeenWords(mode, seenObj) {
  const key = mode === "verb" ? KEYS.seenVerbs : KEYS.seenNouns;
  const plain = {};
  Object.keys(seenObj || {}).forEach(k => {
    const v = seenObj[k];
    plain[k] = Array.from(v instanceof Set ? v : new Set(v || []));
  });
  setItem(key, JSON.stringify(plain));
}

// ---------- Snapshot ----------
export function saveSnapshot(data) {
  try { setItem(KEYS.snapshot, JSON.stringify(data)); return true; }
  catch { return false; }
}
export function loadSnapshot() {
  try {
    const raw = getItem(KEYS.snapshot);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearSnapshot() {
  try { removeItem(KEYS.snapshot); return true; }
  catch { return false; }
}

// ---------- History ----------
export function pushHistory(entry) {
  try {
    const arr = loadHistory();
    arr.push(entry);
    setItem(KEYS.history, JSON.stringify(arr));
    return true;
  } catch {
    return false;
  }
}
export function loadHistory() {
  try {
    const raw = getItem(KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function exportHistoryCSV() {
  const rows = loadHistory();
  if (!rows || !rows.length) { alert("No sessions completed yet."); return; }
  const header = ["timestampStart","mode","categories","accuracyPct","totalTimeMs","pointsAwarded"];
  const lines = [header.join(",")];
  rows.forEach(r => {
    lines.push([
      r.timestampStart ?? "",
      r.mode ?? "",
      (r.categories || []).map(String).join("|"),
      r.accuracyPct ?? "",
      r.totalTimeMs ?? "",
      r.pointsAwarded ?? 0
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocab_history.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// ---------- Points ----------
export function getPoints() {
  try {
    const raw = getItem(KEYS.points);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}
export function addPoints(delta) {
  const cur = getPoints();
  const next = Math.max(0, cur + Math.max(0, Number(delta) || 0));
  setItem(KEYS.points, String(next));
  return next;
}

// ---------- Mnemonics cache ----------
export function getStoredMnemonic(lemma) {
  try {
    const raw = getItem(KEYS.mnemonics);
    const obj = raw ? JSON.parse(raw) : {};
    return obj[lemma] || "";
  } catch { return ""; }
}

export function saveStoredMnemonic(lemma, text) {
  try {
    const raw = getItem(KEYS.mnemonics);
    const obj = raw ? JSON.parse(raw) : {};
    obj[lemma] = String(text || "");
    setItem(KEYS.mnemonics, JSON.stringify(obj));
  } catch { /* ignore */ }
}

// ---------- Images cache (data URLs) ----------
export function getStoredImage(lemma) {
  try {
    const raw = getItem(KEYS.images);
    const obj = raw ? JSON.parse(raw) : {};
    return obj[lemma] || "";
  } catch { return ""; }
}

export function saveStoredImage(lemma, dataUrl) {
  try {
    const raw = getItem(KEYS.images);
    const obj = raw ? JSON.parse(raw) : {};
    obj[lemma] = String(dataUrl || "");
    setItem(KEYS.images, JSON.stringify(obj));
  } catch { /* ignore */ }
}