// Quiz configuration for each grammar lesson
// Each quiz generates 4 random sentences and tracks mastery

export const QUIZ_CONFIGS = {
  ablative_absolute: {
    quizId: "abl_abs_quiz",
    skillId: "abl_abs",
    constructionTypes: ["abl_abs"],
    instruction: "Identify the ablative absolute in each sentence. Click and drag to select the participle and noun that form the construction.",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the words that form the ablative absolute.",
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },

  cum_clauses: {
    quizId: "cum_clause_quiz",
    skillId: "cum_clause",
    constructionTypes: ["cum_clause"],
    instruction: "Find the cum clause in each sentence, then determine its type (temporal, causal, circumstantial, or concessive) from context.",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the cum clause.",
      },
      {
        type: "self_check",
        subskillId: null, // Not tracked for mastery
        prompt: "What type of cum clause is this? Select your answer, then compare with the translation.",
        options: [
          { value: "temporal", label: "Temporal (when)" },
          { value: "causal", label: "Causal (since/because)" },
          { value: "circumstantial", label: "Circumstantial" },
          { value: "concessive", label: "Concessive (although)" },
        ],
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },

  indirect_statement: {
    quizId: "indirect_statement_quiz",
    skillId: "indirect_statement",
    constructionTypes: ["indirect_statement"],
    instruction: "Locate the indirect statement (accusative subject + infinitive) in each sentence, then identify the tense of the infinitive.",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the indirect statement (accusative + infinitive construction).",
      },
      {
        type: "classify",
        subskillId: "classify",
        prompt: "What tense is the infinitive?",
        options: [
          { value: "present", label: "Present infinitive" },
          { value: "perfect", label: "Perfect infinitive" },
          { value: "future", label: "Future infinitive" },
        ],
        // Answer derived from token morphology at trigger.inf_index
        getCorrectAnswer: (construction, tokens) => {
          const infIndex = construction?.trigger?.inf_index;
          if (infIndex == null || !tokens?.[infIndex]) return null;
          const feats = tokens[infIndex].feats || "";
          if (feats.includes("Tense=Fut")) return "future";
          if (feats.includes("Tense=Past") || feats.includes("Aspect=Perf")) return "perfect";
          return "present";
        },
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },

  purpose_clauses: {
    quizId: "purpose_result_quiz",
    skillId: "purpose_clause",
    constructionTypes: ["purpose_clause", "result_clause"],
    instruction: "Find the subordinate clause in each sentence and determine whether it expresses purpose (ut/ne + subjunctive) or result (ut/ut non after a word of degree).",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the purpose or result clause.",
      },
      {
        type: "classify",
        subskillId: "classify",
        prompt: "Is this a purpose clause or a result clause?",
        options: [
          { value: "purpose_clause", label: "Purpose clause" },
          { value: "result_clause", label: "Result clause" },
        ],
        // Answer derived from construction.type
        getCorrectAnswer: (construction) => construction?.type || null,
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },

  gerunds_gerundives: {
    quizId: "gerund_gerundive_quiz",
    skillId: "gerund",
    constructionTypes: ["gerund", "gerundive", "gerund_gerundive_flip"],
    instruction: "Identify the verbal noun or verbal adjective construction, then classify it as a gerund, gerundive, or gerund-gerundive transformation.",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the gerund, gerundive, or gerund-gerundive flip.",
      },
      {
        type: "classify",
        subskillId: "classify",
        prompt: "What type of construction is this?",
        options: [
          { value: "gerund", label: "Gerund (verbal noun)" },
          { value: "gerundive", label: "Gerundive (verbal adjective)" },
          { value: "gerund_gerundive_flip", label: "Gerund-gerundive flip" },
        ],
        // Answer derived from construction.type
        getCorrectAnswer: (construction) => construction?.type || null,
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },

  relative_clauses: {
    quizId: "relative_clause_quiz",
    skillId: "relative_clause",
    constructionTypes: ["relative_clause"],
    instruction: "Find the relative clause in each sentence, then determine whether the verb is indicative (factual) or subjunctive (characteristic/purpose).",
    steps: [
      {
        type: "identify",
        subskillId: "identify",
        prompt: "Click on the relative clause.",
      },
      {
        type: "classify",
        subskillId: "classify",
        prompt: "Is the verb in the relative clause indicative or subjunctive?",
        options: [
          { value: "indicative", label: "Indicative" },
          { value: "subjunctive", label: "Subjunctive" },
        ],
        // Answer derived from construction.subtype
        getCorrectAnswer: (construction) => construction?.subtype || "indicative",
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
    classifyNote: "If subjunctive, consider whether it's characteristic or purpose.",
  },

  conditionals: {
    quizId: "conditionals_quiz",
    skillId: "conditionals",
    constructionTypes: ["conditional_protasis", "conditional_apodosis"],
    instruction: "Identify both parts of the conditional: first select the protasis (if-clause), then the apodosis (then-clause). Finally, classify the conditional type.",
    steps: [
      {
        type: "identify_pair",
        subskillId: "identify",
        prompt: "Click on the protasis (if-clause), then the apodosis (then-clause).",
        partLabels: {
          first: "Protasis (if-clause)",
          second: "Apodosis (then-clause)",
        },
      },
      {
        type: "classify",
        subskillId: "classify",
        prompt: "What type of conditional is this?",
        options: [
          { value: "simple_present", label: "Simple Present" },
          { value: "simple_past", label: "Simple Past" },
          { value: "future_more_vivid", label: "Future More Vivid" },
          { value: "future_less_vivid", label: "Future Less Vivid" },
          { value: "present_contrafactual", label: "Present Contrary-to-Fact" },
          { value: "past_contrafactual", label: "Past Contrary-to-Fact" },
          { value: "mixed", label: "Mixed" },
        ],
        // Answer derived from conditional.label
        getCorrectAnswer: (construction) => {
          const label = construction?.conditional?.label;
          if (!label) return "mixed";
          // Normalize some label variations
          if (label.includes("mixed")) return "mixed";
          return label;
        },
      },
    ],
    passingThreshold: 0.6,
    sentenceCount: 4,
  },
};

// Helper to get quiz config by lesson key
export function getQuizConfig(lessonKey) {
  return QUIZ_CONFIGS[lessonKey] || null;
}
