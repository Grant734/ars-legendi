// client/src/lib/constructionTooltips.js
// Phase 9: Structured tooltips with misconception-aware "why" explanations
// Provides context-sensitive help tied to what the model knows about the student

import { detectMisconceptions, MISCONCEPTION_TYPES } from "./adaptiveFeedback";
import { getCurrentStudentId } from "./studentIdentity";

// ============================================================================
// CONSTRUCTION EXPLANATIONS
// ============================================================================

/**
 * Base explanations for each construction type.
 * Each has: what it is, how to identify, common signals.
 */
export const CONSTRUCTION_INFO = {
  cum_clause: {
    name: "Cum Clause",
    brief: "A subordinate clause introduced by 'cum' (when/since/although)",
    identification: [
      "Look for 'cum' followed by a verb",
      "Check the verb mood: indicative = temporal, subjunctive = causal/concessive",
      "The clause describes circumstances around the main action",
    ],
    signals: ["cum + verb", "temporal/causal relationship to main clause"],
    example: "Cum Caesar veniret, hostes fugerunt. (When Caesar was arriving, the enemies fled.)",
  },
  abl_abs: {
    name: "Ablative Absolute",
    brief: "A noun + participle in the ablative, grammatically independent from the main clause",
    identification: [
      "Find a noun and participle both in ablative case",
      "Check that neither is the subject/object of the main verb",
      "The phrase can be removed without breaking the main sentence",
    ],
    signals: ["ablative noun + ablative participle", "often at sentence start", "no grammatical connection to main clause"],
    example: "His rebus cognitis, Caesar profectus est. (These things having been learned, Caesar departed.)",
  },
  indirect_statement: {
    name: "Indirect Statement (Accusative + Infinitive)",
    brief: "Reports what someone said/thought/perceived, with accusative subject and infinitive verb",
    identification: [
      "Find a head verb (saying, thinking, perceiving, knowing)",
      "Look for an accusative that serves as subject of the infinitive",
      "The infinitive tense shows time relative to the head verb",
    ],
    signals: ["head verb + accusative + infinitive", "verbs of saying/thinking"],
    example: "Dicit eum venire. (He says that he is coming.)",
  },
  purpose_clause: {
    name: "Purpose Clause",
    brief: "Explains WHY an action is done, using ut/ne + subjunctive",
    identification: [
      "Look for ut (positive) or ne (negative) + subjunctive",
      "Ask: 'In order to do what?' or 'For what purpose?'",
      "No signal word (tam, ita) in the main clause",
    ],
    signals: ["ut/ne + subjunctive", "answers 'why?' or 'for what purpose?'"],
    example: "Venit ut videret. (He came in order to see.)",
  },
  result_clause: {
    name: "Result Clause",
    brief: "Shows the RESULT or consequence of an action, signaled by tam/ita/tantus in main clause",
    identification: [
      "Look for a signal word in the main clause (tam, ita, tantus, talis, tot)",
      "Find ut + subjunctive describing the result",
      "Ask: 'With what result?' or 'So that what happened?'",
    ],
    signals: ["tam/ita/tantus + ut + subjunctive", "signal word required"],
    example: "Tam fortis erat ut hostes vincerent. (He was so brave that they defeated the enemies.)",
  },
  relative_clause: {
    name: "Relative Clause",
    brief: "A clause that describes or modifies a noun using a relative pronoun",
    identification: [
      "Find a relative pronoun (qui, quae, quod, etc.)",
      "Identify its antecedent (the noun it refers back to)",
      "The pronoun agrees with its antecedent in gender and number",
    ],
    signals: ["qui/quae/quod + verb", "pronoun refers back to a noun"],
    example: "Miles qui venit fortis erat. (The soldier who came was brave.)",
  },
  subjunctive_relative_clause: {
    name: "Relative Clause of Characteristic",
    brief: "Describes a TYPE of person/thing, not a specific one, using subjunctive",
    identification: [
      "The antecedent is indefinite, generic, or negative (nemo, quis, etc.)",
      "The relative clause uses subjunctive mood",
      "Translates as 'the sort of person who...' or 'such a thing that...'",
    ],
    signals: ["generic antecedent + qui/quae/quod + subjunctive"],
    example: "Nemo est qui hoc nesciat. (There is no one who does not know this.)",
  },
  gerund: {
    name: "Gerund",
    brief: "A verbal noun (-ing), used in oblique cases where infinitive can't go",
    identification: [
      "Look for -ndi, -ndo, -ndum endings",
      "Functions as a noun (genitive, dative, accusative with preposition, ablative)",
      "Does NOT have a noun to modify (that would be gerundive)",
    ],
    signals: ["-nd- stem without modifying a noun", "used after prepositions"],
    example: "Ad legendum venit. (He came for the purpose of reading.)",
  },
  gerundive: {
    name: "Gerundive",
    brief: "A verbal adjective meaning 'to be [verb]ed', often expressing necessity",
    identification: [
      "Look for -ndus/-nda/-ndum agreeing with a noun",
      "Often with dative of agent = 'must be done by...'",
      "The noun is what would be the object if the verb were active",
    ],
    signals: ["-nd- form agreeing with noun", "dative of agent"],
    example: "Liber legendus est mihi. (The book must be read by me.)",
  },
  gerund_gerundive_flip: {
    name: "Gerund/Gerundive Transformation",
    brief: "When gerund would have accusative object, Latin prefers gerundive construction",
    identification: [
      "Look for ad + noun + gerundive (instead of ad + gerund + accusative)",
      "The meaning is identical, just different structure",
      "More common in Classical Latin than gerund with object",
    ],
    signals: ["ad + noun + gerundive = ad + gerund + object"],
    example: "Ad librum legendum (= ad legendum librum) - for reading the book",
  },
  conditional_protasis: {
    name: "Conditional Protasis (If-Clause)",
    brief: "The 'if' part of a conditional sentence, introduced by si/nisi",
    identification: [
      "Find si (if) or nisi (if not, unless)",
      "Note the mood and tense of the verb",
      "Mood determines what type of conditional it is",
    ],
    signals: ["si/nisi + verb", "sets up the condition"],
    example: "Si veniat... (If he should come...)",
  },
  conditional_apodosis: {
    name: "Conditional Apodosis (Then-Clause)",
    brief: "The 'then' part of a conditional sentence, the result of the condition",
    identification: [
      "The main clause that depends on the protasis",
      "Mood shows how 'real' the speaker considers the condition",
      "Match with protasis to determine conditional type",
    ],
    signals: ["main clause following si-clause", "mood reveals reality level"],
    example: "...laetus essem. (...I would be happy.)",
  },
  conditionals: {
    name: "Conditional Sentence",
    brief: "An if-then statement with specific mood/tense combinations indicating reality level",
    identification: [
      "Find both protasis (if-clause) and apodosis (then-clause)",
      "Check mood in both clauses",
      "Use the combination to determine the type",
    ],
    signals: ["si/nisi + subjunctive/indicative patterns"],
    example: "Si hoc credis, erras. (If you believe this, you are wrong.)",
  },
};

// ============================================================================
// MISCONCEPTION-SPECIFIC CLARIFICATIONS
// ============================================================================

/**
 * Additional clarifications when a specific misconception is detected.
 * These address the exact confusion the student is having.
 */
export const MISCONCEPTION_CLARIFICATIONS = {
  [MISCONCEPTION_TYPES.BOUNDARY_CONFUSION]: {
    general: "Focus on finding the complete construction boundaries. Where does it start and end?",
    byType: {
      abl_abs: "The ablative absolute ends when you reach words that are grammatically connected to the main clause. Look for the participial phrase as a unit.",
      cum_clause: "The cum clause includes everything from 'cum' to the verb it governs. Don't stop too early.",
      indirect_statement: "The indirect statement includes the accusative subject AND everything the infinitive governs.",
    },
  },
  [MISCONCEPTION_TYPES.TYPE_CONFUSION]: {
    general: "Make sure you're checking the defining features of each construction type, not just surface similarities.",
    byType: {
      purpose_clause: "Purpose clauses answer 'why?' and have NO signal word in the main clause. If you see tam/ita/tantus, it's a RESULT clause.",
      result_clause: "Result clauses REQUIRE a signal word (tam, ita, tantus) in the main clause. No signal = probably purpose.",
      cum_clause: "Check the mood: indicative cum = temporal ('when'), subjunctive cum = causal/concessive ('since/although').",
    },
  },
  [MISCONCEPTION_TYPES.SUBTYPE_CONFUSION]: {
    general: "Look carefully at the distinguishing features of each subtype.",
    byType: {
      gerund: "Gerunds are verbal NOUNS (no noun to modify). Gerundives are verbal ADJECTIVES (agree with a noun).",
      relative_clause: "Check for a generic/indefinite antecedent - that signals characteristic (subjunctive), not standard indicative.",
    },
  },
  [MISCONCEPTION_TYPES.TRIGGER_WORD_MISS]: {
    general: "Look for the signal words that mark each construction type.",
    byType: {
      result_clause: "Always scan the main clause for tam, ita, tantus, talis, tot before deciding on purpose vs. result.",
      indirect_statement: "Head verbs (dico, puto, sentio, video, etc.) signal an indirect statement is coming.",
    },
  },
  [MISCONCEPTION_TYPES.FORM_CONFUSION]: {
    general: "Review the morphology carefully. The form's ending tells you its grammatical function.",
    byType: {
      abl_abs: "Both the noun AND participle must be ablative. Check both endings.",
      gerund: "Gerund endings: -ndi (gen), -ndo (dat/abl), -ndum (acc with prep). No nominative exists.",
    },
  },
};

// ============================================================================
// TOOLTIP GENERATOR
// ============================================================================

/**
 * Generate a context-aware tooltip for a construction.
 *
 * @param {string} constructionType - The type of construction (e.g., "abl_abs")
 * @param {Object} options
 * @param {boolean} [options.checkMisconceptions=true] - Whether to check for student misconceptions
 * @param {string} [options.studentId] - Student ID for misconception lookup
 * @returns {Object} Tooltip content
 */
export function getConstructionTooltip(constructionType, options = {}) {
  const { checkMisconceptions = true, studentId } = options;
  const info = CONSTRUCTION_INFO[constructionType];

  if (!info) {
    return {
      name: constructionType,
      brief: "Construction information not available.",
      identification: [],
      signals: [],
      misconceptionNote: null,
    };
  }

  let misconceptionNote = null;

  // Check for student-specific misconceptions
  if (checkMisconceptions) {
    const sid = studentId || getCurrentStudentId();
    const skillId = `grammar:${constructionType}`;

    try {
      const misconceptions = detectMisconceptions(sid, skillId);

      if (misconceptions.length > 0) {
        // Find the most relevant misconception
        const topMisconception = misconceptions[0];
        const clarification = MISCONCEPTION_CLARIFICATIONS[topMisconception.misconceptionId];

        if (clarification) {
          misconceptionNote = {
            type: topMisconception.misconceptionId,
            description: topMisconception.description,
            clarification: clarification.byType?.[constructionType] || clarification.general,
          };
        }
      }
    } catch {
      // Misconception detection failed, continue without it
    }
  }

  return {
    ...info,
    misconceptionNote,
  };
}

/**
 * Generate a quick "why this is X" explanation for in-practice tooltips.
 *
 * @param {string} constructionType - The type of construction
 * @param {Object} constructionData - Data about the specific instance
 * @returns {string} Short explanation
 */
export function getQuickWhyExplanation(constructionType, constructionData = {}) {
  const info = CONSTRUCTION_INFO[constructionType];
  if (!info) return `This is a ${constructionType}.`;

  // Generate contextual explanation based on what's in the construction
  const explanations = {
    abl_abs: () => {
      if (constructionData.participle && constructionData.noun) {
        return `This is an ablative absolute: "${constructionData.noun}" (ablative noun) + "${constructionData.participle}" (ablative participle), grammatically independent from the main clause.`;
      }
      return "This is an ablative absolute: a noun + participle in the ablative, separate from the main clause grammar.";
    },
    cum_clause: () => {
      const mood = constructionData.mood || "subjunctive";
      if (mood === "indicative") {
        return "This is a temporal cum clause (indicative mood): 'when' + past action.";
      }
      return "This is a causal/concessive cum clause (subjunctive mood): 'since/although' + circumstance.";
    },
    indirect_statement: () => {
      return "This is an indirect statement: a head verb + accusative subject + infinitive, reporting speech/thought.";
    },
    purpose_clause: () => {
      return "This is a purpose clause: ut + subjunctive, expressing intention ('in order to...').";
    },
    result_clause: () => {
      return "This is a result clause: signaled by tam/ita/tantus in the main clause, ut + subjunctive shows the consequence.";
    },
    relative_clause: () => {
      return "This is a relative clause: qui/quae/quod + verb, describing or identifying a noun.";
    },
    subjunctive_relative_clause: () => {
      return "This is a relative clause of characteristic: subjunctive mood indicates 'the type of person who...'";
    },
    gerund: () => {
      return "This is a gerund: a verbal noun (-ndi/-ndo/-ndum) functioning as a noun.";
    },
    gerundive: () => {
      return "This is a gerundive: a verbal adjective (-ndus/-nda/-ndum) meaning 'to be [verb]ed' or expressing obligation.";
    },
    gerund_gerundive_flip: () => {
      return "This is a gerund/gerundive transformation: the gerundive construction replaces gerund + accusative object.";
    },
    conditional_protasis: () => {
      return "This is a protasis (if-clause): si/nisi + verb sets up the condition.";
    },
    conditional_apodosis: () => {
      return "This is an apodosis (then-clause): the result that follows if the condition is met.";
    },
    conditionals: () => {
      const label = constructionData.conditionalLabel;
      if (label) {
        const labelNames = {
          future_more_vivid: "future more vivid (likely future)",
          future_less_vivid: "future less vivid (hypothetical future)",
          present_simple: "present simple (general truth)",
          past_simple: "past simple (general past truth)",
          present_contrafactual: "present contrary-to-fact (not happening now)",
          past_contrafactual: "past contrary-to-fact (didn't happen)",
        };
        return `This is a ${labelNames[label] || label} conditional sentence.`;
      }
      return "This is a conditional sentence (if-then) with a specific mood pattern indicating reality level.";
    },
  };

  const generator = explanations[constructionType];
  return generator ? generator() : info.brief;
}

// ============================================================================
// BOUNDARY INDICATOR HELPERS
// ============================================================================

/**
 * Get visual boundary indicators for a construction.
 * Returns characters/styles to use for marking construction start/end.
 */
export const BOUNDARY_INDICATORS = {
  abl_abs: { start: "[", end: "]", color: "purple" },
  cum_clause: { start: "{", end: "}", color: "blue" },
  indirect_statement: { start: "(", end: ")", color: "green" },
  purpose_clause: { start: "ut:", end: ":ut", color: "teal" },
  result_clause: { start: "R[", end: "]R", color: "orange" },
  relative_clause: { start: "<", end: ">", color: "indigo" },
  subjunctive_relative_clause: { start: "<<", end: ">>", color: "pink" },
  gerund: { start: "G(", end: ")G", color: "amber" },
  gerundive: { start: "Gv(", end: ")Gv", color: "lime" },
  conditional_protasis: { start: "if[", end: "]", color: "cyan" },
  conditional_apodosis: { start: "[", end: "]then", color: "rose" },
};

/**
 * Get a visual legend for construction highlighting.
 */
export function getHighlightLegend() {
  return Object.entries(CONSTRUCTION_INFO).map(([type, info]) => ({
    type,
    name: info.name,
    boundary: BOUNDARY_INDICATORS[type] || { start: "[", end: "]", color: "gray" },
  }));
}

export default {
  CONSTRUCTION_INFO,
  MISCONCEPTION_CLARIFICATIONS,
  getConstructionTooltip,
  getQuickWhyExplanation,
  BOUNDARY_INDICATORS,
  getHighlightLegend,
};
