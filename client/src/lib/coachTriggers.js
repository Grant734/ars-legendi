// client/src/lib/coachTriggers.js
// Phase 6: Coach trigger detection and reason generation
// Determines when to show coaching interventions and why

import { loadLocalEvents, EVENT_TYPES } from "./attemptEvents";
import { getUserState, getSkillMastery } from "./userState";
import { detectPatterns, detectMisconceptions, chooseNextBestAction, ACTIONS, ACTION_CONFIG } from "./adaptiveFeedback";

// ============================================================================
// TRIGGER TYPES
// ============================================================================

export const TRIGGER_TYPES = {
  // Immediate triggers (after specific events)
  REPEATED_ERROR: "repeated_error",
  CONFIDENCE_DROP: "confidence_drop",
  REVEAL_USED: "reveal_used",

  // Pattern triggers (after 3-5 attempts)
  HINT_DEPENDENCY: "hint_dependency",
  GUESSING_DETECTED: "guessing_detected",
  STAGNATING: "stagnating",
  MISCONCEPTION: "misconception",

  // Session boundary triggers
  SET_COMPLETE: "set_complete",
  SESSION_END: "session_end",
  LEAVING_PAGE: "leaving_page",
  MILESTONE: "milestone",

  // Positive triggers
  MOMENTUM: "momentum",
  MASTERY_ACHIEVED: "mastery_achieved",
};

// ============================================================================
// REASON TEMPLATES
// ============================================================================

/**
 * Fixed set of reason templates that reference model signals.
 * Each reason is defensible and tied to data.
 */
export const REASON_TEMPLATES = {
  // Confidence-based
  LOW_CONFIDENCE: (skillName, confidence) =>
    `Low confidence in ${skillName} (${confidence}%)`,
  CONFIDENCE_NOT_IMPROVING: (skillName) =>
    `Confidence in ${skillName} isn't improving`,
  CONFIDENCE_DROPPED: (skillName, drop) =>
    `Confidence in ${skillName} dropped ${drop}%`,

  // Pattern-based
  FREQUENT_CONFUSION: (tag) =>
    `Frequent confusion: ${tag}`,
  HIGH_HINT_USE: (pct) =>
    `High hint usage (${pct}% of attempts)`,
  FAST_INCORRECT: () =>
    `Quick incorrect answers suggest guessing`,
  INCONSISTENT_RESULTS: () =>
    `Getting items right then wrong - needs consolidation`,

  // Coverage-based
  COVERAGE_INCOMPLETE: (seen, total) =>
    `Coverage incomplete (${seen}/${total} items seen)`,
  LOW_EXPOSURE: (uniqueItems) =>
    `Only ${uniqueItems} unique items practiced`,

  // Error-based
  REPEATED_ERRORS: (count) =>
    `${count} errors in a row on this skill`,
  SAME_MISTAKE: (itemId) =>
    `Repeated mistake on "${itemId}"`,

  // Positive
  ON_A_ROLL: (streak) =>
    `${streak} correct in a row!`,
  NEAR_MASTERY: (skillName, confidence) =>
    `Almost mastered ${skillName} (${confidence}%)`,
  MASTERY_ACHIEVED: (skillName) =>
    `Mastered ${skillName}!`,

  // Session
  SET_COMPLETE: (correct, total) =>
    `Set complete: ${correct}/${total} correct`,
  GOOD_SESSION: (accuracy) =>
    `Great session! ${accuracy}% accuracy`,
  NEEDS_BREAK: () =>
    `Accuracy declining - consider a break`,
};

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * Short, action-oriented messages from templates.
 */
export const MESSAGE_TEMPLATES = {
  [TRIGGER_TYPES.REPEATED_ERROR]: [
    "Let's try a different approach.",
    "This one's tricky. Here's a tip.",
    "Having trouble? Let's slow down.",
  ],
  [TRIGGER_TYPES.CONFIDENCE_DROP]: [
    "Your accuracy dropped. Let's review.",
    "Looks like this got harder. Need help?",
    "Let's reinforce what you know.",
  ],
  [TRIGGER_TYPES.REVEAL_USED]: [
    "No problem - learning takes practice.",
    "Now you've seen it. Try a similar one?",
  ],
  [TRIGGER_TYPES.HINT_DEPENDENCY]: [
    "Try the next set without hints.",
    "Let's build independence.",
    "Challenge: No hints this round!",
  ],
  [TRIGGER_TYPES.GUESSING_DETECTED]: [
    "Take your time - accuracy matters.",
    "Slow down and think it through.",
    "No rush. Read carefully.",
  ],
  [TRIGGER_TYPES.STAGNATING]: [
    "Try a different approach.",
    "Let's switch to a new skill.",
    "Same score for a while. Change it up?",
  ],
  [TRIGGER_TYPES.MISCONCEPTION]: [
    "I noticed a pattern in your errors.",
    "There's a common confusion here.",
    "Let's address this specific issue.",
  ],
  [TRIGGER_TYPES.SET_COMPLETE]: [
    "Set complete! What's next?",
    "Nice work finishing that set.",
    "Done! Ready for the next challenge?",
  ],
  [TRIGGER_TYPES.SESSION_END]: [
    "Great practice session!",
    "Good work today.",
    "Progress saved. See you next time!",
  ],
  [TRIGGER_TYPES.MOMENTUM]: [
    "You're on fire!",
    "Keep the momentum going!",
    "Great streak! Keep it up!",
  ],
  [TRIGGER_TYPES.MASTERY_ACHIEVED]: [
    "You've mastered this skill!",
    "Congratulations on mastering this!",
    "Skill mastered! What's next?",
  ],
  [TRIGGER_TYPES.MILESTONE]: [
    "Milestone reached!",
    "Great progress!",
  ],
};

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

/**
 * @typedef {Object} CoachTrigger
 * @property {string} type - One of TRIGGER_TYPES
 * @property {string} message - Short message to display
 * @property {string} reason - One-line reason referencing model signals
 * @property {Object} action - Recommended action
 * @property {number} priority - Higher = more important
 * @property {number} timestamp - When triggered
 * @property {Object} metadata - Additional context
 */

/**
 * Check for immediate triggers (after each attempt).
 */
export function checkImmediateTriggers(studentId, lastEvent, recentEvents) {
  const triggers = [];

  if (!lastEvent) return triggers;

  // Repeated error: 3+ errors in a row
  const lastN = recentEvents.slice(0, 5);
  const errorStreak = lastN.filter((e) => !e.correct).length;

  if (!lastEvent.correct && errorStreak >= 3) {
    triggers.push({
      type: TRIGGER_TYPES.REPEATED_ERROR,
      priority: 90,
      metadata: { errorCount: errorStreak, skillId: lastEvent.skillId },
    });
  }

  // Reveal used
  if (lastEvent.revealed) {
    triggers.push({
      type: TRIGGER_TYPES.REVEAL_USED,
      priority: 40,
      metadata: { itemId: lastEvent.itemId },
    });
  }

  return triggers;
}

/**
 * Check for pattern triggers (after 3-5 attempts).
 */
export function checkPatternTriggers(studentId, skillId, sessionEvents) {
  const triggers = [];

  if (sessionEvents.length < 3) return triggers;

  const patterns = detectPatterns(studentId, skillId, { windowSize: 10 });
  const misconceptions = detectMisconceptions(studentId, skillId);

  // Hint dependency
  if (patterns.hintDependency) {
    const hintEvents = sessionEvents.filter((e) => e.hintUsed || e.revealed);
    const pct = Math.round((hintEvents.length / sessionEvents.length) * 100);

    triggers.push({
      type: TRIGGER_TYPES.HINT_DEPENDENCY,
      priority: 70,
      metadata: { hintPercent: pct },
    });
  }

  // Guessing
  if (patterns.guessing) {
    triggers.push({
      type: TRIGGER_TYPES.GUESSING_DETECTED,
      priority: 75,
      metadata: {},
    });
  }

  // Stagnating
  if (patterns.stagnating && sessionEvents.length >= 10) {
    triggers.push({
      type: TRIGGER_TYPES.STAGNATING,
      priority: 65,
      metadata: {},
    });
  }

  // Misconception detected
  if (misconceptions.length > 0) {
    const topMisconception = misconceptions[0];
    if (topMisconception.confidence > 0.5) {
      triggers.push({
        type: TRIGGER_TYPES.MISCONCEPTION,
        priority: 80,
        metadata: { misconception: topMisconception },
      });
    }
  }

  // Momentum (positive)
  if (patterns.momentum) {
    const correctStreak = sessionEvents
      .slice(0, 10)
      .filter((e) => e.correct).length;

    triggers.push({
      type: TRIGGER_TYPES.MOMENTUM,
      priority: 50,
      metadata: { streak: correctStreak },
    });
  }

  return triggers;
}

/**
 * Check for session boundary triggers.
 */
export function checkSessionBoundaryTriggers(studentId, context) {
  const triggers = [];
  const {
    setComplete,
    sessionEnding,
    leavingPage,
    attemptsThisSession,
    correctThisSession,
  } = context;

  // Set complete
  if (setComplete && attemptsThisSession >= 4) {
    const accuracy = Math.round((correctThisSession / attemptsThisSession) * 100);

    triggers.push({
      type: TRIGGER_TYPES.SET_COMPLETE,
      priority: 60,
      metadata: {
        correct: correctThisSession,
        total: attemptsThisSession,
        accuracy,
      },
    });

    // Check for mastery
    const userState = getUserState({ studentId });
    const newlyMastered = Object.values(userState.items)
      .filter((item) => item.mastered && item.lastSeen > Date.now() - 60000);

    if (newlyMastered.length > 0) {
      triggers.push({
        type: TRIGGER_TYPES.MASTERY_ACHIEVED,
        priority: 85,
        metadata: { masteredItems: newlyMastered.map((i) => i.itemId) },
      });
    }
  }

  // Session ending
  if (sessionEnding) {
    const patterns = detectPatterns(studentId, null, { windowSize: 20 });

    if (patterns.fatigued) {
      triggers.push({
        type: TRIGGER_TYPES.SESSION_END,
        priority: 55,
        metadata: { reason: "fatigue", suggestion: "break" },
      });
    } else {
      triggers.push({
        type: TRIGGER_TYPES.SESSION_END,
        priority: 45,
        metadata: {},
      });
    }
  }

  // Leaving page
  if (leavingPage && attemptsThisSession > 0) {
    triggers.push({
      type: TRIGGER_TYPES.LEAVING_PAGE,
      priority: 30,
      metadata: {},
    });
  }

  return triggers;
}

/**
 * Check for confidence-based triggers.
 */
export function checkConfidenceTriggers(studentId, skillId, subskillId) {
  const triggers = [];

  const userState = getUserState({ studentId });
  const skill = skillId && subskillId
    ? getSkillMastery(userState, skillId, subskillId)
    : null;

  if (!skill) return triggers;

  // Low confidence (< 40%)
  if (skill.confidence < 40 && skill.exposures >= 5) {
    triggers.push({
      type: TRIGGER_TYPES.CONFIDENCE_DROP,
      priority: 70,
      metadata: { confidence: skill.confidence, skillId, subskillId },
    });
  }

  // Confidence plateau (not improving)
  // Check if recent accuracy matches overall accuracy (no trend)
  if (
    skill.exposures >= 10 &&
    Math.abs(skill.recentAccuracy - skill.overallAccuracy) < 0.05 &&
    skill.confidence < 70
  ) {
    triggers.push({
      type: TRIGGER_TYPES.STAGNATING,
      priority: 60,
      metadata: { confidence: skill.confidence, skillId, subskillId },
    });
  }

  return triggers;
}

// ============================================================================
// TRIGGER RESOLUTION
// ============================================================================

/**
 * Resolve a trigger into a full coach intervention.
 */
export function resolveTrigger(trigger, studentId, currentSkillId) {
  const userState = getUserState({ studentId });
  const actions = chooseNextBestAction(userState, {
    currentSkillId,
    currentSubskillId: trigger.metadata?.subskillId,
  });

  const bestAction = actions[0];

  // Get message from templates
  const templates = MESSAGE_TEMPLATES[trigger.type] || ["Let's work on this."];
  const message = templates[Math.floor(Math.random() * templates.length)];

  // Generate reason from model signals
  const reason = generateReason(trigger, userState, bestAction);

  return {
    type: trigger.type,
    message,
    reason,
    action: bestAction
      ? {
          type: bestAction.type,
          skillId: bestAction.skillId,
          subskillId: bestAction.subskillId,
          setSize: bestAction.setSize,
          label: ACTION_CONFIG[bestAction.type]?.name || bestAction.type,
        }
      : null,
    priority: trigger.priority,
    timestamp: Date.now(),
    metadata: trigger.metadata,
  };
}

/**
 * Generate a one-line reason from model signals.
 */
function generateReason(trigger, userState, action) {
  const { type, metadata } = trigger;

  switch (type) {
    case TRIGGER_TYPES.REPEATED_ERROR:
      return REASON_TEMPLATES.REPEATED_ERRORS(metadata.errorCount);

    case TRIGGER_TYPES.CONFIDENCE_DROP:
      const skillName = getSkillDisplayName(metadata.skillId);
      return REASON_TEMPLATES.LOW_CONFIDENCE(skillName, metadata.confidence);

    case TRIGGER_TYPES.HINT_DEPENDENCY:
      return REASON_TEMPLATES.HIGH_HINT_USE(metadata.hintPercent);

    case TRIGGER_TYPES.GUESSING_DETECTED:
      return REASON_TEMPLATES.FAST_INCORRECT();

    case TRIGGER_TYPES.STAGNATING:
      if (metadata.skillId) {
        return REASON_TEMPLATES.CONFIDENCE_NOT_IMPROVING(
          getSkillDisplayName(metadata.skillId)
        );
      }
      return REASON_TEMPLATES.INCONSISTENT_RESULTS();

    case TRIGGER_TYPES.MISCONCEPTION:
      return REASON_TEMPLATES.FREQUENT_CONFUSION(
        metadata.misconception?.description || "pattern"
      );

    case TRIGGER_TYPES.SET_COMPLETE:
      return REASON_TEMPLATES.SET_COMPLETE(metadata.correct, metadata.total);

    case TRIGGER_TYPES.MOMENTUM:
      return REASON_TEMPLATES.ON_A_ROLL(metadata.streak);

    case TRIGGER_TYPES.MASTERY_ACHIEVED:
      return REASON_TEMPLATES.MASTERY_ACHIEVED(
        getSkillDisplayName(action?.skillId)
      );

    case TRIGGER_TYPES.REVEAL_USED:
      return "Learning from examples helps too.";

    case TRIGGER_TYPES.SESSION_END:
      if (metadata.reason === "fatigue") {
        return REASON_TEMPLATES.NEEDS_BREAK();
      }
      return REASON_TEMPLATES.GOOD_SESSION(metadata.accuracy || "");

    default:
      // Fallback: use action reason if available
      return action?.reason || "Based on your practice patterns.";
  }
}

/**
 * Get display name for a skill ID.
 */
function getSkillDisplayName(skillId) {
  if (!skillId) return "this skill";

  const names = {
    "grammar:cum_clause": "Cum Clauses",
    "grammar:abl_abs": "Ablative Absolutes",
    "grammar:indirect_statement": "Indirect Statements",
    "grammar:purpose_clause": "Purpose Clauses",
    "grammar:result_clause": "Result Clauses",
    "grammar:relative_clause": "Relative Clauses",
    "grammar:gerund": "Gerunds",
    "grammar:gerundive": "Gerundives",
    "grammar:conditionals": "Conditionals",
    "vocab:general": "Vocabulary",
  };

  return names[skillId] || skillId.replace(/^(grammar|vocab):/, "");
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Check all triggers and return the highest priority intervention.
 */
export function getCoachIntervention(studentId, context = {}) {
  const {
    lastEvent,
    recentEvents = [],
    sessionEvents = [],
    skillId,
    subskillId,
    setComplete,
    sessionEnding,
    leavingPage,
    attemptsThisSession = 0,
    correctThisSession = 0,
  } = context;

  // Collect all triggers
  let allTriggers = [];

  // Immediate triggers
  if (lastEvent) {
    allTriggers = allTriggers.concat(
      checkImmediateTriggers(studentId, lastEvent, recentEvents)
    );
  }

  // Pattern triggers (if enough attempts)
  if (sessionEvents.length >= 3) {
    allTriggers = allTriggers.concat(
      checkPatternTriggers(studentId, skillId, sessionEvents)
    );
  }

  // Confidence triggers
  if (skillId) {
    allTriggers = allTriggers.concat(
      checkConfidenceTriggers(studentId, skillId, subskillId)
    );
  }

  // Session boundary triggers
  allTriggers = allTriggers.concat(
    checkSessionBoundaryTriggers(studentId, {
      setComplete,
      sessionEnding,
      leavingPage,
      attemptsThisSession,
      correctThisSession,
    })
  );

  // Sort by priority
  allTriggers.sort((a, b) => b.priority - a.priority);

  // Return highest priority intervention (if any)
  if (allTriggers.length === 0) return null;

  const topTrigger = allTriggers[0];
  return resolveTrigger(topTrigger, studentId, skillId);
}

/**
 * Check if coach should show (with debouncing).
 */
const COACH_COOLDOWN_MS = 30000; // 30 seconds between interventions
let lastCoachTime = 0;

export function shouldShowCoach(intervention) {
  if (!intervention) return false;

  const now = Date.now();

  // Always show high-priority interventions
  if (intervention.priority >= 80) {
    lastCoachTime = now;
    return true;
  }

  // Debounce medium/low priority
  if (now - lastCoachTime < COACH_COOLDOWN_MS) {
    return false;
  }

  lastCoachTime = now;
  return true;
}

/**
 * Reset coach cooldown (e.g., when user dismisses).
 */
export function resetCoachCooldown() {
  lastCoachTime = Date.now();
}
