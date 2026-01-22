// client/src/pages/TeacherDashboard.jsx
// Phase 8: Teacher Layer - Decision-oriented class insights
// Not charts. Just actionable decisions.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getClassInsights,
  RETEACH_TEMPLATES,
  MISCONCEPTION_RETEACH,
} from "../lib/classInsights";

// ============================================================================
// SKILL DISPLAY CONFIG
// ============================================================================

const SKILL_NAMES = {
  "grammar:cum_clause": "Cum Clause",
  "grammar:abl_abs": "Ablative Absolute",
  "grammar:indirect_statement": "Indirect Statement",
  "grammar:purpose_clause": "Purpose Clause",
  "grammar:result_clause": "Result Clause",
  "grammar:relative_clause": "Relative Clause",
  "grammar:subjunctive_relative_clause": "Subjunctive Relative",
  "grammar:gerund": "Gerund",
  "grammar:gerundive": "Gerundive",
  "grammar:gerund_gerundive_flip": "Gerund/Gerundive Flip",
  "grammar:conditional_protasis": "Conditional (Protasis)",
  "grammar:conditional_apodosis": "Conditional (Apodosis)",
  "grammar:conditional_label": "Conditional Types",
  "vocab:general": "Vocabulary",
};

// ============================================================================
// DECISION CARD COMPONENTS
// ============================================================================

function ReteachCard({ decision }) {
  const [expanded, setExpanded] = useState(false);

  if (!decision) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">✓</span>
          <h2 className="text-xl font-bold text-green-800">No Urgent Reteaching Needed</h2>
        </div>
        <p className="text-green-700">
          All skills are at acceptable confidence levels across the class.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-amber-600 text-sm font-medium uppercase tracking-wide mb-1">
            Reteach Tomorrow
          </p>
          <h2 className="text-2xl font-bold text-amber-900">{decision.name}</h2>
        </div>
        <span className="text-3xl">📚</span>
      </div>

      <p className="text-amber-800 mb-4">{decision.reason}</p>

      <div className="bg-white/60 rounded-lg p-4 mb-4">
        <p className="font-semibold text-amber-900 mb-2">Quick Suggestion:</p>
        <p className="text-amber-800">{decision.suggestion}</p>
      </div>

      {decision.keyPoints && decision.keyPoints.length > 0 && (
        <div className="mb-4">
          <p className="font-semibold text-amber-900 mb-2">Key Points to Cover:</p>
          <ul className="space-y-1">
            {decision.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-amber-800">
                <span className="text-amber-500 mt-1">•</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.details && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-600 text-sm hover:text-amber-800 underline"
        >
          {expanded ? "Hide details" : "Show detailed explanation"}
        </button>
      )}

      {expanded && decision.details && (
        <div className="mt-3 p-3 bg-white/40 rounded text-amber-800 text-sm">
          {decision.details}
        </div>
      )}
    </div>
  );
}

function MisconceptionCard({ decision }) {
  if (!decision) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">✓</span>
          <h2 className="text-xl font-bold text-green-800">No Common Misconceptions</h2>
        </div>
        <p className="text-green-700">
          No widespread misconception patterns detected across the class.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-red-600 text-sm font-medium uppercase tracking-wide mb-1">
            Most Common Misconception
          </p>
          <h2 className="text-2xl font-bold text-red-900">{decision.tag}</h2>
        </div>
        <span className="text-3xl">⚠️</span>
      </div>

      <p className="text-red-800 mb-2">
        <span className="font-semibold">{decision.studentCount} students</span> showing this pattern
      </p>
      <p className="text-red-700 text-sm mb-4">{decision.description}</p>

      <div className="bg-white/60 rounded-lg p-4 mb-3">
        <p className="font-semibold text-red-900 mb-2">Reteach Suggestion:</p>
        <p className="text-red-800">{decision.suggestion}</p>
      </div>

      <div className="bg-white/40 rounded-lg p-3">
        <p className="font-semibold text-red-900 mb-1 text-sm">Quick Fix:</p>
        <p className="text-red-800 text-sm">{decision.quickFix}</p>
      </div>
    </div>
  );
}

function CheckInCard({ students }) {
  if (!students || students.length === 0) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">✓</span>
          <h2 className="text-xl font-bold text-green-800">No At-Risk Students</h2>
        </div>
        <p className="text-green-700">
          All students are progressing well based on model signals.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-purple-600 text-sm font-medium uppercase tracking-wide mb-1">
            Students to Check In With
          </p>
          <h2 className="text-xl font-bold text-purple-900">
            {students.length} student{students.length !== 1 ? "s" : ""} need attention
          </h2>
        </div>
        <span className="text-3xl">👥</span>
      </div>

      <div className="space-y-3">
        {students.map((student, i) => (
          <div
            key={i}
            className="bg-white/60 rounded-lg p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-semibold text-purple-900">{student.name}</p>
              <p className="text-purple-700 text-sm capitalize">{student.reason}</p>
            </div>
            <div className="text-right">
              <div className="text-purple-900 font-bold">{Math.round(student.confidence)}%</div>
              <div className="text-purple-600 text-xs">confidence</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-purple-700 text-sm">
        Consider individual check-ins or small group remediation for these students.
      </p>
    </div>
  );
}

// ============================================================================
// MISCONCEPTION HEAT LIST
// ============================================================================

function MisconceptionHeatList({ heatList }) {
  if (!heatList || heatList.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b">
        <h2 className="text-xl font-bold text-gray-900">Class Misconception Heat List</h2>
        <p className="text-gray-600 text-sm mt-1">
          Misconceptions ranked by number of affected students
        </p>
      </div>

      <div className="divide-y">
        {heatList.slice(0, 8).map((item, i) => (
          <div key={i} className="px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.studentCount >= 5
                        ? "bg-red-100 text-red-800"
                        : item.studentCount >= 3
                        ? "bg-orange-100 text-orange-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {item.studentCount} student{item.studentCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {SKILL_NAMES[item.skillId] || item.skillId}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{item.reteach.tag}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
              <div
                className="ml-4 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{
                  background: `hsl(${Math.max(0, 120 - item.studentCount * 20)}, 70%, 90%)`,
                  color: `hsl(${Math.max(0, 120 - item.studentCount * 20)}, 70%, 30%)`,
                }}
              >
                {item.studentCount}
              </div>
            </div>

            <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
              <span className="font-medium text-gray-700">Reteach: </span>
              <span className="text-gray-600">{item.reteach.suggestion}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SKILL DIFFICULTY TABLE
// ============================================================================

function SkillDifficultyTable({ skills }) {
  if (!skills || skills.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b">
        <h2 className="text-xl font-bold text-gray-900">Skills by Class Difficulty</h2>
        <p className="text-gray-600 text-sm mt-1">
          Ranked by average confidence (lowest = most difficult)
        </p>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50 text-left text-sm text-gray-600">
          <tr>
            <th className="px-6 py-3 font-medium">Skill</th>
            <th className="px-4 py-3 font-medium text-center">Avg Confidence</th>
            <th className="px-4 py-3 font-medium text-center">Struggling</th>
            <th className="px-4 py-3 font-medium text-center">Critical</th>
            <th className="px-6 py-3 font-medium">Quick Reteach</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {skills.slice(0, 10).map((skill, i) => (
            <tr key={i} className={i < 3 ? "bg-red-50/50" : ""}>
              <td className="px-6 py-3">
                <span className="font-medium text-gray-900">
                  {SKILL_NAMES[skill.skillId] || skill.skillId}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`font-semibold ${
                    skill.avgConfidence < 40
                      ? "text-red-600"
                      : skill.avgConfidence < 60
                      ? "text-orange-600"
                      : "text-green-600"
                  }`}
                >
                  {skill.avgConfidence}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`px-2 py-0.5 rounded text-sm ${
                    skill.studentsStruggling > 0
                      ? "bg-orange-100 text-orange-800"
                      : "text-gray-400"
                  }`}
                >
                  {skill.studentsStruggling}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`px-2 py-0.5 rounded text-sm ${
                    skill.studentsCritical > 0
                      ? "bg-red-100 text-red-800"
                      : "text-gray-400"
                  }`}
                >
                  {skill.studentsCritical}
                </span>
              </td>
              <td className="px-6 py-3 text-sm text-gray-600">
                {skill.reteach?.brief || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeacherDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    loadInsights();
  }, []);

  function loadInsights() {
    setLoading(true);
    // In production, this would be an API call
    const data = getClassInsights();
    setInsights(data);
    setLastRefresh(new Date());
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading class insights...</div>
        </div>
      </div>
    );
  }

  if (!insights || insights.isEmpty) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-4">Teacher Dashboard</h1>
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <p className="text-gray-600 mb-4">
            No student data available yet. Students need to complete practice activities
            before class insights can be generated.
          </p>
          <Link
            to="/grammar-practice"
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Try the practice yourself →
          </Link>
        </div>
      </div>
    );
  }

  const { decisions, atRiskStudents, skillDifficulties, misconceptionHeatList, studentCount } = insights;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Class insights for {studentCount} student{studentCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right">
          <button
            onClick={loadInsights}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Refresh
          </button>
          {lastRefresh && (
            <p className="text-gray-500 text-sm mt-2">
              Updated {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Decision Cards - The Core Teacher View */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <ReteachCard decision={decisions.reteachTomorrow} />
        <MisconceptionCard decision={decisions.mostCommonMisconception} />
        <CheckInCard students={decisions.studentsToCheckIn} />
      </div>

      {/* Misconception Heat List */}
      {misconceptionHeatList.length > 0 && (
        <div className="mb-8">
          <MisconceptionHeatList heatList={misconceptionHeatList} />
        </div>
      )}

      {/* Skill Difficulty Table */}
      {skillDifficulties.length > 0 && (
        <div className="mb-8">
          <SkillDifficultyTable skills={skillDifficulties} />
        </div>
      )}

      {/* At-Risk Student Details (collapsible) */}
      {atRiskStudents.length > 0 && (
        <AtRiskStudentDetails students={atRiskStudents} />
      )}

      {/* Footer note about data source */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p>
          <strong>Note:</strong> These insights are generated from student practice data
          stored in the browser. In production, this would aggregate data from a class
          roster and server-side storage.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// AT-RISK STUDENT DETAILS (COLLAPSIBLE)
// ============================================================================

function AtRiskStudentDetails({ students }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-gray-50 px-6 py-4 border-b text-left flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div>
          <h2 className="text-xl font-bold text-gray-900">At-Risk Student Details</h2>
          <p className="text-gray-600 text-sm mt-1">
            {students.length} student{students.length !== 1 ? "s" : ""} flagged by model signals
          </p>
        </div>
        <span className="text-2xl text-gray-400">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="divide-y">
          {students.map((student, i) => (
            <div key={i} className="px-6 py-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{student.name}</h3>
                  <p className="text-gray-600 text-sm">{student.totalAttempts} total attempts</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-red-600">
                    {Math.round(student.avgConfidence)}%
                  </div>
                  <div className="text-gray-500 text-sm">avg confidence</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-sm">
                <FactorBadge
                  label="Confidence"
                  active={student.factors.lowConfidence}
                  activeText="Low"
                  inactiveText="OK"
                />
                <FactorBadge
                  label="Trend"
                  active={student.factors.negativeTrend}
                  activeText={student.factors.trend === "declining" ? "Declining" : "Flat"}
                  inactiveText="OK"
                />
                <FactorBadge
                  label="Misconceptions"
                  active={student.factors.highMisconceptions}
                  activeText={`${student.misconceptionCount} active`}
                  inactiveText="Few"
                />
                <FactorBadge
                  label="Engagement"
                  active={student.factors.lowExposure}
                  activeText="Low"
                  inactiveText="OK"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FactorBadge({ label, active, activeText, inactiveText }) {
  return (
    <div
      className={`p-2 rounded text-center ${
        active ? "bg-red-50 border border-red-200" : "bg-gray-50"
      }`}
    >
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-medium ${active ? "text-red-700" : "text-gray-600"}`}>
        {active ? activeText : inactiveText}
      </div>
    </div>
  );
}
