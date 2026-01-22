// client/src/lib/classInsights.js
// Phase 8: Teacher Layer - Class-level insights and aggregation
// Aggregates student states into actionable class-level data

import { buildUserState, getUserState } from "./userState";
import { detectMisconceptions, detectPatterns, MISCONCEPTION_TYPES } from "./adaptiveFeedback";
import { loadLocalEvents, SKILLS, SUBSKILLS } from "./attemptEvents";

// ============================================================================
// RETEACH SUGGESTION TEMPLATES
// ============================================================================

/**
 * Static reteach suggestions for each skill.
 * Teachers can use these directly for lesson planning.
 */
export const RETEACH_TEMPLATES = {
  // Grammar skills
  "grammar:cum_clause": {
    name: "Cum Clause",
    brief: "Review temporal vs. causal cum with mood distinction",
    detailed: "Students confuse temporal cum (indicative) with causal/concessive cum (subjunctive). Use paired examples showing the same sentence with different moods and meanings.",
    keyPoints: ["Temporal = indicative", "Causal/concessive = subjunctive", "Context determines meaning"],
  },
  "grammar:abl_abs": {
    name: "Ablative Absolute",
    brief: "Practice identifying standalone participial phrases",
    detailed: "Students often miss that ablative absolutes are grammatically independent. Show how removing the phrase leaves a complete sentence.",
    keyPoints: ["Must be grammatically independent", "Both noun and participle in ablative", "Often at sentence start"],
  },
  "grammar:indirect_statement": {
    name: "Indirect Statement",
    brief: "Drill accusative subject + infinitive recognition",
    detailed: "Students miss the accusative subject or confuse infinitive tenses. Use a head verb identification exercise first.",
    keyPoints: ["Head verb (verb of saying/thinking)", "Accusative subject", "Infinitive shows relative time"],
  },
  "grammar:purpose_clause": {
    name: "Purpose Clause",
    brief: "Contrast ut + subjunctive with result clauses",
    detailed: "Purpose vs. result confusion is common. Emphasize: purpose = intention (answer 'why?'), result = outcome (answer 'with what effect?').",
    keyPoints: ["Purpose = intention", "ut + subjunctive for purpose", "No 'tam/ita' signal"],
  },
  "grammar:result_clause": {
    name: "Result Clause",
    brief: "Look for signaling words (tam, ita, tantus)",
    detailed: "Students miss the setup words in the main clause. Drill recognition of tam, ita, tantus, talis as result clause signals.",
    keyPoints: ["Look for tam, ita, tantus, talis", "ut + subjunctive for result", "Main clause has signal word"],
  },
  "grammar:relative_clause": {
    name: "Relative Clause",
    brief: "Practice antecedent identification",
    detailed: "Students struggle to identify what the relative pronoun refers to. Practice: find the relative pronoun, then ask 'what noun does it point back to?'",
    keyPoints: ["Find relative pronoun (qui, quae, quod)", "Identify antecedent", "Pronoun agrees in gender/number"],
  },
  "grammar:subjunctive_relative_clause": {
    name: "Subjunctive Relative",
    brief: "Distinguish characteristic from regular relatives",
    detailed: "The 'type of person who' pattern needs explicit modeling. Show how the antecedent is often indefinite or generic.",
    keyPoints: ["Generic/indefinite antecedent", "'Type of person who...'", "Subjunctive marks characteristic"],
  },
  "grammar:gerund": {
    name: "Gerund",
    brief: "Verbal noun recognition (-ndi, -ndo forms)",
    detailed: "Students confuse gerunds with gerundives. Key: gerunds are verbal NOUNS (doing, of doing), while gerundives are verbal ADJECTIVES.",
    keyPoints: ["Verbal noun", "-ndi = genitive, -ndo = dative/ablative", "No noun to modify"],
  },
  "grammar:gerundive": {
    name: "Gerundive",
    brief: "Verbal adjective + obligation meaning",
    detailed: "Emphasize two uses: (1) with noun = 'to be [verb]ed', (2) dative of agent = passive periphrastic (must be done).",
    keyPoints: ["Verbal adjective", "Agrees with noun", "Often implies necessity"],
  },
  "grammar:gerund_gerundive_flip": {
    name: "Gerund/Gerundive Flip",
    brief: "Practice transforming between forms",
    detailed: "When gerund would take accusative object, Latin prefers gerundive construction. Drill the transformation: ad legendum librum → ad librum legendum.",
    keyPoints: ["Flip happens with accusative object", "ad + gerund → ad + noun + gerundive", "Meaning stays the same"],
  },
  "grammar:conditional_protasis": {
    name: "Conditional (Protasis)",
    brief: "If-clause recognition and mood analysis",
    detailed: "Students need systematic approach: find si/nisi, identify verb mood, determine condition type from mood combination.",
    keyPoints: ["Look for si/nisi", "Mood determines type", "Check apodosis too"],
  },
  "grammar:conditional_apodosis": {
    name: "Conditional (Apodosis)",
    brief: "Then-clause mood determines reality level",
    detailed: "The apodosis mood reveals how 'real' the condition is. Present indicative = real, imperfect subjunctive = present contrary-to-fact.",
    keyPoints: ["Mood shows reality level", "Match with protasis", "Time reference matters"],
  },
  "grammar:conditional_label": {
    name: "Conditional Types",
    brief: "Memorize the six type signatures",
    detailed: "Students need a clear chart: future more/less vivid, present/past simple, present/past contrary-to-fact. Create a reference card.",
    keyPoints: ["6 main types", "Mood + tense combination", "Use mnemonic device"],
  },
  // Vocabulary skills
  "vocab:general": {
    name: "General Vocabulary",
    brief: "Increase exposure frequency",
    detailed: "Low confidence across vocabulary suggests insufficient repetition. Implement daily vocab review routine with spaced repetition.",
    keyPoints: ["Daily review", "Spaced repetition", "Context sentences"],
  },
};

/**
 * Misconception-specific reteach suggestions.
 */
export const MISCONCEPTION_RETEACH = {
  boundary_confusion: {
    tag: "Boundary Confusion",
    suggestion: "Practice marking construction boundaries with different colors. Students need visual training on where constructions start and end.",
    quickFix: "Have students physically draw brackets around constructions before identifying them.",
  },
  type_confusion: {
    tag: "Type Confusion",
    suggestion: "Create a decision tree: 'Does it have X? Yes → Type A. No → Check for Y...' Students need systematic classification.",
    quickFix: "Provide a one-page construction identification flowchart.",
  },
  subtype_confusion: {
    tag: "Subtype Confusion",
    suggestion: "Subtype errors indicate surface recognition without deeper understanding. Review distinguishing features of each subtype.",
    quickFix: "Create side-by-side comparison examples of commonly confused subtypes.",
  },
  trigger_word_miss: {
    tag: "Trigger Word Blindness",
    suggestion: "Students aren't recognizing signal words. Create a 'watch for these' list and highlight them in practice texts.",
    quickFix: "Start class with trigger word bingo or flashcard warm-up.",
  },
  form_confusion: {
    tag: "Form Confusion",
    suggestion: "Grammatical form recognition is weak. Review paradigm charts and practice parsing exercises.",
    quickFix: "Daily parsing warm-up: 5 forms, identify person/number/tense/mood.",
  },
};

// ============================================================================
// AT-RISK STUDENT CRITERIA
// ============================================================================

/**
 * Thresholds for at-risk determination.
 * Based on model signals, not raw accuracy.
 */
const AT_RISK_THRESHOLDS = {
  lowConfidence: 40,           // Below 40% confidence
  lowExposure: 10,             // Fewer than 10 attempts
  highMisconceptionDensity: 3, // 3+ active misconceptions
  flatTrendWindow: 14,         // Days to check for flat/negative trend
  minAttemptsForTrend: 8,      // Need 8+ attempts to calculate trend
};

/**
 * Calculate confidence trend from events.
 * Returns: "improving" | "flat" | "declining"
 */
function calculateConfidenceTrend(events, windowDays = 14) {
  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const recent = events
    .filter((e) => e.eventType === "answer_submit" && e.timestamp > now - windowMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (recent.length < AT_RISK_THRESHOLDS.minAttemptsForTrend) {
    return "insufficient_data";
  }

  // Split into two halves
  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);

  const firstAcc = firstHalf.filter((e) => e.correct).length / firstHalf.length;
  const secondAcc = secondHalf.filter((e) => e.correct).length / secondHalf.length;

  const diff = secondAcc - firstAcc;

  if (diff > 0.1) return "improving";
  if (diff < -0.1) return "declining";
  return "flat";
}

/**
 * Determine if a student is at-risk based on model signals.
 */
function isAtRisk(userState, events, misconceptions) {
  const { summary, skills } = userState;

  // Check 1: Low overall confidence
  const avgConfidence = Object.values(skills).length > 0
    ? Object.values(skills).reduce((sum, s) => sum + s.confidence, 0) / Object.values(skills).length
    : 0;
  const lowConfidence = avgConfidence < AT_RISK_THRESHOLDS.lowConfidence;

  // Check 2: Low exposure
  const lowExposure = summary.totalAttempts < AT_RISK_THRESHOLDS.lowExposure;

  // Check 3: High misconception density
  const highMisconceptions = misconceptions.length >= AT_RISK_THRESHOLDS.highMisconceptionDensity;

  // Check 4: Negative or flat trend
  const trend = calculateConfidenceTrend(events, AT_RISK_THRESHOLDS.flatTrendWindow);
  const negativeTrend = trend === "declining" || trend === "flat";

  // At-risk if multiple signals present
  const riskScore = (lowConfidence ? 2 : 0) +
                    (lowExposure ? 1 : 0) +
                    (highMisconceptions ? 2 : 0) +
                    (negativeTrend ? 1 : 0);

  return {
    isAtRisk: riskScore >= 3,
    riskScore,
    factors: {
      lowConfidence,
      lowExposure,
      highMisconceptions,
      negativeTrend,
      trend,
    },
    avgConfidence,
    misconceptionCount: misconceptions.length,
  };
}

// ============================================================================
// CLASS AGGREGATION
// ============================================================================

/**
 * Aggregate student states into class-level insights.
 *
 * @param {Array<{studentId: string, name?: string}>} students - List of students
 * @returns {Object} Class insights
 */
export function aggregateClassInsights(students) {
  // Build state for each student
  const studentData = students.map((student) => {
    const events = loadLocalEvents().filter((e) => e.studentId === student.studentId);
    const userState = buildUserState({ studentId: student.studentId });
    const misconceptions = detectMisconceptions(student.studentId, null);
    const patterns = detectPatterns(student.studentId, null);
    const riskAssessment = isAtRisk(userState, events, misconceptions);

    return {
      studentId: student.studentId,
      name: student.name || student.studentId,
      userState,
      events,
      misconceptions,
      patterns,
      riskAssessment,
    };
  });

  // Aggregate skill difficulties
  const skillDifficulties = aggregateSkillDifficulties(studentData);

  // Aggregate misconceptions
  const misconceptionHeatList = aggregateMisconceptions(studentData);

  // Identify at-risk students
  const atRiskStudents = studentData
    .filter((s) => s.riskAssessment.isAtRisk)
    .sort((a, b) => b.riskAssessment.riskScore - a.riskAssessment.riskScore)
    .map((s) => ({
      studentId: s.studentId,
      name: s.name,
      riskScore: s.riskAssessment.riskScore,
      factors: s.riskAssessment.factors,
      avgConfidence: s.riskAssessment.avgConfidence,
      misconceptionCount: s.riskAssessment.misconceptionCount,
      totalAttempts: s.userState.summary.totalAttempts,
    }));

  // Generate teacher decisions
  const decisions = generateTeacherDecisions(skillDifficulties, misconceptionHeatList, atRiskStudents);

  return {
    studentCount: students.length,
    atRiskStudents,
    skillDifficulties,
    misconceptionHeatList,
    decisions,
    generatedAt: Date.now(),
  };
}

/**
 * Aggregate skill difficulties across class.
 */
function aggregateSkillDifficulties(studentData) {
  const skillStats = {};

  for (const student of studentData) {
    for (const [key, skill] of Object.entries(student.userState.skills)) {
      if (!skillStats[key]) {
        skillStats[key] = {
          skillId: skill.skillId,
          subskillId: skill.subskillId,
          totalStudents: 0,
          totalExposures: 0,
          totalConfidence: 0,
          studentsBelow50: 0,
          studentsBelow30: 0,
          recentAccuracies: [],
        };
      }

      skillStats[key].totalStudents++;
      skillStats[key].totalExposures += skill.exposures;
      skillStats[key].totalConfidence += skill.confidence;
      skillStats[key].recentAccuracies.push(skill.recentAccuracy);

      if (skill.confidence < 50) skillStats[key].studentsBelow50++;
      if (skill.confidence < 30) skillStats[key].studentsBelow30++;
    }
  }

  // Calculate averages and sort by difficulty
  const difficulties = Object.entries(skillStats)
    .map(([key, stats]) => ({
      skillId: stats.skillId,
      subskillId: stats.subskillId,
      key,
      avgConfidence: stats.totalStudents > 0
        ? Math.round(stats.totalConfidence / stats.totalStudents)
        : 0,
      avgAccuracy: stats.recentAccuracies.length > 0
        ? Math.round((stats.recentAccuracies.reduce((a, b) => a + b, 0) / stats.recentAccuracies.length) * 100)
        : 0,
      studentsStruggling: stats.studentsBelow50,
      studentsCritical: stats.studentsBelow30,
      totalStudents: stats.totalStudents,
      reteach: RETEACH_TEMPLATES[stats.skillId] || null,
    }))
    .filter((s) => s.totalStudents > 0)
    .sort((a, b) => a.avgConfidence - b.avgConfidence);

  return difficulties;
}

/**
 * Aggregate misconceptions into heat list.
 */
function aggregateMisconceptions(studentData) {
  const misconceptionCounts = {};

  for (const student of studentData) {
    for (const misconception of student.misconceptions) {
      const key = `${misconception.skillId}:${misconception.misconceptionId}`;

      if (!misconceptionCounts[key]) {
        misconceptionCounts[key] = {
          skillId: misconception.skillId,
          subskillId: misconception.subskillId,
          misconceptionId: misconception.misconceptionId,
          description: misconception.description,
          students: [],
          totalCount: 0,
        };
      }

      misconceptionCounts[key].students.push({
        studentId: student.studentId,
        name: student.name,
        count: misconception.count,
        confidence: misconception.confidence,
      });
      misconceptionCounts[key].totalCount += misconception.count;
    }
  }

  // Sort by number of affected students
  const heatList = Object.values(misconceptionCounts)
    .sort((a, b) => b.students.length - a.students.length)
    .map((item) => ({
      ...item,
      studentCount: item.students.length,
      reteach: MISCONCEPTION_RETEACH[item.misconceptionId] || {
        tag: item.description,
        suggestion: "Review examples and provide additional practice.",
        quickFix: "Individual check-ins with affected students.",
      },
    }));

  return heatList;
}

/**
 * Generate actionable teacher decisions.
 */
function generateTeacherDecisions(skillDifficulties, misconceptionHeatList, atRiskStudents) {
  const decisions = {
    reteachTomorrow: null,
    mostCommonMisconception: null,
    studentsToCheckIn: [],
  };

  // Reteach tomorrow: skill with most students struggling
  if (skillDifficulties.length > 0) {
    const topStruggle = skillDifficulties[0];
    if (topStruggle.studentsStruggling > 0 || topStruggle.avgConfidence < 50) {
      decisions.reteachTomorrow = {
        skillId: topStruggle.skillId,
        name: topStruggle.reteach?.name || topStruggle.skillId,
        reason: `${topStruggle.studentsStruggling} students below 50% confidence (class avg: ${topStruggle.avgConfidence}%)`,
        suggestion: topStruggle.reteach?.brief || "Review fundamentals",
        details: topStruggle.reteach?.detailed || null,
        keyPoints: topStruggle.reteach?.keyPoints || [],
      };
    }
  }

  // Most common misconception
  if (misconceptionHeatList.length > 0) {
    const topMisconception = misconceptionHeatList[0];
    decisions.mostCommonMisconception = {
      tag: topMisconception.reteach.tag,
      studentCount: topMisconception.studentCount,
      skillId: topMisconception.skillId,
      description: topMisconception.description,
      suggestion: topMisconception.reteach.suggestion,
      quickFix: topMisconception.reteach.quickFix,
    };
  }

  // Students to check in with (top 5 at-risk)
  decisions.studentsToCheckIn = atRiskStudents.slice(0, 5).map((s) => ({
    name: s.name,
    reason: generateCheckInReason(s.factors),
    riskScore: s.riskScore,
    confidence: s.avgConfidence,
  }));

  return decisions;
}

/**
 * Generate human-readable check-in reason.
 */
function generateCheckInReason(factors) {
  const reasons = [];

  if (factors.lowConfidence) reasons.push("low confidence");
  if (factors.negativeTrend) {
    if (factors.trend === "declining") reasons.push("declining performance");
    else reasons.push("no improvement");
  }
  if (factors.highMisconceptions) reasons.push("multiple misconceptions");
  if (factors.lowExposure) reasons.push("low engagement");

  if (reasons.length === 0) return "At-risk signals detected";
  return reasons.join(", ");
}

// ============================================================================
// DEMO DATA FOR TESTING
// ============================================================================

/**
 * Generate demo class data for testing.
 * In production, this would come from a class roster.
 */
export function getDemoClassRoster() {
  // In a real app, this would come from a database/API
  // For now, we'll simulate multiple students by using localStorage keys
  const allEvents = loadLocalEvents();
  const studentIds = [...new Set(allEvents.map((e) => e.studentId))];

  return studentIds.map((id, i) => ({
    studentId: id,
    name: `Student ${i + 1}`, // In production: real names from roster
  }));
}

/**
 * Get class insights for the current class.
 * Uses demo roster if no class management exists.
 */
export function getClassInsights() {
  const roster = getDemoClassRoster();

  if (roster.length === 0) {
    return {
      studentCount: 0,
      atRiskStudents: [],
      skillDifficulties: [],
      misconceptionHeatList: [],
      decisions: {
        reteachTomorrow: null,
        mostCommonMisconception: null,
        studentsToCheckIn: [],
      },
      generatedAt: Date.now(),
      isEmpty: true,
    };
  }

  return aggregateClassInsights(roster);
}

export default {
  aggregateClassInsights,
  getClassInsights,
  getDemoClassRoster,
  RETEACH_TEMPLATES,
  MISCONCEPTION_RETEACH,
};
