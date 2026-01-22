// client/src/lib/userState.js
// Phase 3: Mastery/Stats Engine
// Transforms AttemptEvents into queryable skill state and mastery tracking.
// Phase 9: Uses storage abstraction for backend-ready architecture.

import { loadLocalEvents, EVENT_TYPES, SKILLS, SUBSKILLS, setOnEventLogged } from "./attemptEvents";
import { getCurrentStudentId } from "./studentIdentity";
import { storage } from "./storage";
import {
  ELO_CONSTANTS,
  computeEloFromEvents,
  calculateItemDifficulties,
  ratingToLevel,
  getProgressToNextLevel as getEloProgressToNextLevel,
} from "./eloRating";

// ============================================================================
// CONSTANTS
// ============================================================================

// Mastery thresholds
const MASTERY_STREAK_REQUIRED = 2;          // Correct in a row without hints
const RECENT_ACCURACY_WINDOW = 20;          // Recent attempts for accuracy calculation
const WEAK_PATTERN_THRESHOLD = 0.5;         // Below 50% accuracy = weak
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Minimum attempts for meaningful Elo rating
const MIN_ATTEMPTS_FOR_ELO = 3;

// ============================================================================
// USER STATE BUILDER
// ============================================================================

/**
 * @typedef {Object} SkillMastery
 * @property {string} skillId
 * @property {string} subskillId
 * @property {number} exposures - Total attempts
 * @property {number} uniqueItems - Unique items seen
 * @property {number} recentAccuracy - Accuracy in last RECENT_ACCURACY_WINDOW attempts (0-1)
 * @property {number} overallAccuracy - All-time accuracy (0-1)
 * @property {number} currentStreak - Current correct streak
 * @property {number} bestStreak - Best ever correct streak
 * @property {number} eloRating - Elo-style rating (1200 = average, higher = more skilled)
 * @property {number} lastPracticed - Timestamp of last attempt
 * @property {string} level - "novice" | "learning" | "proficient" | "mastered"
 */

/**
 * @typedef {Object} ItemMastery
 * @property {string} itemId
 * @property {string} skillId
 * @property {string} subskillId
 * @property {number} seenCount - Total attempts
 * @property {number} correctCount - Total correct
 * @property {number} lastSeen - Timestamp
 * @property {boolean} lastResult - Was last attempt correct?
 * @property {boolean} mastered - Met mastery criteria?
 * @property {boolean} needsReview - Should be reviewed soon?
 * @property {number} currentStreak - Current correct streak
 * @property {boolean} hintsUsed - Any hints used on this item?
 * @property {boolean} revealed - Was answer ever revealed?
 */

/**
 * @typedef {Object} WeakPattern
 * @property {string} skillId
 * @property {string} subskillId
 * @property {number} accuracy
 * @property {number} attempts
 * @property {string[]} weakItems - Items with low accuracy
 * @property {string} recommendation
 */

/**
 * @typedef {Object} UserState
 * @property {string} studentId
 * @property {number} computedAt - When this state was computed
 * @property {Object<string, SkillMastery>} skills - Keyed by "skillId:subskillId"
 * @property {Object<string, ItemMastery>} items - Keyed by itemId
 * @property {WeakPattern[]} weakPatterns - Areas needing attention
 * @property {Object} summary - High-level stats
 */

/**
 * Build complete user state from events.
 *
 * @param {Object} options
 * @param {string} [options.studentId] - Student to build state for (defaults to current)
 * @param {string} [options.assignmentId] - Filter to specific assignment
 * @param {number} [options.since] - Only consider events after this timestamp
 * @returns {UserState}
 */
export function buildUserState(options = {}) {
  const { assignmentId, since } = options;
  const studentId = options.studentId || getCurrentStudentId({ assignmentId });

  // Load and filter events
  let events = loadLocalEvents().filter((e) => e.studentId === studentId);

  if (assignmentId) {
    events = events.filter((e) => e.assignmentId === assignmentId);
  }

  if (since) {
    events = events.filter((e) => e.timestamp >= since);
  }

  // Sort chronologically (oldest first for processing)
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Filter to answer events for mastery calculations
  const answerEvents = events.filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT);

  // Calculate item difficulties from aggregate performance (for Elo)
  const itemDifficulties = calculateItemDifficulties(answerEvents);

  // Build skill-level mastery (now uses Elo)
  const skills = buildSkillMastery(answerEvents, itemDifficulties);

  // Build item-level mastery
  const items = buildItemMastery(answerEvents);

  // Detect weak patterns
  const weakPatterns = detectWeakPatterns(skills, items);

  // Build summary
  const summary = buildSummary(skills, items, answerEvents);

  return {
    studentId,
    computedAt: Date.now(),
    skills,
    items,
    weakPatterns,
    summary,
  };
}

// ============================================================================
// SKILL MASTERY COMPUTATION
// ============================================================================

/**
 * Build skill/subskill mastery from events.
 * Now uses Elo rating system instead of confidence scores.
 *
 * @param {Array} events - Answer events
 * @param {Object} itemDifficulties - Pre-computed item difficulty ratings
 */
function buildSkillMastery(events, itemDifficulties = {}) {
  // Group events by skill:subskill
  const grouped = {};

  for (const event of events) {
    const key = `${event.skillId}:${event.subskillId}`;
    if (!grouped[key]) {
      grouped[key] = {
        skillId: event.skillId,
        subskillId: event.subskillId,
        events: [],
        uniqueItems: new Set(),
      };
    }
    grouped[key].events.push(event);
    grouped[key].uniqueItems.add(event.itemId);
  }

  // Compute mastery for each skill:subskill
  const skills = {};

  for (const [key, data] of Object.entries(grouped)) {
    const { skillId, subskillId, events: skillEvents, uniqueItems } = data;

    // Sort most recent first for accuracy/streak calculations
    const sortedDesc = [...skillEvents].sort((a, b) => b.timestamp - a.timestamp);

    // Sort oldest first for Elo calculation (chronological processing)
    const sortedAsc = [...skillEvents].sort((a, b) => a.timestamp - b.timestamp);

    // Recent accuracy (last N)
    // Only count clean attempts (no hints, not revealed) in both numerator and denominator
    const recentWindow = sortedDesc.slice(0, RECENT_ACCURACY_WINDOW);
    const recentCleanAttempts = recentWindow.filter((e) => !e.hintUsed && !e.revealed);
    const recentCorrect = recentCleanAttempts.filter((e) => e.correct).length;
    const recentAccuracy = recentCleanAttempts.length > 0 ? recentCorrect / recentCleanAttempts.length : 0;

    // Overall accuracy (also using only clean attempts)
    const allCleanAttempts = skillEvents.filter((e) => !e.hintUsed && !e.revealed);
    const allCorrect = allCleanAttempts.filter((e) => e.correct).length;
    const overallAccuracy = allCleanAttempts.length > 0 ? allCorrect / allCleanAttempts.length : 0;

    // Streak calculation
    const { currentStreak, bestStreak } = computeStreak(sortedDesc);

    // Last practiced
    const lastPracticed = sortedDesc.length ? sortedDesc[0].timestamp : 0;

    // Elo rating (replaces confidence score)
    const eloResult = computeEloFromEvents(sortedAsc, itemDifficulties);
    const eloRating = eloResult.rating;

    // Level determination (now based on Elo)
    const level = ratingToLevel(eloRating);

    skills[key] = {
      skillId,
      subskillId,
      exposures: skillEvents.length,
      uniqueItems: uniqueItems.size,
      recentAccuracy,
      overallAccuracy,
      currentStreak,
      bestStreak,
      eloRating,
      lastPracticed,
      level,
    };
  }

  return skills;
}

/**
 * Compute current and best streak from events (sorted most recent first).
 */
function computeStreak(sortedEvents) {
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  // Current streak: count from most recent until first miss
  for (const event of sortedEvents) {
    if (event.correct && !event.hintUsed && !event.revealed) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Best streak: scan all events
  for (const event of [...sortedEvents].reverse()) {
    if (event.correct && !event.hintUsed && !event.revealed) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return { currentStreak, bestStreak };
}

// NOTE: computeConfidence and determineLevel have been replaced by Elo rating.
// Level is now determined by ratingToLevel() from eloRating.js:
//   >= 1600: "mastered"
//   >= 1400: "proficient"
//   >= 1200: "learning"
//   < 1200: "novice"

// ============================================================================
// ITEM MASTERY COMPUTATION
// ============================================================================

/**
 * Build per-item mastery from events.
 */
function buildItemMastery(events) {
  // Group by itemId
  const grouped = {};

  for (const event of events) {
    const key = event.itemId;
    if (!grouped[key]) {
      grouped[key] = {
        itemId: key,
        skillId: event.skillId,
        subskillId: event.subskillId,
        events: [],
      };
    }
    grouped[key].events.push(event);
  }

  // Compute mastery for each item
  const items = {};

  for (const [key, data] of Object.entries(grouped)) {
    const { itemId, skillId, subskillId, events: itemEvents } = data;

    // Sort most recent first
    const sorted = [...itemEvents].sort((a, b) => b.timestamp - a.timestamp);

    const seenCount = itemEvents.length;
    const correctCount = itemEvents.filter((e) => e.correct).length;
    const lastSeen = sorted[0].timestamp;
    const lastResult = sorted[0].correct;

    // Check for hints/reveals
    const hintsUsed = itemEvents.some((e) => e.hintUsed);
    const revealed = itemEvents.some((e) => e.revealed);

    // Current streak (from most recent)
    let currentStreak = 0;
    for (const event of sorted) {
      if (event.correct && !event.hintUsed && !event.revealed) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Mastery: requires MASTERY_STREAK_REQUIRED correct in a row without help
    const mastered = currentStreak >= MASTERY_STREAK_REQUIRED;

    // Needs review: recent miss, or stale, or revealed recently
    const now = Date.now();
    const isStale = now - lastSeen > STALE_THRESHOLD_MS;
    const recentMiss = !lastResult;
    const recentReveal = sorted.slice(0, 2).some((e) => e.revealed);

    const needsReview = !mastered && (recentMiss || isStale || recentReveal);

    items[key] = {
      itemId,
      skillId,
      subskillId,
      seenCount,
      correctCount,
      lastSeen,
      lastResult,
      mastered,
      needsReview,
      currentStreak,
      hintsUsed,
      revealed,
    };
  }

  return items;
}

// ============================================================================
// WEAK PATTERN DETECTION
// ============================================================================

/**
 * Detect weak patterns that need attention.
 * Uses both Elo rating and accuracy to identify struggling skills.
 */
function detectWeakPatterns(skills, items) {
  const patterns = [];

  // Find skills below threshold (low accuracy OR low Elo)
  for (const [key, skill] of Object.entries(skills)) {
    const hasEnoughAttempts = skill.exposures >= MIN_ATTEMPTS_FOR_ELO;
    const isLowAccuracy = skill.recentAccuracy < WEAK_PATTERN_THRESHOLD;
    const isLowElo = skill.eloRating < 1100; // Below learning threshold

    if (hasEnoughAttempts && (isLowAccuracy || isLowElo)) {
      // Find specific weak items in this skill
      const weakItems = Object.values(items)
        .filter((item) =>
          item.skillId === skill.skillId &&
          item.subskillId === skill.subskillId &&
          item.seenCount >= 2 &&
          item.correctCount / item.seenCount < WEAK_PATTERN_THRESHOLD
        )
        .map((item) => item.itemId)
        .slice(0, 5);

      patterns.push({
        skillId: skill.skillId,
        subskillId: skill.subskillId,
        accuracy: skill.recentAccuracy,
        eloRating: skill.eloRating,
        attempts: skill.exposures,
        weakItems,
        recommendation: generateRecommendation(skill),
      });
    }
  }

  // Sort by Elo rating (lowest first = most urgent)
  patterns.sort((a, b) => a.eloRating - b.eloRating);

  return patterns;
}

/**
 * Generate a recommendation for a weak skill.
 */
function generateRecommendation(skill) {
  const { skillId, subskillId, recentAccuracy, exposures } = skill;

  // Parse skill type
  const isGrammar = skillId.startsWith("grammar:");
  const isVocab = skillId.startsWith("vocab:");

  if (exposures < 10) {
    return "Keep practicing to build familiarity.";
  }

  if (recentAccuracy < 0.3) {
    if (isGrammar) {
      return "Review the grammar rules and examples before more practice.";
    }
    if (isVocab) {
      return "Focus on learning these words with flashcards or mnemonics.";
    }
  }

  if (subskillId === SUBSKILLS.IDENTIFY) {
    return "Practice identifying more examples in context.";
  }

  if (subskillId === SUBSKILLS.CLASSIFY) {
    return "Review the classification categories and their distinguishing features.";
  }

  if (subskillId === SUBSKILLS.PRODUCE) {
    return "Practice producing the Latin forms more frequently.";
  }

  if (subskillId === SUBSKILLS.RECOGNIZE) {
    return "Review these vocabulary items more frequently.";
  }

  return "Continue practicing with focused attention.";
}

// ============================================================================
// SUMMARY COMPUTATION
// ============================================================================

/**
 * Build high-level summary stats.
 * Now uses Elo rating instead of confidence.
 */
function buildSummary(skills, items, events) {
  const now = Date.now();

  // Total attempts
  const totalAttempts = events.length;
  const totalCorrect = events.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

  // Items
  const totalItems = Object.keys(items).length;
  const masteredItems = Object.values(items).filter((i) => i.mastered).length;
  const needsReviewItems = Object.values(items).filter((i) => i.needsReview).length;

  // Skills
  const skillCount = Object.keys(skills).length;
  const masteredSkills = Object.values(skills).filter((s) => s.level === "mastered").length;
  const proficientSkills = Object.values(skills).filter((s) => s.level === "proficient").length;
  const weakSkills = Object.values(skills).filter(
    (s) => s.exposures >= MIN_ATTEMPTS_FOR_ELO && (s.recentAccuracy < WEAK_PATTERN_THRESHOLD || s.eloRating < 1100)
  ).length;

  // Average Elo rating (replaces avgConfidence)
  const skillsWithData = Object.values(skills).filter((s) => s.exposures >= MIN_ATTEMPTS_FOR_ELO);
  const avgEloRating = skillsWithData.length
    ? Math.round(skillsWithData.reduce((sum, s) => sum + s.eloRating, 0) / skillsWithData.length)
    : ELO_CONSTANTS.INITIAL_RATING;

  // Recent activity (last 7 days)
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((e) => e.timestamp > weekAgo);
  const recentDays = new Set(
    recentEvents.map((e) => new Date(e.timestamp).toDateString())
  ).size;

  // Streak days (consecutive days with practice)
  const streakDays = computeStreakDays(events);

  return {
    totalAttempts,
    totalCorrect,
    overallAccuracy: totalAttempts ? totalCorrect / totalAttempts : 0,
    totalItems,
    masteredItems,
    needsReviewItems,
    masteryRate: totalItems ? masteredItems / totalItems : 0,
    skillCount,
    masteredSkills,
    proficientSkills,
    weakSkills,
    avgEloRating,
    recentAttempts: recentEvents.length,
    recentDays,
    streakDays,
  };
}

/**
 * Compute consecutive days with practice (up to today).
 */
function computeStreakDays(events) {
  if (!events.length) return 0;

  // Get unique days with practice
  const days = new Set(
    events.map((e) => new Date(e.timestamp).toDateString())
  );

  // Check consecutive days from today backward
  const today = new Date();
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toDateString();

    if (days.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      // Allow skipping today if no practice yet, but not other days
      break;
    }
  }

  return streak;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get mastery for a specific skill:subskill.
 */
export function getSkillMastery(userState, skillId, subskillId) {
  const key = `${skillId}:${subskillId}`;
  return userState.skills[key] || null;
}

/**
 * Get mastery for a specific item.
 */
export function getItemMasteryFromState(userState, itemId) {
  return userState.items[itemId] || null;
}

/**
 * Get all items needing review.
 */
export function getReviewQueue(userState, options = {}) {
  const { skillId, limit = 20 } = options;

  let items = Object.values(userState.items).filter((i) => i.needsReview);

  if (skillId) {
    items = items.filter((i) => i.skillId === skillId);
  }

  // Sort by priority: recent misses first, then by staleness
  items.sort((a, b) => {
    // Recent misses first
    if (!a.lastResult && b.lastResult) return -1;
    if (a.lastResult && !b.lastResult) return 1;

    // Then by last seen (oldest first)
    return a.lastSeen - b.lastSeen;
  });

  return items.slice(0, limit);
}

/**
 * Get all mastered items.
 */
export function getMasteredItems(userState, options = {}) {
  const { skillId, subskillId } = options;

  let items = Object.values(userState.items).filter((i) => i.mastered);

  if (skillId) {
    items = items.filter((i) => i.skillId === skillId);
  }

  if (subskillId) {
    items = items.filter((i) => i.subskillId === subskillId);
  }

  return items;
}

/**
 * Get skills sorted by mastery level.
 */
export function getSkillsByLevel(userState, level) {
  return Object.values(userState.skills).filter((s) => s.level === level);
}

/**
 * Get overall readiness for a skill (considers all subskills).
 */
export function getSkillReadiness(userState, skillId) {
  const subskills = Object.values(userState.skills).filter((s) => s.skillId === skillId);

  if (!subskills.length) {
    return { ready: false, confidence: 0, subskills: [] };
  }

  const avgConfidence = Math.round(
    subskills.reduce((sum, s) => sum + s.confidence, 0) / subskills.length
  );

  const allMastered = subskills.every((s) => s.level === "mastered");
  const allProficient = subskills.every(
    (s) => s.level === "mastered" || s.level === "proficient"
  );

  return {
    ready: allMastered,
    proficient: allProficient,
    confidence: avgConfidence,
    subskills: subskills.map((s) => ({
      subskillId: s.subskillId,
      level: s.level,
      confidence: s.confidence,
    })),
  };
}

// ============================================================================
// PERSISTENCE (for caching computed state)
// Phase 9: Uses storage abstraction for backend-ready architecture.
// ============================================================================

/**
 * Get cached user state, or compute fresh if stale.
 * Uses the storage abstraction layer which can be configured for localStorage or server.
 */
export async function getUserStateAsync(options = {}) {
  const { forceRefresh = false, ...buildOptions } = options;
  const studentId = buildOptions.studentId || getCurrentStudentId(buildOptions);

  if (!forceRefresh) {
    const cached = await storage.loadMasteryState(studentId);
    if (cached && cached.studentId === studentId) {
      return cached;
    }
  }

  const state = buildUserState(buildOptions);
  await storage.saveMasteryState(studentId, state);

  return state;
}

/**
 * Get cached user state, or compute fresh if stale.
 * Synchronous version for backward compatibility - uses local cache only.
 */
export function getUserState(options = {}) {
  const { forceRefresh = false, ...buildOptions } = options;
  const studentId = buildOptions.studentId || getCurrentStudentId(buildOptions);

  if (!forceRefresh) {
    const cached = loadCachedStateSync(studentId);
    if (cached) return cached;
  }

  const state = buildUserState(buildOptions);
  saveCachedStateSync(state);

  // Also save to storage abstraction asynchronously
  storage.saveMasteryState(studentId, state).catch(() => {});

  return state;
}

/**
 * Load cached state synchronously (localStorage only, for backward compatibility).
 */
function loadCachedStateSync(studentId) {
  try {
    const key = `latin_mastery_state_cache_${studentId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const cached = JSON.parse(raw);

    // Check if not expired (5 minutes)
    const CACHE_TTL_MS = 5 * 60 * 1000;
    if (Date.now() - (cached.cachedAt || cached.computedAt || 0) > CACHE_TTL_MS) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Save state to cache synchronously (localStorage only, for backward compatibility).
 */
function saveCachedStateSync(state) {
  try {
    const key = `latin_mastery_state_cache_${state.studentId}`;
    localStorage.setItem(key, JSON.stringify({
      ...state,
      cachedAt: Date.now(),
    }));
  } catch {
    // Cache is optional
  }
}

/**
 * Invalidate the cache (call after new events are logged).
 * Clears both local cache and storage abstraction.
 */
export function invalidateStateCache(studentId) {
  const sid = studentId || getCurrentStudentId();

  // Clear local sync cache
  try {
    const key = `latin_mastery_state_cache_${sid}`;
    localStorage.removeItem(key);
  } catch {}

  // Clear via storage abstraction
  storage.invalidateMasteryState(sid).catch(() => {});
}

// ============================================================================
// EXPORT FOR UI COMPONENTS
// ============================================================================

/**
 * Get a display-friendly summary for a skill.
 * Now uses Elo rating instead of confidence.
 */
export function formatSkillSummary(skill) {
  if (!skill) {
    return { label: "Not started", color: "gray", icon: "circle", eloRating: ELO_CONSTANTS.INITIAL_RATING };
  }

  const { level, eloRating, exposures, recentAccuracy } = skill;

  const labels = {
    mastered: "Mastered",
    proficient: "Proficient",
    learning: "Learning",
    novice: "Novice",
  };

  const colors = {
    mastered: "green",
    proficient: "blue",
    learning: "yellow",
    novice: "gray",
  };

  const icons = {
    mastered: "check-circle",
    proficient: "trending-up",
    learning: "activity",
    novice: "circle",
  };

  return {
    label: labels[level],
    color: colors[level],
    icon: icons[level],
    eloRating,
    exposures,
    accuracy: Math.round(recentAccuracy * 100),
  };
}

/**
 * Get progress toward next level.
 * Now uses Elo rating thresholds:
 *   < 1200: novice -> learning at 1200
 *   1200-1400: learning -> proficient at 1400
 *   1400-1600: proficient -> mastered at 1600
 *   >= 1600: mastered (max)
 */
export function getProgressToNextLevel(skill) {
  if (!skill) {
    return {
      current: ELO_CONSTANTS.INITIAL_RATING,
      target: 1200,
      nextLevel: "learning",
      percentage: 0,
      pointsNeeded: 0,
    };
  }

  // Use the Elo-based progress function
  return getEloProgressToNextLevel(skill.eloRating);
}

// ============================================================================
// AUTO-INVALIDATION ON EVENT LOGGING
// ============================================================================

// Register callback to invalidate cache when new events are logged
setOnEventLogged(() => {
  invalidateStateCache();
});
