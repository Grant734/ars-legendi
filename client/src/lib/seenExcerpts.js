// client/src/lib/seenExcerpts.js
// Tracks which practice excerpts a student has seen to avoid repetition.

const STORAGE_PREFIX = "seen_excerpts_";
const RESET_THRESHOLD = 0.90; // Reset when 90% of pool is seen

/**
 * Generate storage key for a specific student/mode/type combination.
 */
export function getStorageKey(studentId, mode, type) {
  return `${STORAGE_PREFIX}${studentId}_${mode}_${type}`;
}

/**
 * Load seen excerpts data from localStorage.
 * Returns: { excerptIds: string[], lastReset: number, cycleCount: number }
 */
export function loadSeenExcerpts(studentId, mode, type) {
  const key = getStorageKey(studentId, mode, type);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { excerptIds: [], lastReset: Date.now(), cycleCount: 0 };
    }
    const parsed = JSON.parse(raw);
    return {
      excerptIds: Array.isArray(parsed.excerptIds) ? parsed.excerptIds : [],
      lastReset: parsed.lastReset || Date.now(),
      cycleCount: parsed.cycleCount || 0,
    };
  } catch {
    return { excerptIds: [], lastReset: Date.now(), cycleCount: 0 };
  }
}

/**
 * Save seen excerpts data to localStorage.
 */
function saveSeenExcerpts(studentId, mode, type, data) {
  const key = getStorageKey(studentId, mode, type);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage may be full or unavailable
  }
}

/**
 * Add an excerptId to the seen list.
 * Always adds, even if already present (for edge case handling).
 */
export function addSeenExcerpt(studentId, mode, type, excerptId) {
  const data = loadSeenExcerpts(studentId, mode, type);

  // Always add to avoid infinite loops if server returns same ID
  if (!data.excerptIds.includes(excerptId)) {
    data.excerptIds.push(excerptId);
  }

  saveSeenExcerpts(studentId, mode, type, data);
  return data;
}

/**
 * Get comma-separated exclude string for API calls.
 */
export function getExcludeString(studentId, mode, type) {
  const data = loadSeenExcerpts(studentId, mode, type);
  return data.excerptIds.join(",");
}

/**
 * Reset the seen excerpts list (start a new cycle).
 */
export function resetSeenExcerpts(studentId, mode, type) {
  const data = loadSeenExcerpts(studentId, mode, type);
  const newData = {
    excerptIds: [],
    lastReset: Date.now(),
    cycleCount: (data.cycleCount || 0) + 1,
  };
  saveSeenExcerpts(studentId, mode, type, newData);
  return newData;
}

/**
 * Get statistics about seen excerpts.
 * Returns: { seen: number, total: number, percentage: number, cycleCount: number }
 */
export function getSeenStats(studentId, mode, type, totalPool) {
  const data = loadSeenExcerpts(studentId, mode, type);
  const seen = data.excerptIds.length;
  const total = totalPool || 0;
  const percentage = total > 0 ? (seen / total) * 100 : 0;

  return {
    seen,
    total,
    percentage,
    cycleCount: data.cycleCount || 0,
  };
}

/**
 * Check if the pool is exhausted and should be reset.
 * Returns true if >= 90% of pool has been seen.
 */
export function shouldReset(studentId, mode, type, totalPool) {
  if (!totalPool || totalPool <= 0) return false;

  const data = loadSeenExcerpts(studentId, mode, type);
  const ratio = data.excerptIds.length / totalPool;

  return ratio >= RESET_THRESHOLD;
}

/**
 * Clear all seen excerpts for a student (all modes/types).
 * Use with caution - this resets all progress.
 */
export function clearAllSeenExcerpts(studentId) {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}${studentId}_`)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
