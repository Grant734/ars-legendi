// client/src/lib/studentIdentity.js
// Unified student identity management for solo and assignment modes.
// Phase 1: Standardize identity so mastery is per-human, not per-tab.

const SOLO_ID_KEY = "latin_student_session_id";
const ASSIGNMENT_NAME_PREFIX = "caesar_assignment_name__";
const ASSIGNMENT_ID_PREFIX = "caesar_assignment_studentId__";

// ============================================================================
// SOLO MODE IDENTITY
// ============================================================================

/**
 * Get (or create) a stable solo student session ID.
 * This ID persists in localStorage and survives page refreshes.
 */
export function getSoloStudentId() {
  let id = localStorage.getItem(SOLO_ID_KEY);
  if (!id) {
    id = `solo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SOLO_ID_KEY, id);
  }
  return id;
}

/**
 * Reset the solo student session ID (creates a new one).
 */
export function resetSoloStudentId() {
  localStorage.removeItem(SOLO_ID_KEY);
  return getSoloStudentId();
}

// ============================================================================
// ASSIGNMENT MODE IDENTITY
// ============================================================================

/**
 * Generate a deterministic student ID from assignment + name.
 * This ensures the same student always gets the same ID for a given assignment.
 */
async function hashStudentIdentity(assignmentId, studentName) {
  const normalized = `${assignmentId}::${studentName.trim().toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  // Use SubtleCrypto for consistent hashing
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return `assign_${hashHex.slice(0, 16)}`;
}

/**
 * Get stored student name for an assignment.
 */
export function getAssignmentStudentName(assignmentId) {
  return localStorage.getItem(`${ASSIGNMENT_NAME_PREFIX}${assignmentId}`) || "";
}

/**
 * Save student name for an assignment.
 */
export function setAssignmentStudentName(assignmentId, name) {
  localStorage.setItem(`${ASSIGNMENT_NAME_PREFIX}${assignmentId}`, name.trim());
}

/**
 * Get stored student ID for an assignment.
 * Returns null if not yet registered.
 */
export function getAssignmentStudentId(assignmentId) {
  return localStorage.getItem(`${ASSIGNMENT_ID_PREFIX}${assignmentId}`) || null;
}

/**
 * Register a student for an assignment (generates and stores stable ID).
 * Returns the student ID.
 */
export async function registerAssignmentStudent(assignmentId, studentName) {
  const name = studentName.trim();
  if (!name) throw new Error("Student name is required");

  // Generate deterministic ID
  const studentId = await hashStudentIdentity(assignmentId, name);

  // Store both name and ID
  localStorage.setItem(`${ASSIGNMENT_NAME_PREFIX}${assignmentId}`, name);
  localStorage.setItem(`${ASSIGNMENT_ID_PREFIX}${assignmentId}`, studentId);

  return studentId;
}

/**
 * Check if student is registered for an assignment.
 */
export function isRegisteredForAssignment(assignmentId) {
  const name = getAssignmentStudentName(assignmentId);
  const id = getAssignmentStudentId(assignmentId);
  return !!(name && id);
}

/**
 * Clear assignment registration (for testing or re-registration).
 */
export function clearAssignmentRegistration(assignmentId) {
  localStorage.removeItem(`${ASSIGNMENT_NAME_PREFIX}${assignmentId}`);
  localStorage.removeItem(`${ASSIGNMENT_ID_PREFIX}${assignmentId}`);
}

// ============================================================================
// UNIFIED IDENTITY API
// ============================================================================

/**
 * Identity context object returned by getStudentIdentity.
 * @typedef {Object} StudentIdentity
 * @property {string} studentId - Stable unique identifier
 * @property {string} studentName - Display name (for assignment mode) or "Solo Learner"
 * @property {"solo" | "assignment"} mode - Identity mode
 * @property {string | null} assignmentId - Assignment ID if in assignment mode
 * @property {boolean} isRegistered - Whether identity is fully registered
 */

/**
 * Get unified student identity based on context.
 *
 * @param {Object} context
 * @param {string | null} context.assignmentId - Assignment ID if in assignment mode
 * @returns {StudentIdentity}
 */
export function getStudentIdentity({ assignmentId = null } = {}) {
  if (assignmentId) {
    // Assignment mode
    const studentId = getAssignmentStudentId(assignmentId);
    const studentName = getAssignmentStudentName(assignmentId);

    return {
      studentId: studentId || null,
      studentName: studentName || "",
      mode: "assignment",
      assignmentId,
      isRegistered: !!(studentId && studentName),
    };
  }

  // Solo mode
  return {
    studentId: getSoloStudentId(),
    studentName: "Solo Learner",
    mode: "solo",
    assignmentId: null,
    isRegistered: true, // Solo mode is always "registered"
  };
}

/**
 * Get just the student ID for the current context.
 * Shorthand for getStudentIdentity().studentId
 */
export function getCurrentStudentId({ assignmentId = null } = {}) {
  const identity = getStudentIdentity({ assignmentId });
  return identity.studentId;
}

// ============================================================================
// REACT HOOK HELPERS
// ============================================================================

/**
 * Create identity context from URL search params.
 * Useful for extracting assignmentId from URL.
 */
export function getIdentityContextFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const assignmentId = params.get("assignment") || null;
  return { assignmentId };
}
