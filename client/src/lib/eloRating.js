// client/src/lib/eloRating.js
// Elo-style rating system for adaptive learning
// Treats each student as a "player" and each item/skill as having a "difficulty"

// ============================================================================
// CONSTANTS
// ============================================================================

export const ELO_CONSTANTS = {
  INITIAL_RATING: 1200,     // Standard Elo starting point
  K_FACTOR: 32,             // Learning rate - higher = faster adaptation
  K_FACTOR_NEW: 40,         // Higher K for students with few attempts
  K_FACTOR_STABLE: 24,      // Lower K for established students
  MIN_RATING: 400,          // Floor to prevent extreme drops
  MAX_RATING: 2400,         // Ceiling to prevent extreme spikes
  NEW_THRESHOLD: 20,        // Attempts before considered "stable"
};

// ============================================================================
// CORE ELO CALCULATIONS
// ============================================================================

/**
 * Calculate expected score (probability of correct answer)
 * @param {number} studentRating - Student's current rating
 * @param {number} itemDifficulty - Difficulty rating of the item
 * @returns {number} Expected score (0-1)
 */
export function expectedScore(studentRating, itemDifficulty) {
  return 1 / (1 + Math.pow(10, (itemDifficulty - studentRating) / 400));
}

/**
 * Calculate new rating after an attempt
 * @param {number} currentRating - Student's current rating
 * @param {number} itemDifficulty - Difficulty rating of the item
 * @param {boolean} correct - Whether the answer was correct
 * @param {Object} options - Optional parameters
 * @param {number} options.kFactor - K-factor override
 * @param {number} options.totalAttempts - Student's total attempts (for adaptive K)
 * @returns {number} New rating
 */
export function calculateNewRating(currentRating, itemDifficulty, correct, options = {}) {
  let kFactor = options.kFactor || ELO_CONSTANTS.K_FACTOR;

  // Adaptive K-factor based on experience
  if (options.totalAttempts !== undefined) {
    if (options.totalAttempts < ELO_CONSTANTS.NEW_THRESHOLD) {
      kFactor = ELO_CONSTANTS.K_FACTOR_NEW;
    } else {
      kFactor = ELO_CONSTANTS.K_FACTOR_STABLE;
    }
  }

  const expected = expectedScore(currentRating, itemDifficulty);
  const actual = correct ? 1 : 0;
  const newRating = currentRating + kFactor * (actual - expected);

  // Clamp to valid range
  return Math.max(
    ELO_CONSTANTS.MIN_RATING,
    Math.min(ELO_CONSTANTS.MAX_RATING, Math.round(newRating))
  );
}

/**
 * Bootstrap item difficulty from historical accuracy
 * Higher accuracy = easier item (lower rating)
 * Lower accuracy = harder item (higher rating)
 *
 * @param {number} accuracy - Historical accuracy (0-1)
 * @param {number} baseRating - Base difficulty rating (default 1200)
 * @returns {number} Estimated difficulty rating
 */
export function bootstrapDifficulty(accuracy, baseRating = ELO_CONSTANTS.INITIAL_RATING) {
  // Edge cases
  if (accuracy <= 0.01) return baseRating + 400; // Very hard (almost never correct)
  if (accuracy >= 0.99) return baseRating - 400; // Very easy (almost always correct)

  // Inverse of expected score formula:
  // accuracy = 1 / (1 + 10^((difficulty - baseRating) / 400))
  // Solving for difficulty:
  // 10^((difficulty - baseRating) / 400) = (1 - accuracy) / accuracy
  // (difficulty - baseRating) / 400 = log10((1 - accuracy) / accuracy)
  // difficulty = baseRating + 400 * log10((1 - accuracy) / accuracy)

  const difficulty = baseRating + 400 * Math.log10((1 - accuracy) / accuracy);

  return Math.max(
    ELO_CONSTANTS.MIN_RATING,
    Math.min(ELO_CONSTANTS.MAX_RATING, Math.round(difficulty))
  );
}

/**
 * Update item difficulty based on aggregate student performance
 * This allows items to "learn" their true difficulty over time
 *
 * @param {number} currentDifficulty - Item's current difficulty rating
 * @param {number} studentRating - Student's rating who attempted it
 * @param {boolean} correct - Whether the student got it correct
 * @returns {number} Updated difficulty rating
 */
export function updateItemDifficulty(currentDifficulty, studentRating, correct) {
  // Items adjust more slowly than students (K = 8)
  const kFactor = 8;
  const expected = expectedScore(studentRating, currentDifficulty);
  // For items, correct answers suggest it's easier than expected
  const actual = correct ? 0 : 1; // Inverted from student perspective
  const newDifficulty = currentDifficulty + kFactor * (actual - expected);

  return Math.max(
    ELO_CONSTANTS.MIN_RATING,
    Math.min(ELO_CONSTANTS.MAX_RATING, Math.round(newDifficulty))
  );
}

// ============================================================================
// SKILL LEVEL MAPPING
// ============================================================================

/**
 * Map Elo rating to skill level label
 * @param {number} rating - Elo rating
 * @returns {string} "novice" | "learning" | "proficient" | "mastered"
 */
export function ratingToLevel(rating) {
  if (rating >= 1600) return "mastered";
  if (rating >= 1400) return "proficient";
  if (rating >= 1200) return "learning";
  return "novice";
}

/**
 * Map skill level to display color
 * @param {string} level - Skill level
 * @returns {string} Color name for UI
 */
export function levelToColor(level) {
  const colors = {
    mastered: "green",
    proficient: "blue",
    learning: "yellow",
    novice: "gray",
  };
  return colors[level] || "gray";
}

/**
 * Get human-readable label for rating
 * @param {number} rating - Elo rating
 * @returns {string} Descriptive label
 */
export function ratingToLabel(rating) {
  if (rating >= 1800) return "Expert";
  if (rating >= 1600) return "Advanced";
  if (rating >= 1400) return "Proficient";
  if (rating >= 1200) return "Developing";
  if (rating >= 1000) return "Beginner";
  return "Novice";
}

/**
 * Calculate progress to next level
 * @param {number} rating - Current Elo rating
 * @returns {Object} Progress information
 */
export function getProgressToNextLevel(rating) {
  const thresholds = [
    { min: 0, max: 1200, level: "novice", nextLevel: "learning", nextRating: 1200 },
    { min: 1200, max: 1400, level: "learning", nextLevel: "proficient", nextRating: 1400 },
    { min: 1400, max: 1600, level: "proficient", nextLevel: "mastered", nextRating: 1600 },
    { min: 1600, max: 2400, level: "mastered", nextLevel: null, nextRating: null },
  ];

  const current = thresholds.find(t => rating >= t.min && rating < t.max) || thresholds[thresholds.length - 1];

  if (!current.nextRating) {
    return {
      currentLevel: current.level,
      nextLevel: null,
      progress: 100,
      pointsNeeded: 0,
    };
  }

  const rangeSize = current.max - current.min;
  const progressInRange = rating - current.min;
  const progress = Math.round((progressInRange / rangeSize) * 100);
  const pointsNeeded = current.nextRating - rating;

  return {
    currentLevel: current.level,
    nextLevel: current.nextLevel,
    progress: Math.max(0, Math.min(100, progress)),
    pointsNeeded: Math.max(0, pointsNeeded),
  };
}

// ============================================================================
// AGGREGATE CALCULATIONS
// ============================================================================

/**
 * Compute Elo rating from a sequence of events
 * Processes events chronologically to build rating history
 *
 * @param {Array} events - Answer events sorted chronologically (oldest first)
 * @param {Object} itemDifficulties - Map of itemId -> difficulty rating
 * @param {number} initialRating - Starting rating (default 1200)
 * @returns {Object} { rating, history, ratingChange }
 */
export function computeEloFromEvents(events, itemDifficulties = {}, initialRating = ELO_CONSTANTS.INITIAL_RATING) {
  let rating = initialRating;
  const history = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Skip non-answer events or events with hints/reveals
    if (event.hintUsed || event.revealed) continue;

    const itemId = event.itemId;
    const difficulty = itemDifficulties[itemId] || ELO_CONSTANTS.INITIAL_RATING;
    const correct = event.correct;

    const prevRating = rating;
    rating = calculateNewRating(rating, difficulty, correct, { totalAttempts: i });

    history.push({
      timestamp: event.timestamp,
      itemId,
      difficulty,
      correct,
      ratingBefore: prevRating,
      ratingAfter: rating,
      change: rating - prevRating,
    });
  }

  const ratingChange = history.length > 0
    ? rating - initialRating
    : 0;

  return {
    rating,
    history,
    ratingChange,
    attempts: history.length,
  };
}

/**
 * Calculate item difficulties from aggregate performance data
 *
 * @param {Array} events - All answer events
 * @returns {Object} Map of itemId -> difficulty rating
 */
export function calculateItemDifficulties(events) {
  const byItem = {};

  for (const event of events) {
    if (event.hintUsed || event.revealed) continue;

    const itemId = event.itemId;
    if (!byItem[itemId]) {
      byItem[itemId] = { correct: 0, total: 0 };
    }

    byItem[itemId].total++;
    if (event.correct) {
      byItem[itemId].correct++;
    }
  }

  const difficulties = {};
  for (const [itemId, stats] of Object.entries(byItem)) {
    // Need at least 2 attempts to estimate difficulty
    if (stats.total < 2) {
      difficulties[itemId] = ELO_CONSTANTS.INITIAL_RATING;
    } else {
      const accuracy = stats.correct / stats.total;
      difficulties[itemId] = bootstrapDifficulty(accuracy);
    }
  }

  return difficulties;
}

/**
 * Compute skill-level Elo rating
 * Groups events by skill and computes rating for each
 *
 * @param {Array} events - All answer events
 * @param {Object} itemDifficulties - Pre-computed item difficulties
 * @returns {Object} Map of "skillId:subskillId" -> { rating, level, ... }
 */
export function computeSkillEloRatings(events, itemDifficulties = {}) {
  // Group events by skill
  const bySkill = {};

  for (const event of events) {
    const key = `${event.skillId}:${event.subskillId}`;
    if (!bySkill[key]) {
      bySkill[key] = {
        skillId: event.skillId,
        subskillId: event.subskillId,
        events: [],
      };
    }
    bySkill[key].events.push(event);
  }

  // Compute Elo for each skill
  const skillRatings = {};

  for (const [key, data] of Object.entries(bySkill)) {
    // Sort events chronologically
    const sorted = [...data.events].sort((a, b) => a.timestamp - b.timestamp);
    const result = computeEloFromEvents(sorted, itemDifficulties);

    skillRatings[key] = {
      skillId: data.skillId,
      subskillId: data.subskillId,
      eloRating: result.rating,
      level: ratingToLevel(result.rating),
      ratingChange: result.ratingChange,
      attempts: result.attempts,
      history: result.history,
    };
  }

  return skillRatings;
}

/**
 * Compute overall student Elo rating across all skills
 *
 * @param {Array} events - All answer events
 * @param {Object} itemDifficulties - Pre-computed item difficulties
 * @returns {Object} { overallRating, level, bySkill }
 */
export function computeOverallElo(events, itemDifficulties = {}) {
  // Sort all events chronologically
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const overall = computeEloFromEvents(sorted, itemDifficulties);

  // Also compute per-skill for breakdown
  const bySkill = computeSkillEloRatings(events, itemDifficulties);

  return {
    overallRating: overall.rating,
    level: ratingToLevel(overall.rating),
    ratingChange: overall.ratingChange,
    totalAttempts: overall.attempts,
    bySkill,
  };
}
