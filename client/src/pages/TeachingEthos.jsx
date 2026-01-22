// client/src/pages/TeachingEthos.jsx
// Phase 9: Teaching Ethos - Explain the mastery model and build credibility
// This page defends the app as a legitimate learning system, not a quiz app with stats.

import { Link } from "react-router-dom";

// ============================================================================
// MASTERY MODEL EXPLANATION
// ============================================================================

const MASTERY_MODEL = {
  name: "Bayesian Knowledge Tracing Lite (BKT-Lite)",
  summary: `Our mastery model uses a simplified Bayesian approach to estimate
    the probability that a student has learned each skill. Unlike simple
    percentage-correct scoring, this model accounts for learning over time,
    the reliability of different evidence types, and the decay of knowledge
    without practice.`,
  formula: `confidence = (recentAccuracy × 0.4) + (streakFactor × 0.25) +
    (exposureFactor × 0.2) + (recencyFactor × 0.15)`,
  components: [
    {
      name: "Recent Accuracy (40%)",
      description: "How well is the student performing on recent attempts? We look at the last 20 attempts, weighted toward more recent ones.",
      why: "Recent performance is the strongest signal of current knowledge state.",
    },
    {
      name: "Streak Factor (25%)",
      description: "Consecutive correct answers without hints indicate stable knowledge. We require 2+ correct in a row for mastery credit.",
      why: "Streaks distinguish genuine understanding from lucky guesses.",
    },
    {
      name: "Exposure Factor (20%)",
      description: "Has the student seen enough unique items? Low exposure means we can't reliably estimate mastery.",
      why: "A student who got 3/3 correct hasn't proven the same thing as one who got 30/30.",
    },
    {
      name: "Recency Factor (15%)",
      description: "Knowledge decays without practice. Skills not practiced in 7+ days receive a recency penalty.",
      why: "Spaced practice research shows that unused skills fade over time.",
    },
  ],
};

const EVIDENCE_RULES = {
  counts: [
    {
      evidence: "Correct answer without hints",
      impact: "Full positive credit toward mastery",
      reason: "Clean demonstration of knowledge.",
    },
    {
      evidence: "Correct answer with hint used",
      impact: "Reduced positive credit",
      reason: "Scaffolded success is valuable but doesn't prove independent recall.",
    },
    {
      evidence: "Incorrect answer",
      impact: "Negative signal, resets streak",
      reason: "Errors indicate gaps that need addressing.",
    },
    {
      evidence: "Fast incorrect answer (<3 seconds)",
      impact: "Flagged as potential guessing",
      reason: "Very fast errors suggest clicking without thinking.",
    },
  ],
  doesNotCount: [
    {
      evidence: "Revealed answers",
      impact: "No mastery credit, blocks item mastery",
      reason: "Seeing the answer teaches nothing about whether the student can recall it.",
    },
    {
      evidence: "Time spent reading hints",
      impact: "Not tracked for mastery",
      reason: "Reading time doesn't indicate learning occurred.",
    },
    {
      evidence: "Number of attempts alone",
      impact: "Not sufficient for mastery",
      reason: "A student can attempt 100 items and still not understand them.",
    },
  ],
};

const MASTERY_LEVELS = [
  {
    level: "Novice",
    range: "0-39%",
    meaning: "Just starting or struggling significantly",
    studentExperience: "See more scaffolding and simpler examples",
  },
  {
    level: "Learning",
    range: "40-64%",
    meaning: "Building understanding, inconsistent results",
    studentExperience: "Mix of practice types to solidify foundations",
  },
  {
    level: "Proficient",
    range: "65-84%",
    meaning: "Solid foundation, occasional errors",
    studentExperience: "More challenging items, less scaffolding",
  },
  {
    level: "Mastered",
    range: "85-100%",
    meaning: "Reliable, independent performance",
    studentExperience: "Maintenance practice to prevent decay",
  },
];

const RECOMMENDATION_LOGIC = {
  title: "Why Recommendations Aren't Random",
  summary: `Every recommendation is chosen to maximize expected mastery gain
    per minute of practice. The system analyzes your current state across all
    skills and selects the action most likely to move you forward efficiently.`,
  factors: [
    {
      name: "Skill Priority",
      description: "Skills with low confidence but high importance get priority.",
    },
    {
      name: "Pattern Detection",
      description: "If you're on a roll, we capitalize on momentum. If you're fatigued, we suggest smaller sets.",
    },
    {
      name: "Misconception Targeting",
      description: "When the model detects a specific confusion pattern, it recommends targeted practice.",
    },
    {
      name: "Spaced Practice",
      description: "Skills approaching the 'stale' threshold get review recommendations.",
    },
    {
      name: "Subskill Balance",
      description: "If you can identify but not translate, we'll suggest translation practice.",
    },
  ],
  notRandom: `The system never picks randomly. Even "explore new material"
    is chosen because coverage breadth is currently more valuable than
    depth for your learning state.`,
};

const LIMITATIONS = [
  {
    limitation: "Limited to observable behavior",
    explanation: "We can only measure what you do in the app. Deep understanding that you demonstrate elsewhere isn't captured.",
  },
  {
    limitation: "No reading comprehension tracking",
    explanation: "Currently tracks grammar recognition and vocabulary, but not whether you understand passage meaning.",
  },
  {
    limitation: "Local storage only",
    explanation: "Your data is stored in your browser. Clearing browser data will reset your progress.",
  },
  {
    limitation: "Single-student view",
    explanation: "The teacher dashboard aggregates browser data. True classroom integration requires server-side storage.",
  },
  {
    limitation: "Misconception detection is probabilistic",
    explanation: "We infer misconceptions from error patterns. The system may miss some or flag false positives.",
  },
  {
    limitation: "No production skill assessment",
    explanation: "We test recognition and identification, not written Latin production.",
  },
];

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-gray-600 mt-1">{subtitle}</p>}
    </div>
  );
}

function MasteryModelSection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title="The Mastery Model"
        subtitle="How we estimate what you know"
      />

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
        <h3 className="font-bold text-indigo-900 mb-2">{MASTERY_MODEL.name}</h3>
        <p className="text-indigo-800">{MASTERY_MODEL.summary}</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-6 font-mono text-sm">
        <p className="text-gray-600 mb-1">Confidence Score Formula:</p>
        <p className="text-gray-900">{MASTERY_MODEL.formula}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {MASTERY_MODEL.components.map((comp, i) => (
          <div key={i} className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2">{comp.name}</h4>
            <p className="text-gray-700 text-sm mb-2">{comp.description}</p>
            <p className="text-indigo-600 text-sm italic">Why: {comp.why}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EvidenceSection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title="What Counts as Evidence"
        subtitle="Not all interactions are equal"
      />

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2">
            <span className="text-xl">✓</span> Counts Toward Mastery
          </h3>
          <div className="space-y-3">
            {EVIDENCE_RULES.counts.map((item, i) => (
              <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-medium text-green-900">{item.evidence}</p>
                <p className="text-green-800 text-sm">{item.impact}</p>
                <p className="text-green-700 text-xs mt-1 italic">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-red-800 mb-4 flex items-center gap-2">
            <span className="text-xl">✗</span> Does NOT Count
          </h3>
          <div className="space-y-3">
            {EVIDENCE_RULES.doesNotCount.map((item, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-medium text-red-900">{item.evidence}</p>
                <p className="text-red-800 text-sm">{item.impact}</p>
                <p className="text-red-700 text-xs mt-1 italic">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MasteryLevelsSection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title="What 'Mastered' Means"
        subtitle="Clear definitions for each level"
      />

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Level</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Confidence</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">What It Means</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Your Experience</th>
            </tr>
          </thead>
          <tbody className="divide-y bg-white">
            {MASTERY_LEVELS.map((level, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <span className={`font-bold ${
                    level.level === "Mastered" ? "text-green-600" :
                    level.level === "Proficient" ? "text-blue-600" :
                    level.level === "Learning" ? "text-yellow-600" :
                    "text-gray-600"
                  }`}>
                    {level.level}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-sm">{level.range}</td>
                <td className="px-6 py-4 text-gray-700">{level.meaning}</td>
                <td className="px-6 py-4 text-gray-600 text-sm">{level.studentExperience}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-amber-800">
          <strong>Important:</strong> "Mastered" requires demonstrating consistent,
          independent success (2+ correct in a row without hints). A single correct
          answer, or success with heavy hint usage, does not indicate mastery.
        </p>
      </div>
    </section>
  );
}

function RecommendationSection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title={RECOMMENDATION_LOGIC.title}
        subtitle="Every suggestion is data-driven"
      />

      <p className="text-gray-700 mb-6">{RECOMMENDATION_LOGIC.summary}</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {RECOMMENDATION_LOGIC.factors.map((factor, i) => (
          <div key={i} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-900 mb-2">{factor.name}</h4>
            <p className="text-purple-800 text-sm">{factor.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 text-white rounded-xl p-6">
        <p className="font-medium">{RECOMMENDATION_LOGIC.notRandom}</p>
      </div>
    </section>
  );
}

function LimitationsSection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title="Limitations & Honest Caveats"
        subtitle="What this system cannot do"
      />

      <p className="text-gray-700 mb-6">
        No learning system is perfect. Here's what ours doesn't capture:
      </p>

      <div className="space-y-4">
        {LIMITATIONS.map((item, i) => (
          <div key={i} className="border-l-4 border-gray-300 pl-4 py-2">
            <h4 className="font-semibold text-gray-900">{item.limitation}</h4>
            <p className="text-gray-600 text-sm">{item.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataPrivacySection() {
  return (
    <section className="mb-12">
      <SectionHeader
        title="Your Data"
        subtitle="What we store and where"
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-blue-900 mb-3">Local Storage Only</h3>
        <p className="text-blue-800 mb-4">
          All your learning data is stored in your browser's localStorage. This means:
        </p>
        <ul className="space-y-2 text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Your data never leaves your device unless you explicitly export it
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Clearing browser data will erase your progress
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Progress doesn't sync between devices or browsers
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Teachers see aggregated data from students using the same browser session
          </li>
        </ul>
      </div>
    </section>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeachingEthos() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Teaching Philosophy & Technical Approach
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          This page explains how Caesar Atlas measures learning, makes recommendations,
          and what the system can and cannot do. We believe in transparency.
        </p>
      </div>

      {/* Quick navigation */}
      <div className="flex flex-wrap gap-2 justify-center mb-12">
        {[
          { label: "Mastery Model", href: "#mastery" },
          { label: "Evidence Rules", href: "#evidence" },
          { label: "Mastery Levels", href: "#levels" },
          { label: "Recommendations", href: "#recommendations" },
          { label: "Limitations", href: "#limitations" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm font-medium text-gray-700 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Core philosophy statement */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-8 mb-12">
        <h2 className="text-2xl font-bold mb-4">Our Core Belief</h2>
        <p className="text-lg leading-relaxed opacity-95">
          Learning Latin grammar is about building genuine understanding, not accumulating
          points. Our system rewards demonstrated knowledge—the ability to identify,
          classify, and understand constructions without scaffolding. We penalize shortcuts
          (reveals, hint dependency) because they don't build durable knowledge. The goal
          is mastery you can use when reading real Latin texts, not high scores.
        </p>
      </div>

      {/* Sections */}
      <div id="mastery">
        <MasteryModelSection />
      </div>
      <div id="evidence">
        <EvidenceSection />
      </div>
      <div id="levels">
        <MasteryLevelsSection />
      </div>
      <div id="recommendations">
        <RecommendationSection />
      </div>
      <div id="limitations">
        <LimitationsSection />
      </div>
      <DataPrivacySection />

      {/* Call to action */}
      <div className="text-center py-8 border-t">
        <p className="text-gray-600 mb-4">
          Ready to start building your Latin mastery?
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/grammar-practice"
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Start Practicing
          </Link>
          <Link
            to="/mastery"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            View My Mastery
          </Link>
        </div>
      </div>
    </div>
  );
}
