// client/src/pages/TeacherClassView.jsx
// Individual class view with student list and analytics

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useAuth from "../hooks/useAuth.jsx";
import * as authApi from "../lib/authApi";

// Abbreviated mastery view for individual students
function StudentMasteryPanel({ studentId, onClose }) {
  const [mastery, setMastery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMastery() {
      setLoading(true);
      setError("");
      try {
        const res = await authApi.getStudentMastery(studentId);
        if (res.ok) {
          setMastery(res.mastery);
        } else {
          setError(res.error || "Failed to load mastery");
        }
      } catch (e) {
        setError(e?.message || "Failed to load mastery");
      } finally {
        setLoading(false);
      }
    }
    loadMastery();
  }, [studentId]);

  if (loading) {
    return (
      <div style={{ padding: 16, background: "#fafafa", borderRadius: 8, marginTop: 8 }}>
        Loading mastery data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, background: "#ffebee", borderRadius: 8, marginTop: 8, color: "#c62828" }}>
        {error}
      </div>
    );
  }

  // Handle both array format (from server) and empty states
  const skillsArray = Array.isArray(mastery?.skills) ? mastery.skills : [];

  if (!mastery || skillsArray.length === 0) {
    return (
      <div style={{ padding: 16, background: "#fafafa", borderRadius: 8, marginTop: 8, color: "#666" }}>
        No mastery data yet. This student hasn't completed any practice activities.
      </div>
    );
  }

  // Skills are already sorted by accuracy (lowest first) from server
  const skillEntries = skillsArray;

  return (
    <div style={{ background: "#fafafa", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: "#e3f2fd", borderBottom: "1px solid #bbdefb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, color: "#1565c0" }}>Skill Mastery</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666" }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: 12 }}>
        {/* Overall stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e0e0e0" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1976d2" }}>{mastery.totalAttempts}</div>
            <div style={{ fontSize: 11, color: "#666" }}>Attempts</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: mastery.overallAccuracy >= 0.7 ? "#2e7d32" : mastery.overallAccuracy >= 0.5 ? "#f57c00" : "#c62828" }}>
              {mastery.overallAccuracy != null ? `${Math.round(mastery.overallAccuracy * 100)}%` : "-"}
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>Accuracy</div>
          </div>
        </div>
        {/* Skills breakdown */}
        {skillEntries.slice(0, 8).map((skill) => (
          <div
            key={skill.skillId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <div>
              <span style={{ fontSize: 13 }}>{getSkillLabel(skill.skillId)}</span>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({skill.attempts} attempts)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 60,
                  height: 6,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((skill.accuracy || 0) * 100)}%`,
                    height: "100%",
                    background:
                      skill.accuracy >= 0.7
                        ? "#4caf50"
                        : skill.accuracy >= 0.5
                        ? "#ff9800"
                        : "#f44336",
                    borderRadius: 3,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    skill.accuracy >= 0.7
                      ? "#2e7d32"
                      : skill.accuracy >= 0.5
                      ? "#f57c00"
                      : "#c62828",
                  minWidth: 36,
                  textAlign: "right",
                }}
              >
                {skill.accuracy != null ? `${Math.round(skill.accuracy * 100)}%` : "-"}
              </span>
            </div>
          </div>
        ))}
        {skillEntries.length > 8 && (
          <div style={{ fontSize: 12, color: "#888", paddingTop: 8 }}>
            +{skillEntries.length - 8} more skills
          </div>
        )}
      </div>
    </div>
  );
}

function formatPercent(val) {
  if (val == null) return "-";
  return `${Math.round(val * 100)}%`;
}

function formatDate(ts) {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    return "Today";
  }
  // Less than 48 hours
  if (diff < 48 * 60 * 60 * 1000) {
    return "Yesterday";
  }
  // Show date
  return d.toLocaleDateString();
}

function getSkillLabel(skillId) {
  const map = {
    "grammar:cum_clause": "Cum Clauses",
    "grammar:abl_abs": "Ablative Absolute",
    "grammar:indirect_statement": "Indirect Statement",
    "grammar:purpose_clause": "Purpose Clause",
    "grammar:result_clause": "Result Clause",
    "grammar:relative_clause": "Relative Clause",
    "grammar:conditional_protasis": "Conditionals (Protasis)",
    "grammar:conditional_apodosis": "Conditionals (Apodosis)",
    "vocab:general": "Vocabulary",
    "vocab:noun": "Nouns",
    "vocab:verb": "Verbs",
  };
  return map[skillId] || skillId;
}

export default function TeacherClassView() {
  const navigate = useNavigate();
  const { id: classId } = useParams();
  const { isLoggedIn, isTeacher } = useAuth();

  const [classInfo, setClassInfo] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCode, setShowCode] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState(null);

  const loadClassData = useCallback(async () => {
    if (!classId) return;

    setLoading(true);
    setError("");

    try {
      const [detailsRes, insightsRes] = await Promise.all([
        authApi.getClassDetails(classId),
        authApi.getClassInsights(classId),
      ]);

      if (detailsRes.ok) {
        setClassInfo(detailsRes.class);
      } else {
        setError(detailsRes.error || "Failed to load class");
        return;
      }

      if (insightsRes.ok) {
        setInsights(insightsRes.insights);
      }
    } catch (e) {
      setError(e?.message || "Failed to load class data");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login");
      return;
    }
    if (!isTeacher) {
      navigate("/profile");
      return;
    }

    loadClassData();
  }, [isLoggedIn, isTeacher, navigate, loadClassData]);

  const copyCode = () => {
    if (classInfo?.classCode) {
      navigator.clipboard.writeText(classInfo.classCode);
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ color: "#c62828", marginBottom: 16 }}>{error}</div>
        <Link to="/teacher-classes" style={{ color: "#1976d2" }}>
          Back to Classes
        </Link>
      </div>
    );
  }

  if (!classInfo) {
    return <div style={{ padding: 20 }}>Class not found</div>;
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          to="/teacher-classes"
          style={{ fontSize: 13, color: "#1976d2", textDecoration: "none" }}
        >
          &larr; Back to Classes
        </Link>

        <h2 style={{ marginTop: 8, marginBottom: 8 }}>{classInfo.name}</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, color: "#666" }}>
            {classInfo.students?.length || 0} students
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowCode(!showCode)}
              style={{
                background: "#f5f5f5",
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {showCode ? "Hide Code" : "Show Class Code"}
            </button>
            {showCode && (
              <>
                <code
                  style={{
                    background: "#e3f2fd",
                    padding: "4px 12px",
                    borderRadius: 4,
                    fontSize: 14,
                    letterSpacing: 1,
                    fontWeight: 600,
                  }}
                >
                  {classInfo.classCode}
                </code>
                <button
                  onClick={copyCode}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#1976d2",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Copy
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Class Insights */}
      {insights && (
        <div
          style={{
            background: "#1F2937",
            padding: 20,
            borderRadius: 12,
            marginBottom: 24,
            color: "#fff",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 16, color: "#F59E0B", fontWeight: 700 }}>Class Insights</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#F59E0B" }}>
                {insights.totalAttempts}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Total Attempts</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8, textAlign: "center" }}>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                color: insights.classAccuracy >= 0.7 ? "#4ade80" : insights.classAccuracy >= 0.5 ? "#fbbf24" : "#f87171"
              }}>
                {formatPercent(insights.classAccuracy)}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Class Accuracy</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#60a5fa" }}>
                {insights.studentCount}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Active Students</div>
            </div>
          </div>

          {/* Areas to Review - now using accuracy-based data */}
          {insights.areasToReview?.length > 0 && (
            <div style={{ background: "rgba(248,113,113,0.15)", padding: 16, borderRadius: 8 }}>
              <h4 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: "#fca5a5", fontWeight: 600 }}>
                Areas to Review (Below 70% Accuracy)
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {insights.areasToReview.map((s) => (
                  <div
                    key={s.skillId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(255,255,255,0.1)",
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{getSkillLabel(s.skillId)}</span>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#fca5a5" }}>
                        {Math.round((s.classAccuracy || 0) * 100)}% accuracy
                      </span>
                      {s.studentsStruggling > 0 && (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                          {s.studentsStruggling}/{s.totalStudents} struggling
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skill Breakdown */}
          {insights.skillBreakdown?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                Skill Performance Overview
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {insights.skillBreakdown.slice(0, 6).map((s) => (
                  <div
                    key={s.skillId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(255,255,255,0.05)",
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{getSkillLabel(s.skillId)}</span>
                    <span style={{
                      fontWeight: 600,
                      color: s.accuracy >= 0.7 ? "#4ade80" : s.accuracy >= 0.5 ? "#fbbf24" : "#f87171"
                    }}>
                      {s.accuracy != null ? `${Math.round(s.accuracy * 100)}%` : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student List */}
      <div>
        <h3 style={{ marginBottom: 12 }}>Students</h3>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          Click on a student to view their skill mastery.
        </p>

        {classInfo.students?.length === 0 ? (
          <div style={{ color: "#666", fontSize: 14 }}>
            No students have joined yet. Share the class code with your students!
          </div>
        ) : (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px 100px",
                background: "#f5f5f5",
                padding: "12px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderBottom: "1px solid #e0e0e0",
              }}
            >
              <div>Name</div>
              <div style={{ textAlign: "center" }}>Attempts</div>
              <div style={{ textAlign: "center" }}>Accuracy</div>
              <div style={{ textAlign: "center" }}>Last Active</div>
            </div>
            {/* Student rows */}
            {(insights?.students || classInfo.students || []).map((student) => {
              const s = insights?.students?.find((x) => x.studentId === student.studentId) || student;
              const isExpanded = expandedStudentId === s.studentId;
              return (
                <div key={s.studentId} style={{ borderBottom: "1px solid #eee" }}>
                  <div
                    onClick={() => setExpandedStudentId(isExpanded ? null : s.studentId)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 80px 100px",
                      padding: "12px 16px",
                      cursor: "pointer",
                      background: isExpanded ? "#f0f7ff" : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "#fafafa";
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                        {s.displayName}
                        <span style={{ fontSize: 11, color: "#888" }}>{isExpanded ? "▼" : "▶"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#888" }}>{student.email}</div>
                    </div>
                    <div style={{ textAlign: "center", alignSelf: "center" }}>
                      {s.attempts || 0}
                    </div>
                    <div style={{ textAlign: "center", alignSelf: "center" }}>
                      <span
                        style={{
                          color: s.accuracy == null
                            ? "#999"
                            : s.accuracy >= 0.7
                            ? "#2e7d32"
                            : s.accuracy >= 0.5
                            ? "#f57c00"
                            : "#c62828",
                        }}
                      >
                        {formatPercent(s.accuracy)}
                      </span>
                    </div>
                    <div style={{ textAlign: "center", alignSelf: "center", fontSize: 13, color: "#666" }}>
                      {formatDate(s.lastActive || student.lastActive)}
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <StudentMasteryPanel
                        studentId={s.studentId}
                        onClose={() => setExpandedStudentId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
