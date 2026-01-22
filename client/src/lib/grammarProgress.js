// client/src/lib/grammarProgress.js

const KEY = "ceasar_grammar_progress_v1";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadGrammarProgress() {
  const raw = localStorage.getItem(KEY);
  const parsed = raw ? safeParse(raw) : null;

  if (parsed && typeof parsed === "object") {
    return {
      version: 1,
      mastered: parsed.mastered && typeof parsed.mastered === "object" ? parsed.mastered : {},
      stats: parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
      updatedAt: parsed.updatedAt || Date.now(),
    };
  }

  return {
    version: 1,
    mastered: {}, // type -> array of instanceIds
    stats: {}, // bucket -> { attempts, correct, lastAt }
    history: [], // last ~80 events
    updatedAt: Date.now(),
  };
}

export function saveGrammarProgress(p) {
  const out = {
    version: 1,
    mastered: p.mastered || {},
    stats: p.stats || {},
    history: Array.isArray(p.history) ? p.history.slice(-80) : [],
    updatedAt: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(out));
  return out;
}

export function masteredSet(progress, type) {
  const arr = progress?.mastered?.[type];
  return new Set(Array.isArray(arr) ? arr : []);
}

export function countMastered(progress, type) {
  return masteredSet(progress, type).size;
}

export function markMastered(progress, type, instanceId) {
  const next = { ...progress, mastered: { ...(progress.mastered || {}) } };
  const set = masteredSet(progress, type);
  set.add(String(instanceId));

  next.mastered[type] = Array.from(set);
  return next;
}

/**
 * Check if an item can be marked as mastered.
 * Returns false if any recent attempts used hint or reveal.
 * This prevents gaming the system by spamming "reveal" and still getting mastery credit.
 */
export function canMarkMastered(progress, type, instanceId) {
  const history = progress?.history || [];
  const id = String(instanceId);

  // Find all attempts for this specific instance
  const relevant = history.filter(
    (e) => e.bucket === type && e.instanceId === id
  );

  // If no history for this item, allow mastery (first-time correct)
  if (relevant.length === 0) return true;

  // Check the most recent attempt(s) for this instance
  // If ANY used hint or reveal, deny mastery
  const recent = relevant.slice(-2);
  const usedCheat = recent.some((e) => e.hintUsed || e.revealed);

  return !usedCheat;
}

export function clearMastered(progress, types) {
  const next = { ...progress, mastered: { ...(progress.mastered || {}) } };
  for (const t of types) next.mastered[t] = [];
  return next;
}

export function recordAttempt(progress, bucket, ok, extra = {}) {
  const b = String(bucket || "unknown");
  const next = { ...progress, stats: { ...(progress.stats || {}) } };

  const row = next.stats[b] || { attempts: 0, correct: 0, lastAt: null };
  row.attempts += 1;
  if (ok) row.correct += 1;
  row.lastAt = Date.now();
  next.stats[b] = row;

  const evt = { t: Date.now(), bucket: b, ok: !!ok, ...extra };
  const hist = Array.isArray(progress.history) ? progress.history.slice() : [];
  hist.push(evt);
  next.history = hist.slice(-80);

  return next;
}

export function accuracy(progress, bucket) {
  const row = progress?.stats?.[bucket];
  if (!row || !row.attempts) return null;
  return row.correct / row.attempts;
}

export function struggleBuckets(progress, minAttempts = 6) {
  const stats = progress?.stats || {};
  const rows = [];

  for (const [bucket, r] of Object.entries(stats)) {
    if (!r || (r.attempts || 0) < minAttempts) continue;
    const acc = r.correct / r.attempts;
    rows.push({ bucket, attempts: r.attempts, correct: r.correct, acc });
  }

  rows.sort((a, b) => a.acc - b.acc);
  return rows;
}
