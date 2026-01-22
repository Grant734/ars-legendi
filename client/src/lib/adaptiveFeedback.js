// client/src/lib/adaptiveFeedback.js
// Phase 5: Adaptive Feedback Engine
// Generates recommendations from mastery model + pattern detection

import { loadLocalEvents, EVENT_TYPES, SUBSKILLS } from "./attemptEvents";
import { getReviewQueue, getSkillMastery } from "./userState";

// ============================================================================
// ACTION VOCABULARY
// ============================================================================

/**
 * All possible actions the engine can recommend.
 * Each action has a type, description, and parameters.
 */
export const ACTIONS = {
  // Core practice actions
  TARGETED_DRILL: "targeted_drill",
  REVIEW_MISSES: "review_misses",
  COVERAGE_PUSH: "coverage_push",
  SPACED_REVIEW: "spaced_review",

  // Subskill transitions
  SWITCH_SUBSKILL: "switch_subskill",
  SUBSKILL_REPAIR: "subskill_repair",

  // Adaptive adjustments
  SLOW_DOWN_SET: "slow_down_set",
  NO_HINTS_CHALLENGE: "no_hints_challenge",
  MICRO_DRILL: "micro_drill",

  // Momentum actions
  MOMENTUM_SET: "momentum_set",
  CONSOLIDATION_SET: "consolidation_set",
};

/**
 * Action metadata and display configuration.
 */
export const ACTION_CONFIG = {
  [ACTIONS.TARGETED_DRILL]: {
    name: "Targeted Drill",
    description: "Focus practice on a specific skill",
    defaultSetSize: 6,
    icon: "target",
  },
  [ACTIONS.REVIEW_MISSES]: {
    name: "Review Missed Items",
    description: "Retry items you got wrong recently",
    defaultSetSize: 4,
    icon: "refresh",
  },
  [ACTIONS.COVERAGE_PUSH]: {
    name: "Explore New Material",
    description: "Practice items you haven't seen yet",
    defaultSetSize: 8,
    icon: "compass",
  },
  [ACTIONS.SPACED_REVIEW]: {
    name: "Spaced Review",
    description: "Review items flagged for reinforcement",
    defaultSetSize: 6,
    icon: "clock",
  },
  [ACTIONS.SWITCH_SUBSKILL]: {
    name: "Try a Different Approach",
    description: "Switch from identifying to translating (or vice versa)",
    defaultSetSize: 6,
    icon: "shuffle",
  },
  [ACTIONS.SUBSKILL_REPAIR]: {
    name: "Strengthen Weak Subskill",
    description: "Your identification is strong, but translation needs work",
    defaultSetSize: 5,
    icon: "tool",
  },
  [ACTIONS.SLOW_DOWN_SET]: {
    name: "Take It Slow",
    description: "Shorter set with more time - focus on accuracy",
    defaultSetSize: 4,
    icon: "pause",
  },
  [ACTIONS.NO_HINTS_CHALLENGE]: {
    name: "No Hints Challenge",
    description: "Practice without hints to build independence",
    defaultSetSize: 5,
    icon: "eye-off",
  },
  [ACTIONS.MICRO_DRILL]: {
    name: "Quick Micro-Drill",
    description: "Ultra-short set to fix specific errors",
    defaultSetSize: 3,
    icon: "zap",
  },
  [ACTIONS.MOMENTUM_SET]: {
    name: "Keep the Momentum",
    description: "You're on a roll - capitalize with a longer set",
    defaultSetSize: 10,
    icon: "trending-up",
  },
  [ACTIONS.CONSOLIDATION_SET]: {
    name: "Consolidate Gains",
    description: "Lock in what you've learned with mixed review",
    defaultSetSize: 8,
    icon: "lock",
  },
};

// ============================================================================
// SESSION CONTEXT
// ============================================================================

/**
 * @typedef {Object} SessionContext
 * @property {string} currentSkillId - Skill being practiced
 * @property {string} currentSubskillId - Subskill being practiced
 * @property {number} sessionStartTime - When session started
 * @property {number} attemptsThisSession - Attempts in current session
 * @property {number} correctThisSession - Correct in current session
 * @property {string[]} recentlyDrilledSkills - Skills practiced in last hour
 * @property {boolean} justFinishedSet - Did they just complete a set?
 */

/**
 * Build session context from recent events.
 */
export function buildSessionContext(studentId, options = {}) {
  const { currentSkillId, currentSubskillId, sessionStartTime } = options;

  const events = loadLocalEvents().filter((e) => e.studentId === studentId);
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const sessionStart = sessionStartTime || hourAgo;

  // Events this session
  const sessionEvents = events.filter((e) => e.timestamp >= sessionStart);
  const answerEvents = sessionEvents.filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT);

  // Recently drilled skills (last hour)
  const recentEvents = events.filter((e) => e.timestamp >= hourAgo);
  const recentlyDrilledSkills = [...new Set(recentEvents.map((e) => e.skillId))];

  return {
    currentSkillId: currentSkillId || null,
    currentSubskillId: currentSubskillId || null,
    sessionStartTime: sessionStart,
    attemptsThisSession: answerEvents.length,
    correctThisSession: answerEvents.filter((e) => e.correct).length,
    recentlyDrilledSkills,
    justFinishedSet: answerEvents.length > 0 && answerEvents.length % 6 === 0,
  };
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * @typedef {Object} PatternSignals
 * @property {boolean} highLatency - Slow responses (struggling)
 * @property {boolean} hintDependency - Too many hints/reveals
 * @property {boolean} guessing - Fast incorrect answers
 * @property {boolean} inconsistent - Correct then wrong on same items
 * @property {boolean} stagnating - Flat trend despite practice
 * @property {boolean} momentum - Improving and on a streak
 * @property {boolean} fatigued - Declining accuracy over session
 */

/**
 * Detect behavioral patterns from recent events.
 */
export function detectPatterns(studentId, skillId, options = {}) {
  const { windowSize = 20, sessionStartTime } = options;

  const events = loadLocalEvents()
    .filter((e) => e.studentId === studentId)
    .filter((e) => !skillId || e.skillId === skillId)
    .filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, windowSize);

  if (events.length < 5) {
    return {
      highLatency: false,
      hintDependency: false,
      guessing: false,
      inconsistent: false,
      stagnating: false,
      momentum: false,
      fatigued: false,
    };
  }

  // High latency: average response time > 15 seconds
  const withLatency = events.filter((e) => e.latencyMs != null);
  const avgLatency = withLatency.length
    ? withLatency.reduce((sum, e) => sum + e.latencyMs, 0) / withLatency.length
    : 0;
  const highLatency = avgLatency > 15000;

  // Hint dependency: > 30% of attempts used hints or reveals
  const hintCount = events.filter((e) => e.hintUsed || e.revealed).length;
  const hintDependency = hintCount / events.length > 0.3;

  // Guessing: fast incorrect answers (< 3 seconds)
  const fastIncorrect = events.filter(
    (e) => !e.correct && e.latencyMs != null && e.latencyMs < 3000
  );
  const guessing = fastIncorrect.length / events.length > 0.2;

  // Inconsistent: same item correct then wrong (or vice versa)
  const byItem = {};
  for (const e of events) {
    if (!byItem[e.itemId]) byItem[e.itemId] = [];
    byItem[e.itemId].push(e.correct);
  }
  const inconsistentItems = Object.values(byItem).filter((results) => {
    if (results.length < 2) return false;
    // Check for correct→wrong pattern
    for (let i = 0; i < results.length - 1; i++) {
      if (results[i] !== results[i + 1]) return true;
    }
    return false;
  });
  const inconsistent = inconsistentItems.length > 2;

  // Stagnating: recent accuracy flat despite practice
  const firstHalf = events.slice(Math.floor(events.length / 2));
  const secondHalf = events.slice(0, Math.floor(events.length / 2));
  const firstAcc = firstHalf.filter((e) => e.correct).length / firstHalf.length;
  const secondAcc = secondHalf.filter((e) => e.correct).length / secondHalf.length;
  const stagnating = Math.abs(secondAcc - firstAcc) < 0.05 && events.length >= 10;

  // Momentum: improving accuracy + current streak
  const momentum = secondAcc - firstAcc > 0.15 && events.slice(0, 3).every((e) => e.correct);

  // Fatigued: declining accuracy over session
  const fatigued = sessionStartTime && firstAcc - secondAcc > 0.2;

  return {
    highLatency,
    hintDependency,
    guessing,
    inconsistent,
    stagnating,
    momentum,
    fatigued,
  };
}

// ============================================================================
// MISCONCEPTION DETECTION
// ============================================================================

/**
 * @typedef {Object} Misconception
 * @property {string} skillId
 * @property {string} subskillId
 * @property {string} misconceptionId
 * @property {string} description
 * @property {number} count - How many times observed
 * @property {number} lastSeen - Timestamp
 * @property {number} confidence - How reliable (0-1)
 * @property {string[]} evidence - Example item IDs
 */

// Common misconception types
export const MISCONCEPTION_TYPES = {
  BOUNDARY_CONFUSION: "boundary_confusion",      // Wrong span boundaries
  TYPE_CONFUSION: "type_confusion",              // Mixing similar constructions
  SUBTYPE_CONFUSION: "subtype_confusion",        // Wrong subtype classification
  FORM_CONFUSION: "form_confusion",              // Confusing grammatical forms
  CONSISTENT_DISTRACTOR: "consistent_distractor", // Always picking same wrong answer
  PARTIAL_KNOWLEDGE: "partial_knowledge",        // Right identification, wrong details
};

/**
 * Detect misconceptions from error patterns.
 */
export function detectMisconceptions(studentId, skillId) {
  const events = loadLocalEvents()
    .filter((e) => e.studentId === studentId)
    .filter((e) => !skillId || e.skillId === skillId)
    .filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT && !e.correct)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50); // Look at last 50 errors

  const misconceptions = [];

  // Group errors by skill:subskill
  const bySkillSubskill = {};
  for (const e of events) {
    const key = `${e.skillId}:${e.subskillId}`;
    if (!bySkillSubskill[key]) bySkillSubskill[key] = [];
    bySkillSubskill[key].push(e);
  }

  for (const [key, errors] of Object.entries(bySkillSubskill)) {
    const [skillId, subskillId] = key.split(":");

    // Boundary confusion: wrong span metadata
    const boundaryErrors = errors.filter(
      (e) => e.metadata?.reason === "wrong_span"
    );
    if (boundaryErrors.length >= 3) {
      misconceptions.push({
        skillId,
        subskillId,
        misconceptionId: MISCONCEPTION_TYPES.BOUNDARY_CONFUSION,
        description: "Difficulty identifying construction boundaries",
        count: boundaryErrors.length,
        lastSeen: boundaryErrors[0].timestamp,
        confidence: Math.min(0.9, boundaryErrors.length / 10),
        evidence: boundaryErrors.slice(0, 3).map((e) => e.itemId),
      });
    }

    // Type confusion: wrong type metadata
    const typeErrors = errors.filter(
      (e) => e.metadata?.reason === "wrong_type"
    );
    if (typeErrors.length >= 3) {
      // Find which types are being confused
      const confusedTypes = {};
      for (const e of typeErrors) {
        const chosen = e.userAnswer || e.metadata?.chosenType;
        if (chosen) {
          confusedTypes[chosen] = (confusedTypes[chosen] || 0) + 1;
        }
      }
      const topConfused = Object.entries(confusedTypes)
        .sort((a, b) => b[1] - a[1])[0];

      misconceptions.push({
        skillId,
        subskillId,
        misconceptionId: MISCONCEPTION_TYPES.TYPE_CONFUSION,
        description: topConfused
          ? `Often confuses with ${topConfused[0]}`
          : "Difficulty distinguishing construction types",
        count: typeErrors.length,
        lastSeen: typeErrors[0].timestamp,
        confidence: Math.min(0.9, typeErrors.length / 10),
        evidence: typeErrors.slice(0, 3).map((e) => e.itemId),
      });
    }

    // Subtype confusion
    const subtypeErrors = errors.filter(
      (e) => e.metadata?.reason === "wrong_subtype"
    );
    if (subtypeErrors.length >= 2) {
      misconceptions.push({
        skillId,
        subskillId,
        misconceptionId: MISCONCEPTION_TYPES.SUBTYPE_CONFUSION,
        description: "Difficulty with subtype classification",
        count: subtypeErrors.length,
        lastSeen: subtypeErrors[0].timestamp,
        confidence: Math.min(0.8, subtypeErrors.length / 8),
        evidence: subtypeErrors.slice(0, 3).map((e) => e.itemId),
      });
    }

    // Consistent distractor: same wrong answer repeated
    if (errors.length >= 5) {
      const wrongAnswers = {};
      for (const e of errors) {
        const wrong = e.userAnswer || e.distractorChosen;
        if (wrong) {
          wrongAnswers[wrong] = (wrongAnswers[wrong] || 0) + 1;
        }
      }
      const topWrong = Object.entries(wrongAnswers)
        .sort((a, b) => b[1] - a[1])[0];

      if (topWrong && topWrong[1] >= 3) {
        misconceptions.push({
          skillId,
          subskillId,
          misconceptionId: MISCONCEPTION_TYPES.CONSISTENT_DISTRACTOR,
          description: `Consistently choosing "${topWrong[0]}" incorrectly`,
          count: topWrong[1],
          lastSeen: errors[0].timestamp,
          confidence: Math.min(0.85, topWrong[1] / errors.length),
          evidence: errors.filter((e) => (e.userAnswer || e.distractorChosen) === topWrong[0])
            .slice(0, 3).map((e) => e.itemId),
        });
      }
    }
  }

  return misconceptions;
}

// ============================================================================
// EXPECTED MASTERY GAIN HEURISTICS
// ============================================================================

/**
 * Estimate expected mastery gain per minute for different actions.
 * Higher values = more efficient learning expected.
 */
function estimateMasteryGain(action, userState, patterns, context) {
  const { skillId, subskillId } = action;
  const skill = skillId && subskillId
    ? getSkillMastery(userState, skillId, subskillId)
    : null;

  // Base gain by action type
  const baseGains = {
    [ACTIONS.TARGETED_DRILL]: 1.0,
    [ACTIONS.REVIEW_MISSES]: 1.2,      // High efficiency for fixing errors
    [ACTIONS.COVERAGE_PUSH]: 0.8,      // Lower gain per item but builds breadth
    [ACTIONS.SPACED_REVIEW]: 1.1,      // Good for retention
    [ACTIONS.SWITCH_SUBSKILL]: 0.9,    // Moderate - learning new approach
    [ACTIONS.SUBSKILL_REPAIR]: 1.3,    // High - targeted weakness
    [ACTIONS.SLOW_DOWN_SET]: 0.6,      // Lower throughput, higher quality
    [ACTIONS.NO_HINTS_CHALLENGE]: 1.1, // Builds independence
    [ACTIONS.MICRO_DRILL]: 1.4,        // Very focused, high gain
    [ACTIONS.MOMENTUM_SET]: 1.2,       // Capitalize on flow state
    [ACTIONS.CONSOLIDATION_SET]: 0.9,  // Maintenance mode
  };

  let gain = baseGains[action.type] || 1.0;

  // Adjust based on patterns
  if (patterns.momentum) {
    gain *= 1.2; // Learning is sticking, capitalize
  }
  if (patterns.fatigued) {
    gain *= 0.6; // Diminishing returns
  }
  if (patterns.stagnating) {
    gain *= 0.7; // Need to change approach
  }
  if (patterns.hintDependency && action.type === ACTIONS.NO_HINTS_CHALLENGE) {
    gain *= 1.3; // Good match for the problem
  }

  // Adjust based on confidence level
  if (skill) {
    if (skill.confidence < 30) {
      // Very low confidence - gentle approach helps more
      if (action.type === ACTIONS.SLOW_DOWN_SET) gain *= 1.2;
      if (action.type === ACTIONS.MOMENTUM_SET) gain *= 0.7;
    } else if (skill.confidence > 70) {
      // High confidence - push harder
      if (action.type === ACTIONS.MOMENTUM_SET) gain *= 1.1;
      if (action.type === ACTIONS.SLOW_DOWN_SET) gain *= 0.8;
    }
  }

  return gain;
}

/**
 * Determine optimal set size based on state and patterns.
 */
function determineSetSize(action, patterns, confidence) {
  const config = ACTION_CONFIG[action.type];
  let size = config?.defaultSetSize || 6;

  // Adjust for patterns
  if (patterns.highLatency || patterns.fatigued) {
    size = Math.max(3, size - 2); // Reduce fatigue
  }
  if (patterns.momentum) {
    size = Math.min(12, size + 2); // Capitalize
  }
  if (patterns.guessing) {
    size = Math.max(3, size - 1); // Slow down
  }

  // Adjust for confidence
  if (confidence !== undefined) {
    if (confidence < 30) {
      size = Math.min(size, 5); // Don't overwhelm
    } else if (confidence > 80) {
      size = Math.max(size, 6); // Can handle more
    }
  }

  return size;
}

// ============================================================================
// MAIN RECOMMENDATION ENGINE
// ============================================================================

/**
 * @typedef {Object} ActionRecommendation
 * @property {string} type - Action type from ACTIONS
 * @property {string} skillId - Target skill
 * @property {string} subskillId - Target subskill
 * @property {number} setSize - Recommended set size
 * @property {string} reason - Human-readable explanation
 * @property {number} priority - Score (higher = more recommended)
 * @property {number} expectedGain - Estimated mastery gain
 * @property {Object} metadata - Additional context
 */

/**
 * Choose the next best action based on user state and session context.
 *
 * @param {Object} userState - From buildUserState()
 * @param {SessionContext} context - Current session context
 * @returns {ActionRecommendation[]} - Ranked list of recommendations
 */
export function chooseNextBestAction(userState, context = {}) {
  const { studentId, skills, items, weakPatterns, summary } = userState;
  const {
    currentSkillId,
    currentSubskillId,
    recentlyDrilledSkills = [],
    justFinishedSet,
    attemptsThisSession = 0,
  } = context;

  // Detect patterns for current skill
  const patterns = detectPatterns(
    studentId,
    currentSkillId,
    { sessionStartTime: context.sessionStartTime }
  );

  // Get review queue
  const reviewQueue = getReviewQueue(userState, { limit: 20 });

  // Collect all candidate actions
  const candidates = [];

  // -------------------------------------------------------------------------
  // Priority 1: Handle detected patterns (immediate interventions)
  // -------------------------------------------------------------------------

  if (patterns.fatigued && attemptsThisSession > 15) {
    candidates.push({
      type: ACTIONS.SLOW_DOWN_SET,
      skillId: currentSkillId,
      subskillId: currentSubskillId,
      reason: "You seem tired. A shorter, focused set will help.",
      priority: 95,
      metadata: { trigger: "fatigue" },
    });
  }

  if (patterns.hintDependency) {
    candidates.push({
      type: ACTIONS.NO_HINTS_CHALLENGE,
      skillId: currentSkillId,
      subskillId: currentSubskillId,
      reason: "Build independence with a no-hints challenge.",
      priority: 85,
      metadata: { trigger: "hint_dependency" },
    });
  }

  if (patterns.guessing) {
    candidates.push({
      type: ACTIONS.SLOW_DOWN_SET,
      skillId: currentSkillId,
      subskillId: currentSubskillId,
      reason: "Take your time - accuracy matters more than speed.",
      priority: 90,
      metadata: { trigger: "guessing" },
    });
  }

  if (patterns.momentum && justFinishedSet) {
    candidates.push({
      type: ACTIONS.MOMENTUM_SET,
      skillId: currentSkillId,
      subskillId: currentSubskillId,
      reason: "You're on a roll! Keep the momentum going.",
      priority: 80,
      metadata: { trigger: "momentum" },
    });
  }

  if (patterns.stagnating && currentSkillId) {
    // Suggest switching subskill
    const alternateSubskill = currentSubskillId === SUBSKILLS.IDENTIFY
      ? SUBSKILLS.TRANSLATE
      : SUBSKILLS.IDENTIFY;

    candidates.push({
      type: ACTIONS.SWITCH_SUBSKILL,
      skillId: currentSkillId,
      subskillId: alternateSubskill,
      reason: "Progress has plateaued. Try a different approach.",
      priority: 75,
      metadata: { trigger: "stagnating", from: currentSubskillId, to: alternateSubskill },
    });
  }

  // -------------------------------------------------------------------------
  // Priority 2: Review misses (error correction)
  // -------------------------------------------------------------------------

  if (reviewQueue.length >= 3) {
    const reviewSkill = reviewQueue[0].skillId;
    const reviewSubskill = reviewQueue[0].subskillId;

    candidates.push({
      type: ACTIONS.REVIEW_MISSES,
      skillId: reviewSkill,
      subskillId: reviewSubskill,
      reason: `${reviewQueue.length} items need review.`,
      priority: 70 + Math.min(reviewQueue.length, 10),
      metadata: { reviewCount: reviewQueue.length, items: reviewQueue.map((r) => r.itemId) },
    });
  }

  // -------------------------------------------------------------------------
  // Priority 3: Weak patterns (systematic issues)
  // -------------------------------------------------------------------------

  for (const weak of weakPatterns.slice(0, 3)) {
    const isRecent = recentlyDrilledSkills.includes(weak.skillId);

    // Check for subskill imbalance
    const identifySkill = getSkillMastery(userState, weak.skillId, SUBSKILLS.IDENTIFY);
    const translateSkill = getSkillMastery(userState, weak.skillId, SUBSKILLS.TRANSLATE);

    if (identifySkill && translateSkill) {
      const imbalance = Math.abs(identifySkill.confidence - translateSkill.confidence);
      if (imbalance > 20) {
        const weakerSubskill = identifySkill.confidence < translateSkill.confidence
          ? SUBSKILLS.IDENTIFY
          : SUBSKILLS.TRANSLATE;

        candidates.push({
          type: ACTIONS.SUBSKILL_REPAIR,
          skillId: weak.skillId,
          subskillId: weakerSubskill,
          reason: `Your ${weakerSubskill} is weaker than other subskills.`,
          priority: 65 - (isRecent ? 10 : 0),
          metadata: { imbalance, stronger: identifySkill.confidence > translateSkill.confidence ? SUBSKILLS.IDENTIFY : SUBSKILLS.TRANSLATE },
        });
      }
    }

    candidates.push({
      type: ACTIONS.TARGETED_DRILL,
      skillId: weak.skillId,
      subskillId: weak.subskillId,
      reason: `${Math.round(weak.accuracy * 100)}% accuracy - needs focused practice.`,
      priority: 60 - (isRecent ? 15 : 0),
      metadata: { accuracy: weak.accuracy, attempts: weak.attempts },
    });
  }

  // -------------------------------------------------------------------------
  // Priority 4: Coverage push (low exposure)
  // -------------------------------------------------------------------------

  const lowExposure = Object.values(skills)
    .filter((s) => s.exposures > 0 && s.exposures < 10)
    .sort((a, b) => a.exposures - b.exposures);

  for (const skill of lowExposure.slice(0, 2)) {
    const isRecent = recentlyDrilledSkills.includes(skill.skillId);

    candidates.push({
      type: ACTIONS.COVERAGE_PUSH,
      skillId: skill.skillId,
      subskillId: skill.subskillId,
      reason: `Only ${skill.uniqueItems} unique items seen. Explore more variety.`,
      priority: 45 - (isRecent ? 10 : 0),
      metadata: { exposure: skill.exposures, uniqueItems: skill.uniqueItems },
    });
  }

  // -------------------------------------------------------------------------
  // Priority 5: Consolidation (for high-confidence skills)
  // -------------------------------------------------------------------------

  const nearMastery = Object.values(skills)
    .filter((s) => s.level === "proficient" && s.confidence >= 70)
    .sort((a, b) => b.confidence - a.confidence);

  for (const skill of nearMastery.slice(0, 2)) {
    const isRecent = recentlyDrilledSkills.includes(skill.skillId);

    candidates.push({
      type: ACTIONS.CONSOLIDATION_SET,
      skillId: skill.skillId,
      subskillId: skill.subskillId,
      reason: `${skill.confidence}% confident - push to mastery!`,
      priority: 40 - (isRecent ? 10 : 0),
      metadata: { confidence: skill.confidence, level: skill.level },
    });
  }

  // -------------------------------------------------------------------------
  // Priority 6: Spaced review (maintenance)
  // -------------------------------------------------------------------------

  const masteredItems = Object.values(items).filter((i) => i.mastered);
  const staleItems = masteredItems.filter((i) => {
    const daysSince = (Date.now() - i.lastSeen) / (24 * 60 * 60 * 1000);
    return daysSince > 3;
  });

  if (staleItems.length >= 5) {
    const staleSkill = staleItems[0].skillId;
    candidates.push({
      type: ACTIONS.SPACED_REVIEW,
      skillId: staleSkill,
      subskillId: staleItems[0].subskillId,
      reason: `${staleItems.length} mastered items haven't been reviewed recently.`,
      priority: 35,
      metadata: { staleCount: staleItems.length },
    });
  }

  // -------------------------------------------------------------------------
  // Score and finalize candidates
  // -------------------------------------------------------------------------

  const scored = candidates.map((c) => {
    const skill = c.skillId && c.subskillId
      ? getSkillMastery(userState, c.skillId, c.subskillId)
      : null;

    const setSize = determineSetSize(c, patterns, skill?.confidence);
    const expectedGain = estimateMasteryGain(c, userState, patterns, context);

    return {
      ...c,
      setSize,
      expectedGain,
      priority: c.priority * expectedGain, // Weight by expected gain
    };
  });

  // Sort by final priority
  scored.sort((a, b) => b.priority - a.priority);

  return scored;
}

/**
 * Get the single best next action.
 */
export function getBestNextAction(userState, context = {}) {
  const actions = chooseNextBestAction(userState, context);
  return actions[0] || null;
}

// ============================================================================
// COACH API (for UI integration)
// ============================================================================

/**
 * Get a complete coaching recommendation.
 */
export function getCoachingRecommendation(userState, context = {}) {
  const actions = chooseNextBestAction(userState, context);
  const patterns = detectPatterns(
    userState.studentId,
    context.currentSkillId,
    { sessionStartTime: context.sessionStartTime }
  );
  const misconceptions = detectMisconceptions(
    userState.studentId,
    context.currentSkillId
  );

  const bestAction = actions[0];
  const alternativeActions = actions.slice(1, 4);

  return {
    recommended: bestAction,
    alternatives: alternativeActions,
    patterns,
    misconceptions,
    sessionSummary: {
      attempts: context.attemptsThisSession || 0,
      correct: context.correctThisSession || 0,
      accuracy: context.attemptsThisSession
        ? (context.correctThisSession || 0) / context.attemptsThisSession
        : 0,
    },
  };
}

/**
 * Format a recommendation for display.
 * @param {ActionRecommendation} action - The action to format
 * @param {Object} context - Additional context for more specific feedback
 * @param {Object} context.patterns - Detected behavioral patterns
 * @param {Array} context.misconceptions - Detected misconceptions
 * @param {Array} context.recentErrors - Recent error events
 * @param {Array} context.otherWeakSkills - Other skills that need work
 */
export function formatRecommendation(action, context = {}) {
  if (!action) return null;

  const config = ACTION_CONFIG[action.type];
  const { patterns, misconceptions, recentErrors, otherWeakSkills } = context;

  let specificReason = action.reason || config?.description;

  // Make reason more specific based on context
  if (action.type === ACTIONS.REVIEW_MISSES && recentErrors?.length) {
    const errorTypes = [...new Set(recentErrors.map(e => e.metadata?.reason))].filter(Boolean);
    if (errorTypes.length) {
      specificReason = `Review ${recentErrors.length} items. Focus on: ${errorTypes.slice(0, 3).join(", ")}.`;
    }
  }

  // Add misconception-specific guidance
  if (misconceptions?.length && action.skillId) {
    const relevantMisconception = misconceptions.find(m => m.skillId === action.skillId);
    if (relevantMisconception) {
      specificReason += ` Watch out: ${relevantMisconception.description}.`;
    }
  }

  // Suggest other skills if doing well on current one
  if (patterns?.momentum && otherWeakSkills?.length) {
    const suggestion = otherWeakSkills[0];
    specificReason += ` Consider practicing ${suggestion.name || suggestion.skillId} next.`;
  }

  // Add pattern-specific tips
  if (patterns?.hintDependency && action.type === ACTIONS.NO_HINTS_CHALLENGE) {
    specificReason = "You've been relying on hints. Try this challenge to build independent recognition.";
  }
  if (patterns?.guessing && action.type === ACTIONS.SLOW_DOWN_SET) {
    specificReason = "Quick incorrect answers suggest guessing. Take more time to think through each one.";
  }

  return {
    title: config?.name || action.type,
    description: specificReason,
    icon: config?.icon || "activity",
    setSize: action.setSize,
    skillId: action.skillId,
    subskillId: action.subskillId,
    actionType: action.type,
    expectedGain: action.expectedGain,
  };
}
