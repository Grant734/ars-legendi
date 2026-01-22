// client/src/lib/learningLoop.js
// Phase 7: Learning Loop Orchestrator
// Single source of truth for: event → model → state → action → practice

import {
  logAttemptEvent,
  logCorrectAnswer,
  logIncorrectAnswer,
  getSkillForConstructionType,
  EVENT_TYPES,
  SUBSKILLS,
} from "./attemptEvents";
import {
  getUserState,
  invalidateStateCache,
  getSkillMastery,
  buildUserState,
} from "./userState";
import {
  chooseNextBestAction,
  getCoachingRecommendation,
  buildSessionContext,
  detectPatterns,
  detectMisconceptions,
  ACTION_CONFIG,
} from "./adaptiveFeedback";
import { getCoachIntervention, shouldShowCoach } from "./coachTriggers";
import { getCurrentStudentId } from "./studentIdentity";

// ============================================================================
// LEARNING LOOP ORCHESTRATOR
// ============================================================================

/**
 * The central orchestrator that enforces proper data flow:
 * 1. AttemptEvent written
 * 2. Model update runs (cache invalidated)
 * 3. UserState recomputed
 * 4. chooseNextBestAction reads fresh state
 * 5. Returns recommendation + why
 *
 * This ensures the coach never recommends based on stale data.
 */

/**
 * @typedef {Object} LoopResult
 * @property {Object} event - The logged event
 * @property {Object} userState - Fresh user state after event
 * @property {Object|null} recommendation - Next best action if applicable
 * @property {Object|null} coachIntervention - Coach intervention if triggered
 * @property {Object} patterns - Detected behavioral patterns
 * @property {string} why - Human-readable explanation of current state
 */

/**
 * Process an attempt and return the complete loop result.
 * This is the ONLY function that should be called after user answers.
 *
 * @param {Object} params
 * @param {string} params.skillId - The skill being practiced
 * @param {string} params.subskillId - The subskill
 * @param {string} params.itemId - The specific item
 * @param {boolean} params.correct - Was the answer correct?
 * @param {boolean} [params.hintUsed] - Was a hint used?
 * @param {boolean} [params.revealed] - Was the answer revealed?
 * @param {number} [params.latencyMs] - Response time
 * @param {string} [params.userAnswer] - What the user answered
 * @param {string} [params.expectedAnswer] - The correct answer
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {LoopResult}
 */
export function processAttempt({
  skillId,
  subskillId = SUBSKILLS.IDENTIFY,
  itemId,
  correct,
  hintUsed = false,
  revealed = false,
  latencyMs = null,
  userAnswer = null,
  expectedAnswer = null,
  metadata = {},
}) {
  const studentId = getCurrentStudentId();

  // =========================================================================
  // STEP 1: Log the event
  // =========================================================================
  const event = logAttemptEvent({
    eventType: EVENT_TYPES.ANSWER_SUBMIT,
    mode: skillId.startsWith("grammar:") ? "grammar" : "vocab",
    skillId,
    subskillId,
    itemId,
    correct,
    latencyMs,
    hintUsed,
    revealed,
    userAnswer,
    expectedAnswer,
    metadata,
  });

  // =========================================================================
  // STEP 2: Invalidate cache (already done by callback, but be explicit)
  // =========================================================================
  invalidateStateCache();

  // =========================================================================
  // STEP 3: Recompute user state with fresh data
  // =========================================================================
  const userState = buildUserState({ studentId });

  // =========================================================================
  // STEP 4: Get recommendation from fresh state
  // =========================================================================
  const context = buildSessionContext(studentId);
  const coaching = getCoachingRecommendation(userState, context);
  const recommendation = coaching.recommended || null;

  // =========================================================================
  // STEP 5: Check for coach intervention
  // =========================================================================
  const coachIntervention = getCoachIntervention(studentId, {
    lastEvent: event,
    skillId,
    subskillId,
  });

  const showCoach = coachIntervention && shouldShowCoach(coachIntervention);

  // =========================================================================
  // STEP 6: Detect patterns for "why"
  // =========================================================================
  const patterns = detectPatterns(studentId, skillId);
  const misconceptions = detectMisconceptions(studentId, skillId);

  // =========================================================================
  // STEP 7: Generate human-readable "why"
  // =========================================================================
  const why = generateWhy({
    skillId,
    subskillId,
    userState,
    patterns,
    correct,
    recommendation,
  });

  return {
    event,
    userState,
    recommendation,
    coachIntervention: showCoach ? coachIntervention : null,
    patterns,
    misconceptions,
    why,
  };
}

// ============================================================================
// WHY GENERATOR
// ============================================================================

/**
 * Generate a concise, human-readable explanation of current state.
 * This is the "why" that appears on skill cards and recommendations.
 */
function generateWhy({ skillId, subskillId, userState, patterns, correct, recommendation }) {
  const key = `${skillId}:${subskillId}`;
  const skill = userState.skills[key];

  if (!skill || skill.exposures < 3) {
    return "Just getting started — keep practicing to build a clear picture.";
  }

  // Priority order: patterns first, then confidence-based
  if (patterns.momentum) {
    return `On a roll with ${skill.currentStreak} correct! Keep the momentum going.`;
  }

  if (patterns.hintDependency) {
    return "Building independence — try answering without hints.";
  }

  if (patterns.guessing) {
    return "Slow down and think through each answer carefully.";
  }

  if (patterns.stagnating) {
    return "Stuck at the same level — try a different approach or review basics.";
  }

  if (patterns.fatigued) {
    return "Accuracy dropping — consider taking a break.";
  }

  // Confidence-based explanations
  const { confidence, level, recentAccuracy } = skill;

  if (level === "mastered") {
    return "Solid mastery — occasional review will keep it fresh.";
  }

  if (level === "proficient") {
    if (recentAccuracy > 0.8) {
      return "Almost mastered! A few more correct answers will lock it in.";
    }
    return "Good foundation — focus on consistency to reach mastery.";
  }

  if (level === "learning") {
    if (recentAccuracy > 0.6) {
      return "Making progress — keep practicing to strengthen retention.";
    }
    return "Building understanding — targeted practice will help solidify this.";
  }

  // Novice level
  if (recentAccuracy < 0.4) {
    return "Struggling with this skill — consider reviewing the basics first.";
  }

  return "Keep practicing to build confidence and consistency.";
}

// ============================================================================
// SKILL WHY GENERATOR (for mastery cards)
// ============================================================================

/**
 * Generate a brief "why" explanation for a skill card.
 * Used on the Mastery page to explain each skill's current state.
 *
 * @param {Object} skill - SkillMastery object
 * @param {Object} [patterns] - Detected patterns for this skill
 * @returns {string} One-line explanation
 */
export function getSkillWhy(skill, patterns = {}) {
  if (!skill) {
    return "Not started yet.";
  }

  const { confidence, level, exposures, recentAccuracy, currentStreak, uniqueItems } = skill;

  // Check patterns first
  if (patterns.momentum) {
    return `${currentStreak} correct in a row!`;
  }

  if (patterns.hintDependency) {
    return "Try without hints to strengthen recall.";
  }

  if (patterns.stagnating) {
    return "Stuck — mix up your practice approach.";
  }

  if (patterns.fatigued) {
    return "Performance dipping — take a break?";
  }

  // Exposure-based
  if (exposures < 5) {
    return "Just starting — need more practice for accurate assessment.";
  }

  // Level + accuracy based
  if (level === "mastered") {
    return "Strong performance maintained over time.";
  }

  if (level === "proficient") {
    const toMastery = 85 - confidence;
    return `${toMastery}% away from mastery.`;
  }

  if (level === "learning") {
    if (recentAccuracy >= 0.7) {
      return "Improving steadily — keep it up!";
    }
    return "Building foundation — more practice needed.";
  }

  // Novice
  if (recentAccuracy < 0.3) {
    return "Consider reviewing lesson material first.";
  }

  if (uniqueItems < 5) {
    return "Try more variety to build broader understanding.";
  }

  return "Keep practicing to build confidence.";
}

// ============================================================================
// RECOMMENDATION WHY GENERATOR
// ============================================================================

/**
 * Generate explanation for why a specific action is recommended.
 *
 * @param {Object} recommendation - The recommended action
 * @param {Object} userState - Current user state
 * @param {Object} patterns - Detected patterns
 * @returns {string} Explanation
 */
export function getRecommendationWhy(recommendation, userState, patterns = {}) {
  if (!recommendation) {
    return "Start practicing any skill to get personalized recommendations.";
  }

  const { type, skillId, subskillId, expectedGain } = recommendation;
  const key = skillId && subskillId ? `${skillId}:${subskillId}` : null;
  const skill = key ? userState.skills[key] : null;

  const config = ACTION_CONFIG[type];

  // Pattern-driven explanations
  if (patterns.hintDependency && type === "no_hints_challenge") {
    return "You've been using hints often — this will build independent recall.";
  }

  if (patterns.stagnating && type === "switch_subskill") {
    return "Progress has stalled — trying a different angle may help.";
  }

  if (patterns.momentum && type === "momentum_set") {
    return "You're on a roll — capitalize on this momentum!";
  }

  if (patterns.fatigued && type === "slow_down_set") {
    return "Accuracy is dropping — smaller sets will help maintain quality.";
  }

  // Skill-state explanations
  if (skill) {
    if (skill.level === "novice" && type === "targeted_drill") {
      return `Building foundation in this skill (${skill.confidence}% confidence).`;
    }

    if (skill.level === "learning" && type === "consolidation_set") {
      return "Solidifying what you've learned before moving on.";
    }

    if (skill.level === "proficient" && type === "targeted_drill") {
      return `Push to mastery — just ${85 - skill.confidence}% more needed.`;
    }
  }

  // Expected gain explanation
  if (expectedGain > 5) {
    return `High-impact practice — expect ~${expectedGain}% confidence gain.`;
  }

  // Fallback to config description
  return config?.description || "Recommended based on your learning history.";
}

// ============================================================================
// QUICK STATE CHECK (for UI without logging)
// ============================================================================

/**
 * Get current state and recommendation without logging an event.
 * Use this for initial page loads or refreshing the UI.
 *
 * @returns {Object} { userState, recommendation, patterns, why }
 */
export function getCurrentLoop() {
  const studentId = getCurrentStudentId();
  const userState = getUserState({ studentId });
  const context = buildSessionContext(studentId);
  const coaching = getCoachingRecommendation(userState, context);
  const recommendation = coaching.recommended || null;
  const patterns = coaching.patterns || {};

  return {
    userState,
    recommendation,
    patterns,
    alternatives: coaching.alternatives,
    misconceptions: coaching.misconceptions,
  };
}

// ============================================================================
// BATCH REFRESH (for when data might be stale)
// ============================================================================

/**
 * Force a complete refresh of all state from events.
 * Use this when you suspect stale data or after significant changes.
 *
 * @returns {Object} Fresh loop state
 */
export function forceRefreshLoop() {
  invalidateStateCache();
  return getCurrentLoop();
}

export default {
  processAttempt,
  getCurrentLoop,
  forceRefreshLoop,
  getSkillWhy,
  getRecommendationWhy,
};
