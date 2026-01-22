// client/src/pages/MasteryPage.jsx
// Mastery Dashboard - Redesigned per authoritative spec
// Skills aggregated at concept level, not session level
// Now uses Elo rating system for skill mastery

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextSelector from "../components/TextSelector";
import {
  getUserState,
} from "../lib/userState";
import { loadLocalEvents } from "../lib/attemptEvents";
import { getStudentIdentity } from "../lib/studentIdentity";
import { ELO_CONSTANTS, ratingToLevel, getProgressToNextLevel as getEloProgress } from "../lib/eloRating";

// ============================================================================
// SKILL DEFINITIONS - Aggregated at concept level
// ============================================================================

// Valid grammar constructions for coverage - ordered by instructional importance
const GRAMMAR_CONSTRUCTIONS = [
  { id: "cum_clause", name: "Cum Clause", practiceMode: "cum_clause", hasSubtype: false, priority: 1 },
  { id: "abl_abs", name: "Ablative Absolute", practiceMode: "abl_abs", hasSubtype: false, priority: 1 },
  { id: "indirect_statement", name: "Indirect Statement", practiceMode: "indirect_statement", hasSubtype: false, priority: 1 },
  { id: "purpose_clause", name: "Purpose Clause", practiceMode: "purpose_clause", hasSubtype: true, priority: 2 },
  { id: "result_clause", name: "Result Clause", practiceMode: "result_clause", hasSubtype: false, priority: 2 },
  { id: "relative_clause", name: "Relative Clause", practiceMode: "relative_clause", hasSubtype: false, priority: 2 },
  { id: "subjunctive_relative_clause", name: "Subjunctive Relative Clause", practiceMode: "subjunctive_relative_clause", hasSubtype: false, priority: 3 },
  { id: "gerund", name: "Gerund", practiceMode: "gerund", hasSubtype: false, priority: 3 },
  { id: "gerundive", name: "Gerundive", practiceMode: "gerundive", hasSubtype: false, priority: 3 },
  { id: "gerund_gerundive_flip", name: "Gerund/Gerundive Transformation", practiceMode: "gerund_gerundive_flip", hasSubtype: false, priority: 4 },
  { id: "conditionals", name: "Conditionals", practiceMode: "conditionals", hasSubtype: true, priority: 2 },
];

// Map practice modes to grammar lesson keys (for directing users to lessons first)
const PRACTICE_MODE_TO_LESSON = {
  abl_abs: "ablative_absolute",
  cum_clause: "cum_clauses",
  indirect_statement: "indirect_statement",
  purpose_clause: "purpose_clauses",
  result_clause: "purpose_clauses", // Same lesson covers both
  relative_clause: "relative_clauses",
  subjunctive_relative_clause: "relative_clauses",
  gerund: "gerunds_gerundives",
  gerundive: "gerunds_gerundives",
  gerund_gerundive_flip: "gerunds_gerundives",
  conditionals: "conditionals",
};

function getLessonKeyForPracticeMode(practiceMode) {
  return PRACTICE_MODE_TO_LESSON[practiceMode] || null;
}

// ============================================================================
// CANONICAL FILTER: Caesar Vocab Events
// Single source of truth for what counts as Caesar vocabulary
// ============================================================================

/**
 * Canonical filter for Caesar vocabulary events.
 * Use this everywhere Caesar vocab data is aggregated.
 */
function isCaesarVocabEvent(event) {
  return (
    event.mode === "caesar_vocab" &&
    event.eventType === "answer_submit"
  );
}

/**
 * Canonical filter for grammar events.
 */
function isGrammarEvent(event) {
  return (
    event.skillId?.startsWith("grammar:") &&
    event.eventType === "answer_submit"
  );
}

// ============================================================================
// DATA AGGREGATION HELPERS
// ============================================================================

/**
 * Aggregate skills at concept level from raw events.
 * Returns both attempted skills and not-started skills.
 */
function aggregateConceptSkills(events, userState) {
  const skills = {};
  const attemptedConstructions = new Set();

  // Process grammar skills by construction
  for (const construction of GRAMMAR_CONSTRUCTIONS) {
    const skillId = `grammar:${construction.id}`;
    const identifyKey = `${skillId}:identify`;
    const identifyData = userState.skills?.[identifyKey];

    // Get all events for this construction to calculate accurate stats
    const constructionEvents = events.filter(
      (e) => e.skillId === skillId && e.subskillId === "identify" && e.eventType === "answer_submit"
    );

    if (constructionEvents.length > 0) {
      attemptedConstructions.add(construction.id);

      const total = constructionEvents.length;
      const correct = constructionEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
      const hintsUsed = constructionEvents.filter((e) => e.hintUsed).length;
      const revealed = constructionEvents.filter((e) => e.revealed).length;

      // Recent accuracy (last 12)
      const recent = constructionEvents.slice(-12);
      const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

      // Streak
      const streak = countStreak(constructionEvents);

      // Unique items
      const uniqueItems = new Set(constructionEvents.map((e) => e.itemId)).size;

      // Get Elo rating from userState or use default
      const eloRating = identifyData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
      const level = identifyData?.level || ratingToLevel(eloRating);

      skills[`grammar_id:${construction.id}`] = {
        category: "grammar_identification",
        constructionId: construction.id,
        name: `${construction.name} Identification`,
        practiceMode: construction.practiceMode,
        priority: construction.priority,
        // Clear stats
        totalAttempts: total,
        totalCorrect: correct,
        accuracy: total > 0 ? correct / total : 0,
        recentAttempts: recent.length,
        recentCorrect: recentCorrect,
        recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
        streak: streak,
        uniqueItemsSeen: uniqueItems,
        hintsUsed: hintsUsed,
        revealsUsed: revealed,
        lastPracticed: constructionEvents[constructionEvents.length - 1]?.timestamp || 0,
        // Elo rating (replaces confidence)
        eloRating,
        level,
      };
    }

    // Classification skill (for constructions with subtypes)
    // Identification events also contribute to classification metrics - answering correct on identify
    // demonstrates knowledge that helps with classification
    if (construction.hasSubtype) {
      const classifyEvents = events.filter(
        (e) => e.skillId === skillId && e.subskillId === "classify" && e.eventType === "answer_submit"
      );

      // Get identify events too - they contribute to overall classification understanding
      const identifyEventsForClass = events.filter(
        (e) => e.skillId === skillId && e.subskillId === "identify" && e.eventType === "answer_submit"
      );

      // Combine both - identification contributes to classification knowledge
      const combinedEvents = [...classifyEvents, ...identifyEventsForClass];

      if (combinedEvents.length > 0) {
        const total = combinedEvents.length;
        const correct = combinedEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
        const hintsUsed = combinedEvents.filter((e) => e.hintUsed).length;
        const revealed = combinedEvents.filter((e) => e.revealed).length;
        const recent = combinedEvents.slice(-12);
        const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

        // Get Elo from userState for classification (use combined if available)
        const classifyKey = `${skillId}:classify`;
        const classifyData = userState.skills?.[classifyKey];
        const classEloRating = classifyData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
        const classLevel = classifyData?.level || ratingToLevel(classEloRating);

        skills[`grammar_class:${construction.id}`] = {
          category: "grammar_classification",
          constructionId: construction.id,
          name: `${construction.name} Classification`,
          practiceMode: construction.practiceMode,
          priority: construction.priority,
          totalAttempts: total,
          totalCorrect: correct,
          accuracy: total > 0 ? correct / total : 0,
          recentAttempts: recent.length,
          recentCorrect: recentCorrect,
          recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
          streak: countStreak(combinedEvents),
          uniqueItemsSeen: new Set(combinedEvents.map((e) => e.itemId)).size,
          hintsUsed: hintsUsed,
          revealsUsed: revealed,
          lastPracticed: combinedEvents[combinedEvents.length - 1]?.timestamp || 0,
          eloRating: classEloRating,
          level: classLevel,
        };
      }
    }
  }

  // Handle conditional labeling as a separate skill
  const condLabelEvents = events.filter(
    (e) => e.skillId === "grammar:conditional_label" && e.subskillId === "classify" && e.eventType === "answer_submit"
  );
  if (condLabelEvents.length > 0) {
    const total = condLabelEvents.length;
    const correct = condLabelEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
    const recent = condLabelEvents.slice(-12);
    const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

    // Get Elo from userState for conditional labeling
    const condLabelData = userState.skills?.["grammar:conditional_label:classify"];
    const condEloRating = condLabelData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
    const condLevel = condLabelData?.level || ratingToLevel(condEloRating);

    skills["grammar_class:conditional_label"] = {
      category: "grammar_classification",
      constructionId: "conditional_label",
      name: "Conditional Type Classification",
      practiceMode: "conditionals",
      priority: 2,
      totalAttempts: total,
      totalCorrect: correct,
      accuracy: total > 0 ? correct / total : 0,
      recentAttempts: recent.length,
      recentCorrect: recentCorrect,
      recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
      streak: countStreak(condLabelEvents),
      uniqueItemsSeen: new Set(condLabelEvents.map((e) => e.itemId)).size,
      hintsUsed: condLabelEvents.filter((e) => e.hintUsed).length,
      revealsUsed: condLabelEvents.filter((e) => e.revealed).length,
      lastPracticed: condLabelEvents[condLabelEvents.length - 1]?.timestamp || 0,
      eloRating: condEloRating,
      level: condLevel,
    };
  }

  // Caesar vocabulary - using canonical filter
  const caesarVocabEvents = events.filter(isCaesarVocabEvent);

  if (caesarVocabEvents.length > 0) {
    // Multiple choice (recognize)
    const mcEvents = caesarVocabEvents.filter((e) => e.subskillId === "recognize");
    if (mcEvents.length > 0) {
      const total = mcEvents.length;
      const correct = mcEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
      const recent = mcEvents.slice(-12);
      const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

      // Get Elo from userState
      const mcData = userState.skills?.["vocab:general:recognize"];
      const mcEloRating = mcData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
      const mcLevel = mcData?.level || ratingToLevel(mcEloRating);

      skills["caesar_vocab_mc"] = {
        category: "caesar_vocab_mc",
        name: "Caesar Vocabulary - Multiple Choice",
        practiceMode: "caesar_vocab",
        priority: 1,
        totalAttempts: total,
        totalCorrect: correct,
        accuracy: total > 0 ? correct / total : 0,
        recentAttempts: recent.length,
        recentCorrect: recentCorrect,
        recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
        streak: countStreak(mcEvents),
        uniqueItemsSeen: new Set(mcEvents.map((e) => e.itemId)).size,
        hintsUsed: mcEvents.filter((e) => e.hintUsed).length,
        revealsUsed: mcEvents.filter((e) => e.revealed).length,
        lastPracticed: mcEvents[mcEvents.length - 1]?.timestamp || 0,
        eloRating: mcEloRating,
        level: mcLevel,
      };
    }

    // Written recall
    const recallEvents = caesarVocabEvents.filter((e) => e.subskillId === "recall");
    if (recallEvents.length > 0) {
      const total = recallEvents.length;
      const correct = recallEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
      const recent = recallEvents.slice(-12);
      const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

      // Get Elo from userState
      const recallData = userState.skills?.["vocab:general:recall"];
      const recallEloRating = recallData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
      const recallLevel = recallData?.level || ratingToLevel(recallEloRating);

      skills["caesar_vocab_recall"] = {
        category: "caesar_vocab_recall",
        name: "Caesar Vocabulary - Written Recall",
        practiceMode: "caesar_vocab",
        priority: 1,
        totalAttempts: total,
        totalCorrect: correct,
        accuracy: total > 0 ? correct / total : 0,
        recentAttempts: recent.length,
        recentCorrect: recentCorrect,
        recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
        streak: countStreak(recallEvents),
        uniqueItemsSeen: new Set(recallEvents.map((e) => e.itemId)).size,
        hintsUsed: recallEvents.filter((e) => e.hintUsed).length,
        revealsUsed: recallEvents.filter((e) => e.revealed).length,
        lastPracticed: recallEvents[recallEvents.length - 1]?.timestamp || 0,
        eloRating: recallEloRating,
        level: recallLevel,
      };
    }

    // Produce (typed) skill
    const produceEvents = caesarVocabEvents.filter((e) => e.subskillId === "produce");
    if (produceEvents.length > 0) {
      const total = produceEvents.length;
      const correct = produceEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
      const recent = produceEvents.slice(-12);
      const recentCorrect = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

      // Get Elo from userState
      const produceData = userState.skills?.["vocab:general:produce"];
      const produceEloRating = produceData?.eloRating || ELO_CONSTANTS.INITIAL_RATING;
      const produceLevel = produceData?.level || ratingToLevel(produceEloRating);

      skills["caesar_vocab_produce"] = {
        category: "caesar_vocab_produce",
        name: "Caesar Vocabulary - Typing",
        practiceMode: "caesar_vocab",
        priority: 1,
        totalAttempts: total,
        totalCorrect: correct,
        accuracy: total > 0 ? correct / total : 0,
        recentAttempts: recent.length,
        recentCorrect: recentCorrect,
        recentAccuracy: recent.length > 0 ? recentCorrect / recent.length : 0,
        streak: countStreak(produceEvents),
        uniqueItemsSeen: new Set(produceEvents.map((e) => e.itemId)).size,
        hintsUsed: produceEvents.filter((e) => e.hintUsed).length,
        revealsUsed: produceEvents.filter((e) => e.revealed).length,
        lastPracticed: produceEvents[produceEvents.length - 1]?.timestamp || 0,
        eloRating: produceEloRating,
        level: produceLevel,
      };
    }
  }

  // Build not-started skills list
  const notStartedSkills = [];
  for (const construction of GRAMMAR_CONSTRUCTIONS) {
    if (!attemptedConstructions.has(construction.id)) {
      notStartedSkills.push({
        category: "grammar_identification",
        constructionId: construction.id,
        name: `${construction.name} Identification`,
        practiceMode: construction.practiceMode,
        priority: construction.priority,
        totalAttempts: 0,
        isNotStarted: true,
      });
    }
  }

  // Check if Caesar vocab not started
  if (!skills["caesar_vocab_mc"] && !skills["caesar_vocab_recall"]) {
    notStartedSkills.push({
      category: "caesar_vocab",
      name: "Caesar Vocabulary",
      practiceMode: "caesar_vocab",
      priority: 1,
      totalAttempts: 0,
      isNotStarted: true,
    });
  }

  return { skills, notStartedSkills };
}

function countStreak(events) {
  let streak = 0;
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  for (const e of sorted) {
    if (e.correct && !e.hintUsed && !e.revealed) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Calculate grammar coverage - instances correct vs total instances IN THE TEXT.
 * Mastery = unique instances answered correctly / ALL instances in constructions file
 *
 * @param {Array} events - Answer events
 * @param {Object} userState - User state (unused now but kept for compatibility)
 * @param {Object} constructionCounts - Map of construction type to total count from server
 */
function calculateGrammarCoverage(events, userState, constructionCounts = {}) {
  const coverage = { mastered: [], inProgress: [], notStarted: [] };

  for (const construction of GRAMMAR_CONSTRUCTIONS) {
    const skillId = `grammar:${construction.id}`;

    // Get total instances from server counts
    // For conditionals, combine protasis and apodosis counts
    let totalInFile;
    if (construction.id === "conditionals") {
      totalInFile = (constructionCounts["conditional_protasis"] || 0) +
                    (constructionCounts["conditional_apodosis"] || 0);
    } else {
      totalInFile = constructionCounts[construction.id] || 0;
    }

    // Get all events for this construction (both identify and classify)
    const constructionEvents = events.filter(
      (e) => e.skillId === skillId && e.eventType === "answer_submit"
    );

    // If no events and no instances exist, skip entirely
    if (constructionEvents.length === 0 && totalInFile === 0) {
      continue;
    }

    // Group by unique instance (itemId)
    const instanceMap = new Map();
    for (const e of constructionEvents) {
      if (!instanceMap.has(e.itemId)) {
        instanceMap.set(e.itemId, { attempts: [], everCorrect: false });
      }
      instanceMap.get(e.itemId).attempts.push(e);
      if (e.correct && !e.hintUsed && !e.revealed) {
        instanceMap.get(e.itemId).everCorrect = true;
      }
    }

    const instancesAttempted = instanceMap.size;
    const correctInstances = [...instanceMap.values()].filter((v) => v.everCorrect).length;

    // Use totalInFile if available, otherwise fall back to attempted (for constructions not in file)
    const totalInstances = totalInFile > 0 ? totalInFile : instancesAttempted;
    const coverageRatio = totalInstances > 0 ? correctInstances / totalInstances : 0;

    const item = {
      id: construction.id,
      name: construction.name,
      practiceMode: construction.practiceMode,
      correctInstances,
      totalInstances,       // Now total in the file, not just attempted
      instancesAttempted,   // How many unique instances the student has seen
      coverageRatio,
      // Consider "mastered" if >= 80% coverage of ALL instances
      isMastered: coverageRatio >= 0.8,
    };

    if (constructionEvents.length === 0) {
      coverage.notStarted.push(item);
    } else if (item.isMastered) {
      coverage.mastered.push(item);
    } else {
      coverage.inProgress.push(item);
    }
  }

  return coverage;
}

/**
 * Calculate vocabulary coverage by chapter - using canonical Caesar vocab filter.
 * Now accepts vocabCountsByChapter from server to show ALL chapters with status.
 *
 * @param {Array} events - Answer events
 * @param {Object} vocabCountsByChapter - Map of chapter number to total word count from server
 */
function calculateVocabCoverage(events, vocabCountsByChapter = {}) {
  // Use canonical filter
  const caesarVocabEvents = events.filter(isCaesarVocabEvent);

  const byChapter = {};

  // Process events
  for (const e of caesarVocabEvents) {
    const chapter = e.metadata?.chapter || e.metadata?.chapterStart || "unknown";
    if (chapter === "unknown") continue;

    if (!byChapter[chapter]) {
      byChapter[chapter] = { items: new Map(), totalAttempts: 0, totalCorrect: 0 };
    }

    byChapter[chapter].totalAttempts++;

    const itemId = e.itemId;
    if (!byChapter[chapter].items.has(itemId)) {
      byChapter[chapter].items.set(itemId, { everCorrect: false, attempts: 0 });
    }

    byChapter[chapter].items.get(itemId).attempts++;
    if (e.correct && !e.hintUsed && !e.revealed) {
      byChapter[chapter].items.get(itemId).everCorrect = true;
      byChapter[chapter].totalCorrect++;
    }
  }

  // Get all chapters from server counts
  const allChapters = Object.keys(vocabCountsByChapter)
    .map(Number)
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);

  // If no server data, use chapters from events
  if (allChapters.length === 0) {
    const eventChapters = Object.keys(byChapter)
      .map(Number)
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
    allChapters.push(...eventChapters);
  }

  // Build chapter list with status
  const chapters = allChapters.map((chapter) => {
    const data = byChapter[chapter];
    const totalInChapter = vocabCountsByChapter[chapter] || 0;

    if (!data) {
      // Not started
      return {
        chapter,
        status: "not_started",
        correctItems: 0,
        itemsAttempted: 0,
        totalItems: totalInChapter,
        totalAttempts: 0,
        totalCorrect: 0,
        accuracy: 0,
        coverageRatio: 0,
        masteryLevel: "not_started",
      };
    }

    const itemsAttempted = data.items.size;
    const correctItems = [...data.items.values()].filter((v) => v.everCorrect).length;
    const totalItems = totalInChapter > 0 ? totalInChapter : itemsAttempted;
    const coverageRatio = totalItems > 0 ? correctItems / totalItems : 0;
    const accuracy = data.totalAttempts > 0 ? data.totalCorrect / data.totalAttempts : 0;

    // Determine mastery level
    let masteryLevel;
    if (coverageRatio >= 0.9 && accuracy >= 0.85) {
      masteryLevel = "mastered";
    } else if (coverageRatio >= 0.7) {
      masteryLevel = "proficient";
    } else if (coverageRatio >= 0.3) {
      masteryLevel = "learning";
    } else {
      masteryLevel = "started";
    }

    return {
      chapter,
      status: "attempted",
      correctItems,
      itemsAttempted,
      totalItems,
      totalAttempts: data.totalAttempts,
      totalCorrect: data.totalCorrect,
      accuracy,
      coverageRatio,
      masteryLevel,
    };
  });

  return {
    mastered: chapters.filter((c) => c.masteryLevel === "mastered"),
    proficient: chapters.filter((c) => c.masteryLevel === "proficient"),
    learning: chapters.filter((c) => c.masteryLevel === "learning"),
    started: chapters.filter((c) => c.masteryLevel === "started"),
    notStarted: chapters.filter((c) => c.masteryLevel === "not_started"),
    all: chapters,
  };
}

/**
 * Generate "Your Next Focus" recommendation using AI-like prioritization.
 * Considers: priority skills not started, struggling skills, declining skills.
 */
function generateNextFocus(attemptedSkills, notStartedSkills) {
  // 1. Priority 1 skills not started (foundational grammar)
  const priorityNotStarted = notStartedSkills.filter((s) => s.priority === 1);
  if (priorityNotStarted.length > 0) {
    return {
      skill: priorityNotStarted[0],
      reason: `Start with foundational grammar: ${priorityNotStarted[0].name}`,
      type: "new_skill",
    };
  }

  // 2. Struggling skills with low Elo (below learning threshold)
  const strugglingWithPotential = attemptedSkills
    .filter((s) => s.eloRating < 1100 && s.totalAttempts >= 5)
    .sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

  if (strugglingWithPotential.length > 0) {
    const weakest = strugglingWithPotential[0];
    return {
      skill: weakest,
      reason: `Focus on ${weakest.name} - you're close to a breakthrough`,
      type: "struggling",
    };
  }

  // 3. Declining skills (recent accuracy < overall accuracy by 10%+)
  const declining = attemptedSkills
    .filter((s) => s.recentAccuracy < s.accuracy - 0.1 && s.totalAttempts >= 10)
    .sort((a, b) => (a.recentAccuracy - a.accuracy) - (b.recentAccuracy - b.accuracy));

  if (declining.length > 0) {
    return {
      skill: declining[0],
      reason: `Review ${declining[0].name} - your recent accuracy has dropped`,
      type: "review",
    };
  }

  // 4. Next priority skill not started
  const nextPriority = notStartedSkills[0];
  if (nextPriority) {
    return {
      skill: nextPriority,
      reason: `Learn a new skill: ${nextPriority.name}`,
      type: "new_skill",
    };
  }

  // 5. Lowest Elo skill to improve
  const lowestElo = attemptedSkills
    .filter((s) => s.totalAttempts >= 3)
    .sort((a, b) => (a.eloRating || ELO_CONSTANTS.INITIAL_RATING) - (b.eloRating || ELO_CONSTANTS.INITIAL_RATING));

  if (lowestElo.length > 0) {
    return {
      skill: lowestElo[0],
      reason: `Continue improving ${lowestElo[0].name}`,
      type: "improve",
    };
  }

  return null;
}

/**
 * Calculate progress over time metrics - using canonical filters.
 */
function calculateProgressOverTime(events) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  // Use canonical filters
  const grammarEvents = events.filter(isGrammarEvent);
  const vocabEvents = events.filter(isCaesarVocabEvent);
  const allAnswerEvents = events.filter((e) => e.eventType === "answer_submit");

  // Daily activity for last 30 days - three series
  const dailyOverall = [];
  const dailyGrammar = [];
  const dailyVocab = [];

  for (let i = 29; i >= 0; i--) {
    const dayStart = now - (i + 1) * dayMs;
    const dayEnd = now - i * dayMs;
    const dateLabel = new Date(dayStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Overall
    const dayAll = allAnswerEvents.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd);
    const allCorrect = dayAll.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
    dailyOverall.push({
      date: dateLabel,
      attempts: dayAll.length,
      correct: allCorrect,
      accuracy: dayAll.length > 0 ? allCorrect / dayAll.length : null,
    });

    // Grammar
    const dayGrammar = grammarEvents.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd);
    const grammarCorrect = dayGrammar.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
    dailyGrammar.push({
      date: dateLabel,
      attempts: dayGrammar.length,
      correct: grammarCorrect,
      accuracy: dayGrammar.length > 0 ? grammarCorrect / dayGrammar.length : null,
    });

    // Vocab (Caesar only)
    const dayVocab = vocabEvents.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd);
    const vocabCorrect = dayVocab.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
    dailyVocab.push({
      date: dateLabel,
      attempts: dayVocab.length,
      correct: vocabCorrect,
      accuracy: dayVocab.length > 0 ? vocabCorrect / dayVocab.length : null,
    });
  }

  // Streak calculation
  let streakDays = 0;
  const today = new Date();
  const practiceByDay = new Set(
    allAnswerEvents.map((e) => new Date(e.timestamp).toDateString())
  );

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toDateString();

    if (practiceByDay.has(dateStr)) {
      streakDays++;
    } else if (i > 0) {
      break;
    }
  }

  // Weekly stats
  const oneWeekAgo = now - weekMs;
  const twoWeeksAgo = now - 2 * weekMs;

  const thisWeekAll = allAnswerEvents.filter((e) => e.timestamp >= oneWeekAgo);
  const lastWeekAll = allAnswerEvents.filter((e) => e.timestamp >= twoWeeksAgo && e.timestamp < oneWeekAgo);

  const thisWeekCorrect = thisWeekAll.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
  const lastWeekCorrect = lastWeekAll.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

  const thisWeekAccuracy = thisWeekAll.length > 0 ? thisWeekCorrect / thisWeekAll.length : 0;
  const lastWeekAccuracy = lastWeekAll.length > 0 ? lastWeekCorrect / lastWeekAll.length : 0;

  let accuracyTrend = "flat";
  if (thisWeekAccuracy - lastWeekAccuracy > 0.05) accuracyTrend = "improving";
  if (thisWeekAccuracy - lastWeekAccuracy < -0.05) accuracyTrend = "declining";

  // Overall totals
  const grammarTotal = grammarEvents.length;
  const grammarCorrectTotal = grammarEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;
  const vocabTotal = vocabEvents.length;
  const vocabCorrectTotal = vocabEvents.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

  return {
    streakDays,
    dailyOverall,
    dailyGrammar,
    dailyVocab,
    thisWeek: {
      attempts: thisWeekAll.length,
      correct: thisWeekCorrect,
      accuracy: thisWeekAccuracy,
    },
    lastWeek: {
      attempts: lastWeekAll.length,
      correct: lastWeekCorrect,
      accuracy: lastWeekAccuracy,
    },
    accuracyTrend,
    grammarTotal,
    grammarCorrect: grammarCorrectTotal,
    grammarAccuracy: grammarTotal > 0 ? grammarCorrectTotal / grammarTotal : 0,
    vocabTotal,
    vocabCorrect: vocabCorrectTotal,
    vocabAccuracy: vocabTotal > 0 ? vocabCorrectTotal / vocabTotal : 0,
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Skill card with clean, focused UX.
 * Handles both attempted skills and not-started skills.
 */
function SkillCard({ skill, onPractice }) {
  const levelConfig = {
    mastered: { bg: "bg-green-50", border: "border-green-300", badge: "bg-green-500", text: "text-green-700" },
    proficient: { bg: "bg-blue-50", border: "border-blue-300", badge: "bg-blue-500", text: "text-blue-700" },
    learning: { bg: "bg-yellow-50", border: "border-yellow-300", badge: "bg-yellow-500", text: "text-yellow-700" },
    novice: { bg: "bg-gray-50", border: "border-gray-300", badge: "bg-gray-400", text: "text-gray-600" },
  };

  // Handle not-started skills with a simpler display
  if (skill.isNotStarted) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 bg-gray-50/50 transition-all hover:shadow-md hover:border-indigo-300">
        <h3 className="font-semibold text-gray-700 mb-2 truncate" title={skill.name}>
          {skill.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className={`px-2 py-0.5 rounded-full ${
            skill.priority === 1 ? "bg-purple-100 text-purple-700" :
            skill.priority === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
          }`}>
            {skill.priority === 1 ? "Foundational" : skill.priority === 2 ? "Important" : "Advanced"}
          </span>
        </div>
        <button
          onClick={() => onPractice(skill)}
          className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
        >
          Start Learning
        </button>
      </div>
    );
  }

  const config = levelConfig[skill.level] || levelConfig.novice;
  const accuracyPercent = Math.round(skill.accuracy * 100);
  const recentPercent = Math.round(skill.recentAccuracy * 100);

  // Progress toward next level
  const progress = getEloProgress(skill.eloRating || ELO_CONSTANTS.INITIAL_RATING);

  return (
    <div className={`rounded-lg border-2 p-4 ${config.bg} ${config.border} transition-all hover:shadow-md`}>
      {/* Header with name and rating badge */}
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-gray-900 truncate pr-2" title={skill.name}>
          {skill.name}
        </h3>
        <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${config.badge}`}>
          {skill.eloRating || 1200}
        </span>
      </div>

      {/* Main stats - compact grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-white/60 rounded p-2 text-center">
          <div className={`text-lg font-bold ${accuracyPercent >= 70 ? "text-green-600" : accuracyPercent >= 50 ? "text-yellow-600" : "text-red-500"}`}>
            {accuracyPercent}%
          </div>
          <div className="text-gray-500">Accuracy</div>
        </div>
        <div className="bg-white/60 rounded p-2 text-center">
          <div className={`text-lg font-bold ${recentPercent >= 70 ? "text-green-600" : recentPercent >= 50 ? "text-yellow-600" : "text-red-500"}`}>
            {recentPercent}%
          </div>
          <div className="text-gray-500">Recent</div>
        </div>
      </div>

      {/* Progress bar toward next level */}
      {progress.nextLevel && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="capitalize">{skill.level}</span>
            <span>{progress.pointsNeeded} pts to {progress.nextLevel}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${config.badge} transition-all`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Secondary stats */}
      <div className="flex justify-between text-xs text-gray-500 mb-3">
        <span>{skill.totalAttempts} attempts</span>
        <span>{skill.streak > 0 ? `${skill.streak} streak` : ""}</span>
        <span>{skill.uniqueItemsSeen} items</span>
      </div>

      <button
        onClick={() => onPractice(skill)}
        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
      >
        Practice
      </button>
    </div>
  );
}

/**
 * Recommended - AI-suggested recommendation with adaptive feedback explaining why
 */
function RecommendedSection({ nextFocus, onPractice, onStart }) {
  if (!nextFocus) return null;

  const { skill, reason, type } = nextFocus;

  const typeStyles = {
    new_skill: "border-blue-400 bg-blue-50",
    struggling: "border-orange-400 bg-orange-50",
    review: "border-yellow-400 bg-yellow-50",
    improve: "border-purple-400 bg-purple-50",
  };

  const typeLabels = {
    new_skill: "New Skill",
    struggling: "Needs Practice",
    review: "Review Needed",
    improve: "Keep Building",
  };

  // Generate adaptive feedback explaining why this is recommended
  const getAdaptiveFeedback = () => {
    switch (type) {
      case "new_skill":
        return `This is a foundational skill you haven't started yet. Mastering ${skill.name} will help you build a strong foundation for more advanced concepts.`;
      case "struggling":
        if (skill.eloRating && skill.eloRating < 1100) {
          return `Your current rating of ${skill.eloRating} indicates this needs more practice. Focus on understanding the patterns - you're ${1200 - skill.eloRating} points away from the learning threshold.`;
        }
        return `Your recent accuracy suggests this concept needs reinforcement. Consistent practice will help solidify your understanding.`;
      case "review":
        const dropPercent = Math.round((skill.accuracy - skill.recentAccuracy) * 100);
        return `Your recent accuracy has dropped ${dropPercent}% compared to your overall accuracy. A quick review session will help refresh this skill.`;
      case "improve":
        if (skill.eloRating) {
          const nextLevel = skill.eloRating < 1400 ? "proficient" : "mastered";
          const pointsNeeded = skill.eloRating < 1400 ? 1400 - skill.eloRating : 1600 - skill.eloRating;
          return `You're making good progress! Just ${pointsNeeded} more rating points to reach ${nextLevel} level.`;
        }
        return `Continue practicing to strengthen this skill and build long-term retention.`;
      default:
        return reason;
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4">Recommended</h2>
      <div className={`rounded-lg border-2 p-6 ${typeStyles[type] || "border-gray-300 bg-gray-50"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-white/50 mb-2">
              {typeLabels[type] || "Focus"}
            </span>
            <h3 className="font-bold text-lg mb-2">{skill.name}</h3>
            <p className="text-gray-700 mb-2">{reason}</p>
            <p className="text-sm text-gray-600 italic mb-4">{getAdaptiveFeedback()}</p>
          </div>
          {skill.eloRating && skill.totalAttempts > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold">{skill.eloRating}</div>
              <div className="text-xs text-gray-500">rating</div>
              {skill.accuracy !== undefined && (
                <div className="text-sm text-gray-600 mt-1">
                  {Math.round(skill.accuracy * 100)}% accuracy
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => (type === "new_skill" ? onStart(skill) : onPractice(skill))}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors"
        >
          {type === "new_skill" ? "Start Learning" : "Practice Now"}
        </button>
      </div>
    </div>
  );
}

/**
 * Expandable skill section with show more/less.
 * Always shows section header, even when empty (with a message).
 */
function ExpandableSkillsSection({ title, icon, colorClass, skills, onPractice, defaultCount = 4, emptyMessage }) {
  const [expanded, setExpanded] = useState(false);

  const displayedSkills = expanded ? skills : skills.slice(0, defaultCount);
  const hasMore = skills.length > defaultCount;

  // Default empty messages based on title
  const defaultEmptyMessages = {
    "Strongest Skills": "Keep practicing to build your strongest skills! Skills will appear here once you consistently perform well.",
    "Needs Work": "No areas identified for improvement yet. Start practicing to get personalized recommendations.",
  };

  return (
    <div className="mb-8">
      <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
        <span>{icon}</span> {title}
        {skills.length > 0 && <span className="text-sm font-normal text-gray-500">({skills.length})</span>}
      </h2>

      {skills.length === 0 ? (
        <p className="text-gray-500 p-4 bg-gray-50 rounded-lg text-sm">
          {emptyMessage || defaultEmptyMessages[title] || "No skills in this category yet."}
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedSkills.map((skill, i) => (
              <SkillCard key={i} skill={skill} onPractice={onPractice} />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              {expanded ? "Show less" : `Show all ${skills.length} skills`}
            </button>
          )}
        </>
      )}
    </div>
  );
}


/**
 * Grammar Coverage Bar Chart - horizontal bars proportionally sized by total instances
 * Each bar shows covered percentage filled in with the construction's color
 */
function GrammarCoverageBarChart({ items, onPractice }) {
  // Calculate max instances for proportional sizing
  const maxInstances = Math.max(...items.map((item) => item.totalInstances || 0), 1);
  const totalInstances = items.reduce((sum, item) => sum + (item.totalInstances || 0), 0);

  if (totalInstances === 0) {
    return <p className="text-gray-500 text-sm">No grammar data available.</p>;
  }

  // Color palette for different constructions - distinct, vibrant colors
  const constructionColors = {
    cum_clause: { fill: "#8b5cf6", border: "#7c3aed", name: "purple" },
    abl_abs: { fill: "#3b82f6", border: "#2563eb", name: "blue" },
    indirect_statement: { fill: "#22c55e", border: "#16a34a", name: "green" },
    purpose_clause: { fill: "#f97316", border: "#ea580c", name: "orange" },
    result_clause: { fill: "#ef4444", border: "#dc2626", name: "red" },
    relative_clause: { fill: "#06b6d4", border: "#0891b2", name: "cyan" },
    subjunctive_relative_clause: { fill: "#ec4899", border: "#db2777", name: "pink" },
    gerund: { fill: "#eab308", border: "#ca8a04", name: "yellow" },
    gerundive: { fill: "#f43f5e", border: "#e11d48", name: "rose" },
    gerund_gerundive_flip: { fill: "#0ea5e9", border: "#0284c7", name: "sky" },
    conditionals: { fill: "#f59e0b", border: "#d97706", name: "amber" },
  };

  // Default color for unknown constructions
  const defaultColor = { fill: "#6b7280", border: "#4b5563", name: "gray" };

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const coveragePercent = item.totalInstances > 0
          ? Math.round((item.correctInstances / item.totalInstances) * 100)
          : 0;
        const barWidthPercent = (item.totalInstances / maxInstances) * 100;
        const colors = constructionColors[item.id] || defaultColor;

        return (
          <button
            key={item.id}
            onClick={() => onPractice(item)}
            className="w-full text-left group"
          >
            {/* Bar container - proportionally sized */}
            <div
              className="relative h-8 rounded-md border-2 overflow-hidden transition-all group-hover:shadow-md"
              style={{
                width: `${Math.max(barWidthPercent, 20)}%`,
                borderColor: colors.border,
                backgroundColor: "#f3f4f6",
              }}
            >
              {/* Filled portion showing coverage */}
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{
                  width: `${coveragePercent}%`,
                  backgroundColor: colors.fill,
                }}
              />

              {/* Percentage label on the bar */}
              <div className="absolute inset-0 flex items-center justify-end pr-2">
                <span
                  className={`text-sm font-bold ${
                    coveragePercent > 50 ? "text-white" : "text-gray-700"
                  }`}
                  style={{
                    textShadow: coveragePercent > 50 ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {coveragePercent}%
                </span>
              </div>
            </div>

            {/* Label below bar */}
            <div className="flex items-center justify-between mt-1">
              <span
                className="text-sm font-medium transition-colors"
                style={{ color: colors.fill }}
              >
                {item.name}
              </span>
              <span className="text-xs text-gray-500">
                {item.correctInstances}/{item.totalInstances} instances
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Vocabulary coverage with total stats at top and expandable chapter grid.
 * - Shows total percentage covered (words learned/total words)
 * - Shows number of words and chapters covered
 * - Expandable/collapsible chapter grid
 * - Green for completed chapters
 * - Clicking sets vocab practice for that chapter
 */
function VocabCoverageSection({ chapters, onPractice }) {
  const [expanded, setExpanded] = useState(false);

  if (!chapters || chapters.length === 0) {
    return <p className="text-gray-500">No vocabulary chapters available.</p>;
  }

  // Calculate totals
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.totalItems || 0), 0);
  const learnedWords = chapters.reduce((sum, ch) => sum + (ch.correctItems || 0), 0);
  const totalChapters = chapters.length;
  const completedChapters = chapters.filter((ch) => ch.masteryLevel === "mastered").length;
  const coveragePercent = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;

  const levelColors = {
    mastered: { bg: "bg-green-100", border: "border-green-400", text: "text-green-700", ring: "#22c55e" },
    proficient: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-600", ring: "#3b82f6" },
    learning: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-700", ring: "#eab308" },
    started: { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-600", ring: "#f97316" },
    not_started: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", ring: "#d1d5db" },
  };

  const levelLabels = {
    mastered: "Complete",
    proficient: "Proficient",
    learning: "Learning",
    started: "Started",
    not_started: "Not Started",
  };

  return (
    <div>
      {/* Total Stats Header */}
      <div className="flex flex-wrap items-center gap-6 mb-4 p-4 bg-indigo-50 rounded-lg">
        <div className="text-center">
          <div className="text-3xl font-bold text-indigo-600">{coveragePercent}%</div>
          <div className="text-xs text-gray-600">Total Coverage</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-800">{learnedWords}/{totalWords}</div>
          <div className="text-xs text-gray-600">Words Learned</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-800">{completedChapters}/{totalChapters}</div>
          <div className="text-xs text-gray-600">Chapters Complete</div>
        </div>
      </div>

      {/* Expand/Collapse Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-3"
      >
        <span>{expanded ? "Hide" : "Show"} Chapter Details</span>
        <span className="text-xs">{expanded ? "[-]" : "[+]"}</span>
      </button>

      {/* Expandable Chapter Grid */}
      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {chapters.map((chapter) => {
            const colors = levelColors[chapter.masteryLevel] || levelColors.not_started;
            const coverageRatio = chapter.coverageRatio * 100;
            const accuracyPercent = chapter.accuracy * 100;
            const circumference = 2 * Math.PI * 18;
            const strokeDasharray = `${(coverageRatio / 100) * circumference} ${circumference}`;
            const isComplete = chapter.masteryLevel === "mastered";

            return (
              <button
                key={chapter.chapter}
                onClick={() => onPractice(chapter)}
                className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all hover:shadow-md ${
                  isComplete
                    ? "bg-green-50 border-green-400"
                    : `${colors.bg} ${colors.border}`
                }`}
                title={`Click to practice Chapter ${chapter.chapter} vocabulary`}
              >
                {/* Progress ring */}
                <div className="relative w-14 h-14 mb-1">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="28" cy="28" r="18" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                    <circle
                      cx="28"
                      cy="28"
                      r="18"
                      fill="none"
                      stroke={isComplete ? "#22c55e" : colors.ring}
                      strokeWidth="5"
                      strokeDasharray={strokeDasharray}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${isComplete ? "text-green-700" : "text-gray-700"}`}>
                    {chapter.chapter}
                  </span>
                </div>

                {/* Stats */}
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-700">
                    {chapter.correctItems}/{chapter.totalItems}
                  </div>
                  <div className={`text-xs font-medium ${isComplete ? "text-green-600" : colors.text}`}>
                    {levelLabels[chapter.masteryLevel]}
                  </div>
                  {chapter.masteryLevel !== "not_started" && (
                    <div className="text-xs text-gray-400">
                      {Math.round(accuracyPercent)}% acc
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Progress over time with redesigned graphs.
 * - Mastery: Combined line graph with Grammar + Vocab
 * - Accuracy: Line graph with grammar + vocab (no overall)
 * - Activity: Bar chart showing time spent
 */
function ProgressOverTimeSection({ progress, events, constructionCounts, vocabCountsByChapter }) {
  const [graphMode, setGraphMode] = useState("mastery"); // "mastery" | "accuracy" | "activity"

  // Calculate all-time accuracy
  const allTimeTotal = (progress.grammarTotal || 0) + (progress.vocabTotal || 0);
  const allTimeCorrect = (progress.grammarCorrect || 0) + (progress.vocabCorrect || 0);
  const allTimeAccuracy = allTimeTotal > 0 ? Math.round((allTimeCorrect / allTimeTotal) * 100) : 0;

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-bold mb-4">Progress Over Time</h2>

      {/* Key stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-indigo-50 rounded-lg">
          <div className="text-2xl font-bold text-indigo-600">{progress.streakDays}</div>
          <div className="text-xs text-gray-600">Day Streak</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {allTimeAccuracy}%
          </div>
          <div className="text-xs text-gray-600">All Time Accuracy</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">
            {allTimeTotal}
          </div>
          <div className="text-xs text-gray-600">Total Attempts</div>
        </div>
      </div>

      {/* Graph mode switch */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setGraphMode("mastery")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            graphMode === "mastery"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Mastery
        </button>
        <button
          onClick={() => setGraphMode("accuracy")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            graphMode === "accuracy"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Accuracy
        </button>
        <button
          onClick={() => setGraphMode("activity")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            graphMode === "activity"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Activity
        </button>
      </div>

      {/* Chart */}
      <div className="mb-4">
        {graphMode === "mastery" && (
          <MasteryLineGraph
            events={events}
            constructionCounts={constructionCounts}
            vocabCountsByChapter={vocabCountsByChapter}
          />
        )}

        {graphMode === "accuracy" && (
          <AccuracyLineGraph
            grammarData={progress.dailyGrammar}
            vocabData={progress.dailyVocab}
          />
        )}

        {graphMode === "activity" && (
          <ActivityBarChart data={progress.dailyOverall} />
        )}
      </div>

      {/* Week comparison */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-gray-50 rounded">
          <div className="font-semibold">This Week</div>
          <div className="text-gray-600">
            {progress.thisWeek.attempts} attempts, {progress.thisWeek.correct} correct
          </div>
        </div>
        <div className="p-3 bg-gray-50 rounded">
          <div className="font-semibold">Last Week</div>
          <div className="text-gray-600">
            {progress.lastWeek.attempts} attempts, {progress.lastWeek.correct} correct
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mastery line graph with Grammar and Vocab lines
 * Mastery = (items mastered) / (total items) - can only increase
 */
function MasteryLineGraph({ events, constructionCounts, vocabCountsByChapter }) {
  // Calculate total items
  const totalGrammarItems = Object.values(constructionCounts || {}).reduce((a, b) => a + b, 0);
  const totalVocabItems = Object.values(vocabCountsByChapter || {}).reduce((a, b) => a + b, 0);

  // Get all answer events sorted by time
  const grammarEvents = (events || [])
    .filter((e) => e.eventType === "answer_submit" && e.skillId?.startsWith("grammar:"))
    .sort((a, b) => a.timestamp - b.timestamp);

  const vocabEvents = (events || [])
    .filter((e) => e.eventType === "answer_submit" && e.mode === "caesar_vocab")
    .sort((a, b) => a.timestamp - b.timestamp);

  // Build daily mastery data for last 30 days
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const buildMasteryData = (sortedEvents, totalItems) => {
    if (totalItems === 0) return [];

    const masteredItems = new Set();
    const dailyData = [];

    for (let i = 29; i >= 0; i--) {
      const dayEnd = now - i * dayMs;
      const dateLabel = new Date(dayEnd - dayMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });

      // Add all items mastered up to this day
      for (const e of sortedEvents) {
        if (e.timestamp < dayEnd && e.correct && !e.hintUsed && !e.revealed) {
          masteredItems.add(e.itemId);
        }
      }

      dailyData.push({
        date: dateLabel,
        mastery: masteredItems.size / totalItems,
        masteredCount: masteredItems.size,
      });
    }

    return dailyData;
  };

  const grammarData = buildMasteryData(grammarEvents, totalGrammarItems);
  const vocabData = buildMasteryData(vocabEvents, totalVocabItems);

  // Build SVG line path from mastery data
  const buildLinePath = (data) => {
    if (data.length < 2) return null;

    return data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - d.mastery * 100;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  };

  const grammarPath = buildLinePath(grammarData);
  const vocabPath = buildLinePath(vocabData);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Mastery Over Time</h3>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-purple-500 rounded"></div>
          <span className="text-gray-600">Grammar</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-green-500 rounded"></div>
          <span className="text-gray-600">Vocabulary</span>
        </div>
      </div>

      {/* Graph with Y-axis */}
      <div className="flex">
        {/* Y-axis labels */}
        <div className="w-8 flex flex-col justify-between text-xs text-gray-400 pr-1">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        {/* Chart area */}
        <div className="flex-1 h-32 relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-t border-gray-200"></div>
            <div className="border-t border-gray-200 border-dashed"></div>
            <div className="border-t border-gray-200"></div>
          </div>

          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Grammar line */}
            {grammarPath && (
              <path
                d={grammarPath}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Vocab line */}
            {vocabPath && (
              <path
                d={vocabPath}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex ml-8">
        <div className="flex-1 flex justify-between text-xs text-gray-400 mt-1">
          <span>{grammarData[0]?.date}</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Accuracy line graph with Grammar + Vocabulary lines (no Overall)
 */
function AccuracyLineGraph({ grammarData, vocabData }) {
  // Build SVG line path and points from data
  const buildLineData = (data) => {
    const validPoints = data
      .map((d, i) => ({ index: i, accuracy: d.accuracy, attempts: d.attempts }))
      .filter((d) => d.accuracy !== null && d.attempts > 0);

    if (validPoints.length === 0) return { path: null, points: [] };

    const points = validPoints.map((d) => ({
      x: (d.index / (data.length - 1)) * 100,
      y: 100 - d.accuracy * 100,
    }));

    // Need at least 2 points for a line
    const path = validPoints.length >= 2
      ? validPoints
          .map((d, i) => {
            const x = (d.index / (data.length - 1)) * 100;
            const y = 100 - d.accuracy * 100;
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ")
      : null;

    return { path, points };
  };

  const grammarLine = buildLineData(grammarData);
  const vocabLine = buildLineData(vocabData);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Accuracy Over Time</h3>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-purple-500 rounded"></div>
          <span className="text-gray-600">Grammar</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-green-500 rounded"></div>
          <span className="text-gray-600">Vocabulary</span>
        </div>
      </div>

      {/* Graph with Y-axis */}
      <div className="flex">
        {/* Y-axis labels */}
        <div className="w-8 flex flex-col justify-between text-xs text-gray-400 pr-1">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        {/* Chart area */}
        <div className="flex-1 h-32 relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-t border-gray-200"></div>
            <div className="border-t border-gray-200 border-dashed"></div>
            <div className="border-t border-gray-200"></div>
          </div>

          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Grammar line */}
            {grammarLine.path && (
              <path
                d={grammarLine.path}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Single circle at latest grammar point */}
            {grammarLine.points.length > 0 && (
              <circle
                cx={grammarLine.points[grammarLine.points.length - 1].x}
                cy={grammarLine.points[grammarLine.points.length - 1].y}
                r="3"
                fill="#8b5cf6"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Vocab line */}
            {vocabLine.path && (
              <path
                d={vocabLine.path}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Single circle at latest vocab point */}
            {vocabLine.points.length > 0 && (
              <circle
                cx={vocabLine.points[vocabLine.points.length - 1].x}
                cy={vocabLine.points[vocabLine.points.length - 1].y}
                r="3"
                fill="#22c55e"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex ml-8">
        <div className="flex-1 flex justify-between text-xs text-gray-400 mt-1">
          <span>{grammarData[0]?.date}</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Activity bar chart showing attempts per day
 */
function ActivityBarChart({ data }) {
  const maxAttempts = Math.max(...data.map((d) => d.attempts), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Daily Activity (Last 30 Days)</h3>

      {/* Graph with Y-axis */}
      <div className="flex">
        {/* Y-axis labels */}
        <div className="w-8 flex flex-col justify-between text-xs text-gray-400 pr-1">
          <span>{maxAttempts}</span>
          <span>{Math.round(maxAttempts / 2)}</span>
          <span>0</span>
        </div>

        {/* Bar chart */}
        <div className="flex-1 h-24 flex items-end gap-0.5">
          {data.map((day, i) => (
            <div
              key={i}
              className="flex-1 bg-indigo-400 hover:bg-indigo-500 rounded-t transition-colors cursor-pointer"
              style={{
                height: day.attempts > 0 ? `${Math.max(4, (day.attempts / maxAttempts) * 100)}%` : "2px",
                opacity: day.attempts > 0 ? 1 : 0.3,
              }}
              title={`${day.date}: ${day.attempts} attempts, ${day.correct} correct`}
            />
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex ml-8">
        <div className="flex-1 flex justify-between text-xs text-gray-400 mt-1">
          <span>{data[0]?.date}</span>
          <span>Today</span>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">
        Y-axis: Number of attempts per day
      </p>
    </div>
  );
}

/**
 * Strongest skills section.
 */
function StrongestSkillsSection({ skills, onPractice }) {
  if (skills.length === 0) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="text-green-600">+</span> Strongest Skills
        </h2>
        <p className="text-gray-500 p-4 bg-gray-50 rounded-lg">
          Keep practicing to build strong skills.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span className="text-green-600">+</span> Strongest Skills
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill, i) => (
          <SkillCard key={i} skill={skill} onPractice={onPractice} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MasteryPage() {
  const navigate = useNavigate();
  const [userState, setUserState] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [constructionCounts, setConstructionCounts] = useState({});
  const [vocabCountsByChapter, setVocabCountsByChapter] = useState({});

  // Load data
  useEffect(() => {
    const identity = getStudentIdentity();
    const state = getUserState({ forceRefresh: true });
    const allEvents = loadLocalEvents().filter((e) => e.studentId === identity.studentId);

    setUserState(state);
    setEvents(allEvents);
    setLoading(false);

    // Fetch construction counts from server
    fetch("/api/caesar/constructionCounts")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.counts) {
          setConstructionCounts(data.counts);
        }
      })
      .catch(() => {});

    // Fetch vocab counts from server
    fetch("/api/caesar/vocabCounts")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.byChapter) {
          setVocabCountsByChapter(data.byChapter);
        }
      })
      .catch(() => {});
  }, []);

  // Compute aggregated data
  const {
    strongestSkills,
    strugglingSkills,
    grammarCoverage,
    vocabCoverage,
    progressOverTime,
    nextFocus,
  } = useMemo(() => {
    if (!userState) {
      return {
        strongestSkills: [],
        strugglingSkills: [],
        grammarCoverage: { mastered: [], inProgress: [], notStarted: [] },
        vocabCoverage: { mastered: [], proficient: [], learning: [], started: [], notStarted: [], all: [] },
        progressOverTime: null,
        nextFocus: null,
      };
    }

    // Aggregate at concept level
    const { skills, notStartedSkills: notStarted } = aggregateConceptSkills(events, userState);

    // Sort skills list
    const skillsList = Object.values(skills);
    const attemptedSkills = skillsList.filter((s) => s.totalAttempts >= 1);

    // Calculate average rating
    let avgRating = ELO_CONSTANTS.INITIAL_RATING;
    if (attemptedSkills.length > 0) {
      const totalRating = attemptedSkills.reduce((sum, s) => sum + (s.eloRating || ELO_CONSTANTS.INITIAL_RATING), 0);
      avgRating = totalRating / attemptedSkills.length;
    }

    // Dynamic threshold calculation for "Strongest Skills"
    // Biases toward "Needs Work" by making Strongest criteria stricter
    const calculateStrongestThreshold = () => {
      if (attemptedSkills.length === 0) return avgRating + 100;

      // Sort by Elo descending to find top performers
      const sortedByElo = [...attemptedSkills].sort((a, b) =>
        (b.eloRating || ELO_CONSTANTS.INITIAL_RATING) - (a.eloRating || ELO_CONSTANTS.INITIAL_RATING)
      );

      // Start with top 25% threshold
      const baseIndex = Math.max(0, Math.floor(attemptedSkills.length * 0.25) - 1);
      let threshold = sortedByElo[baseIndex]?.eloRating || avgRating;

      // Count qualifying skills (high Elo + good accuracy + enough attempts)
      const countQualifying = (t) => attemptedSkills.filter(s =>
        s.eloRating >= t && s.totalAttempts >= 5 && s.accuracy >= 0.65
      ).length;

      let qualifyingCount = countQualifying(threshold);

      // If more than 4 would qualify, raise threshold (be stricter)
      while (qualifyingCount > 4 && threshold < 1600) {
        threshold += 25;
        qualifyingCount = countQualifying(threshold);
      }

      // Ensure threshold is above initial rating (bias toward needs work)
      return Math.max(threshold, ELO_CONSTANTS.INITIAL_RATING + 50);
    };

    const strongestThreshold = calculateStrongestThreshold();

    // Strongest: must exceed dynamic threshold, have decent attempts and accuracy
    // Sorted strongest to weakest (descending Elo)
    const strongest = attemptedSkills
      .filter((s) =>
        s.eloRating >= strongestThreshold &&
        s.totalAttempts >= 5 &&
        s.accuracy >= 0.65
      )
      .sort((a, b) => (b.eloRating || 0) - (a.eloRating || 0));

    // Create set of strongest skill keys to exclude from needs work
    const strongestKeys = new Set(strongest.map((s) => `${s.category}:${s.constructionId || s.name}`));

    // Needs Work: ALL remaining attempted skills (not in strongest)
    // Sorted weakest to strongest (ascending Elo) - most struggling first
    const strugglingAttempted = attemptedSkills
      .filter((s) => {
        const key = `${s.category}:${s.constructionId || s.name}`;
        return !strongestKeys.has(key); // All skills not in strongest go to needs work
      })
      .sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

    // Not started: sorted by instructional importance (will be appended to needsWork)
    const notStartedSorted = [...notStarted].sort((a, b) => a.priority - b.priority);

    // Convert not-started skills to a format compatible with SkillCard (add placeholder stats)
    const notStartedAsNeedsWork = notStartedSorted.map((s) => ({
      ...s,
      eloRating: ELO_CONSTANTS.INITIAL_RATING - 100, // Slightly below default to rank last
      level: "novice",
      totalAttempts: 0,
      totalCorrect: 0,
      accuracy: 0,
      recentAttempts: 0,
      recentCorrect: 0,
      recentAccuracy: 0,
      streak: 0,
      uniqueItemsSeen: 0,
      hintsUsed: 0,
      revealsUsed: 0,
      lastPracticed: 0,
      isNotStarted: true,
    }));

    // Combine struggling skills + not started
    // Attempted skills sorted weakest first, then not-started by priority
    const struggling = [...strugglingAttempted, ...notStartedAsNeedsWork];

    // Coverage - now with server counts
    const grammar = calculateGrammarCoverage(events, userState, constructionCounts);
    const vocab = calculateVocabCoverage(events, vocabCountsByChapter);

    // Progress
    const progress = calculateProgressOverTime(events);

    // Generate "Your Next Focus" recommendation
    const focus = generateNextFocus(skillsList, notStartedSorted);

    return {
      strongestSkills: strongest,
      strugglingSkills: struggling,
      grammarCoverage: grammar,
      vocabCoverage: vocab,
      progressOverTime: progress,
      nextFocus: focus,
    };
  }, [userState, events, constructionCounts, vocabCountsByChapter]);

  // Handle practice launch
  const handlePractice = (skill) => {
    if (skill.practiceMode === "caesar_vocab") {
      navigate("/CaesarDBG1");
    } else {
      navigate(`/grammar-practice?mode=${skill.practiceMode}`);
    }
  };

  // Handle start for not-started skills - go to lesson first for grammar
  const handleStart = (skill) => {
    if (skill.practiceMode === "caesar_vocab") {
      navigate("/CaesarDBG1");
    } else {
      // For grammar skills, direct to the lesson page first so they can learn before practicing
      const lessonKey = getLessonKeyForPracticeMode(skill.practiceMode);
      if (lessonKey) {
        navigate(`/grammar/${lessonKey}`);
      } else {
        navigate(`/grammar-practice?mode=${skill.practiceMode}`);
      }
    }
  };

  // Handle grammar coverage practice
  const handleGrammarCoveragePractice = (item) => {
    navigate(`/grammar-practice?mode=${item.practiceMode}`);
  };

  // Handle vocab coverage practice
  const handleVocabCoveragePractice = (item) => {
    navigate(`/CaesarDBG1?chapter=${item.chapter}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading mastery data...</div>
      </div>
    );
  }

  // Empty state
  const hasAnyAttempts = events.filter((e) => e.eventType === "answer_submit").length > 0;

  if (!hasAnyAttempts) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h1 className="text-3xl font-bold mb-4">Your Mastery Dashboard</h1>
        <p className="text-gray-600 mb-8">
          Start practicing to see your mastery progress here.
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => navigate("/grammar-practice")}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            Start Grammar Practice
          </button>
          <button
            onClick={() => navigate("/CaesarDBG1")}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
          >
            Start Caesar Vocabulary
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Your Mastery</h1>
          <p className="text-gray-600">Track your progress and find what to practice next.</p>
        </div>

      {/* Recommended - AI recommendation with adaptive feedback */}
      <RecommendedSection
        nextFocus={nextFocus}
        onPractice={handlePractice}
        onStart={handleStart}
      />

      {/* Needs Work - show top 3 with expand (includes not-started at lowest priority) */}
      <ExpandableSkillsSection
        title="Needs Work"
        icon="!"
        colorClass="text-orange-700"
        skills={strugglingSkills}
        onPractice={handlePractice}
        defaultCount={3}
      />

      {/* Strongest Skills - show top 3 with expand */}
      <ExpandableSkillsSection
        title="Strongest Skills"
        icon="+"
        colorClass="text-green-600"
        skills={strongestSkills}
        onPractice={handlePractice}
        defaultCount={3}
      />

      {/* Grammar Coverage */}
      <div className="mb-8 bg-white rounded-lg border p-6">
        <h2 className="text-xl font-bold mb-2">Grammar Coverage</h2>
        <p className="text-gray-600 text-sm mb-4">
          Unique instances answered correctly / total instances in text. Click any bar to practice.
        </p>

        {grammarCoverage.mastered.length === 0 && grammarCoverage.inProgress.length === 0 && grammarCoverage.notStarted?.length === 0 ? (
          <p className="text-gray-500">Start grammar practice to track coverage.</p>
        ) : (
          <GrammarCoverageBarChart
            items={[...grammarCoverage.mastered, ...grammarCoverage.inProgress, ...(grammarCoverage.notStarted || [])]}
            onPractice={handleGrammarCoveragePractice}
          />
        )}
      </div>

      {/* Caesar Vocabulary Coverage - Expandable with total stats */}
      <div className="mb-8 bg-white rounded-lg border p-6">
        <h2 className="text-xl font-bold mb-2">Caesar Vocabulary Coverage</h2>
        <p className="text-gray-600 text-sm mb-4">
          Track your vocabulary progress across all chapters. Click any chapter to practice.
        </p>

        {vocabCoverage.all?.length === 0 ? (
          <p className="text-gray-500">Start Caesar vocabulary practice to track coverage.</p>
        ) : (
          <VocabCoverageSection
            chapters={vocabCoverage.all || []}
            onPractice={handleVocabCoveragePractice}
          />
        )}
      </div>

      {/* Progress Over Time */}
      {progressOverTime && (
        <div className="mb-8">
          <ProgressOverTimeSection
            progress={progressOverTime}
            events={events}
            constructionCounts={constructionCounts}
            vocabCountsByChapter={vocabCountsByChapter}
          />
        </div>
      )}

      {/* Elo Rating Explanation */}
      <div className="mb-8 bg-white rounded-lg border p-6">
        <h2 className="text-xl font-bold text-primary mb-3">How Skill Ratings Work</h2>
        <p className="text-gray-600 text-sm mb-4">
          Your mastery is tracked using an Elo rating system, similar to chess rankings.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">The Basics</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li><span className="font-medium">Starting rating:</span> Everyone begins at 1200</li>
              <li><span className="font-medium">Correct answers:</span> Increase your rating</li>
              <li><span className="font-medium">Incorrect answers:</span> Decrease your rating</li>
              <li><span className="font-medium">Difficulty matters:</span> Harder items affect your rating more</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Mastery Levels</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-20 font-medium text-gray-500">New</span>
                <span className="text-gray-600">&lt; 1100 rating</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 font-medium text-blue-600">Learning</span>
                <span className="text-gray-600">1100 - 1299 rating</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 font-medium text-green-600">Proficient</span>
                <span className="text-gray-600">1300 - 1499 rating</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 font-medium text-purple-600">Mastered</span>
                <span className="text-gray-600">1500+ rating</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          The system adapts to you: if you answer correctly on hard items, your rating rises quickly.
          If you struggle, the system identifies those areas for focused practice.
        </p>
        </div>
      </div>
    </>
  );
}
