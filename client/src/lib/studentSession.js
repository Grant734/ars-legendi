// client/src/lib/studentSession.js
// Backward compatibility wrapper for studentIdentity.js
// Phase 1: This file now re-exports from the unified identity module.

import { getSoloStudentId, resetSoloStudentId } from "./studentIdentity";

/**
 * Get (or create) a stable student session ID.
 * @deprecated Use getStudentIdentity() from studentIdentity.js for full context.
 */
export function getStudentSessionId() {
  return getSoloStudentId();
}

/**
 * Reset the student session ID (creates a new one).
 */
export function resetStudentSessionId() {
  return resetSoloStudentId();
}

/**
 * Check if a student session ID exists.
 */
export function hasStudentSessionId() {
  return !!localStorage.getItem("latin_student_session_id");
}
