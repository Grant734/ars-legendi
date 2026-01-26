// client/src/lib/attemptEvents.js
// Phase 2: Universal logging pipeline for all learning attempts.
// This is the single source of truth for pedagogical data.
// Phase 9: Uses storage abstraction for backend-ready architecture.

import { getCurrentStudentId } from "./studentIdentity";
import { storage } from "./storage";
import { API_BASE_URL } from "./api";

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event types that create learning signal.
 */
export const EVENT_TYPES = {
  ANSWER_SUBMIT: "answer_submit",      // User submitted an answer (correct/incorrect)
  HINT_USED: "hint_used",              // User requested a hint
  REVEAL_USED: "reveal_used",          // User revealed the answer
  CHECK_ACTION: "check_action",        // Intermediate check (boundary, scaffold, etc.)
  MODE_SWITCH: "mode_switch",          // User switched practice mode
  SESSION_START: "session_start",      // Started a practice session
  SESSION_END: "session_end",          // Ended a practice session
};

// ============================================================================
// SKILL TAXONOMY
// ============================================================================

/**
 * Skills represent major learning areas.
 * Each skill can have multiple subskills representing different knowledge types.
 */
export const SKILLS = {
  // Grammar skills (one per construction type)
  GRAMMAR_CUM_CLAUSE: "grammar:cum_clause",
  GRAMMAR_ABL_ABS: "grammar:abl_abs",
  GRAMMAR_INDIRECT_STATEMENT: "grammar:indirect_statement",
  GRAMMAR_PURPOSE_CLAUSE: "grammar:purpose_clause",
  GRAMMAR_RESULT_CLAUSE: "grammar:result_clause",
  GRAMMAR_RELATIVE_CLAUSE: "grammar:relative_clause",
  GRAMMAR_SUBJUNCTIVE_RELATIVE: "grammar:subjunctive_relative_clause",
  GRAMMAR_GERUND: "grammar:gerund",
  GRAMMAR_GERUNDIVE: "grammar:gerundive",
  GRAMMAR_GERUND_GERUNDIVE_FLIP: "grammar:gerund_gerundive_flip",
  GRAMMAR_CONDITIONAL_PROTASIS: "grammar:conditional_protasis",
  GRAMMAR_CONDITIONAL_APODOSIS: "grammar:conditional_apodosis",
  GRAMMAR_CONDITIONAL_LABEL: "grammar:conditional_label",

  // Vocabulary skills (by word class)
  VOCAB_GENERAL: "vocab:general",
  VOCAB_NOUN: "vocab:noun",
  VOCAB_VERB: "vocab:verb",
  VOCAB_ADJECTIVE: "vocab:adjective",
  VOCAB_ADVERB: "vocab:adverb",
  VOCAB_PREPOSITION: "vocab:preposition",
  VOCAB_CONJUNCTION: "vocab:conjunction",

  // Reading comprehension
  READING_COMPREHENSION: "reading:comprehension",
};

/**
 * Subskills represent different types of knowledge within a skill.
 */
export const SUBSKILLS = {
  // Grammar subskills
  IDENTIFY: "identify",           // Recognize/locate the construction
  CLASSIFY: "classify",           // Identify type/subtype
  TRANSLATE: "translate",         // Produce English translation
  PRODUCE: "produce",             // Produce Latin

  // Vocabulary subskills
  RECOGNIZE: "recognize",         // Multiple choice recognition (L→E)
  RECALL: "recall",               // Typed recall (L→E)
  PRODUCE_LATIN: "produce_latin", // Produce Latin from English
  FORM_IDENTIFY: "form_identify", // Identify grammatical form
};

/**
 * Map construction types to skill IDs.
 */
export function getSkillForConstructionType(constructionType) {
  const map = {
    cum_clause: SKILLS.GRAMMAR_CUM_CLAUSE,
    abl_abs: SKILLS.GRAMMAR_ABL_ABS,
    indirect_statement: SKILLS.GRAMMAR_INDIRECT_STATEMENT,
    purpose_clause: SKILLS.GRAMMAR_PURPOSE_CLAUSE,
    result_clause: SKILLS.GRAMMAR_RESULT_CLAUSE,
    relative_clause: SKILLS.GRAMMAR_RELATIVE_CLAUSE,
    subjunctive_relative_clause: SKILLS.GRAMMAR_SUBJUNCTIVE_RELATIVE,
    gerund: SKILLS.GRAMMAR_GERUND,
    gerundive: SKILLS.GRAMMAR_GERUNDIVE,
    gerund_gerundive_flip: SKILLS.GRAMMAR_GERUND_GERUNDIVE_FLIP,
    conditional_protasis: SKILLS.GRAMMAR_CONDITIONAL_PROTASIS,
    conditional_apodosis: SKILLS.GRAMMAR_CONDITIONAL_APODOSIS,
    conditional_label: SKILLS.GRAMMAR_CONDITIONAL_LABEL,
  };
  return map[constructionType] || `grammar:${constructionType}`;
}

/**
 * Map word class to skill ID.
 */
export function getSkillForWordClass(wordClass) {
  const map = {
    noun: SKILLS.VOCAB_NOUN,
    verb: SKILLS.VOCAB_VERB,
    adjective: SKILLS.VOCAB_ADJECTIVE,
    adverb: SKILLS.VOCAB_ADVERB,
    preposition: SKILLS.VOCAB_PREPOSITION,
    conjunction: SKILLS.VOCAB_CONJUNCTION,
  };
  return map[wordClass] || `vocab:${wordClass}`;
}

// ============================================================================
// EVENT STORAGE
// Phase 9: Uses storage abstraction for backend-ready architecture.
// ============================================================================

const EVENTS_STORAGE_KEY = "latin_attempt_events_v1";
const MAX_LOCAL_EVENTS = 5000; // Keep last N events locally

/**
 * Load all events from local storage (synchronous for backward compatibility).
 */
export function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Load events from storage abstraction (async).
 * Useful when server storage is configured.
 */
export async function loadEventsAsync(studentId) {
  try {
    const events = await storage.loadEvents(studentId);
    return Array.isArray(events) ? events : [];
  } catch {
    // Fallback to local
    return loadLocalEvents().filter((e) => !studentId || e.studentId === studentId);
  }
}

/**
 * Save events to local storage (synchronous).
 */
function saveLocalEvents(events) {
  try {
    // Keep only the most recent events
    const trimmed = events.slice(-MAX_LOCAL_EVENTS);
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be full
  }
}

/**
 * Append an event to local storage.
 * Also syncs to storage abstraction asynchronously.
 */
function appendLocalEvent(event) {
  const events = loadLocalEvents();
  events.push(event);
  saveLocalEvents(events);

  // Also append to storage abstraction (async, non-blocking)
  storage.appendEvent(event.studentId, event).catch(() => {});

  // Notify listeners that state may have changed
  notifyEventLogged(event);
}

// ============================================================================
// EVENT NOTIFICATION (for cache invalidation)
// ============================================================================

let onEventLoggedCallback = null;

/**
 * Register a callback to be called when events are logged.
 * Used by userState.js to invalidate cache.
 */
export function setOnEventLogged(callback) {
  onEventLoggedCallback = callback;
}

/**
 * Notify that an event was logged.
 */
function notifyEventLogged(event) {
  if (typeof onEventLoggedCallback === "function") {
    try {
      onEventLoggedCallback(event);
    } catch {
      // Callback errors shouldn't break logging
    }
  }
}

// ============================================================================
// EVENT LOGGING
// ============================================================================

/**
 * @typedef {Object} AttemptEvent
 * @property {string} id - Unique event ID
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {string} studentId - Student identifier
 * @property {string} eventType - One of EVENT_TYPES
 * @property {string} mode - Practice mode (e.g., "grammar", "vocab", "reading")
 * @property {string} skillId - Skill being practiced
 * @property {string} subskillId - Subskill being practiced
 * @property {string} itemId - Specific item (lemma, construction instance ID)
 * @property {boolean} correct - Whether the attempt was correct
 * @property {number} [latencyMs] - Time taken to respond (ms)
 * @property {boolean} [hintUsed] - Whether a hint was used
 * @property {boolean} [revealed] - Whether answer was revealed
 * @property {string} [distractorChosen] - Wrong answer chosen (if applicable)
 * @property {string} [expectedAnswer] - Correct answer (for analysis)
 * @property {string} [userAnswer] - What user provided
 * @property {Object} [metadata] - Additional context-specific data
 * @property {string} [assignmentId] - Assignment ID if in assignment mode
 * @property {string} [attemptId] - Attempt ID for assignment tracking
 * @property {string} [excerptId] - Excerpt ID for reading/grammar practice
 */

/**
 * Generate a unique event ID.
 */
function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log an attempt event.
 * This is the universal logging function used by all practice modes.
 *
 * @param {Object} params
 * @param {string} params.eventType - One of EVENT_TYPES
 * @param {string} params.mode - Practice mode
 * @param {string} params.skillId - Skill ID
 * @param {string} params.subskillId - Subskill ID
 * @param {string} params.itemId - Specific item being practiced
 * @param {boolean} params.correct - Whether correct
 * @param {Object} [params.context] - Additional context
 * @returns {AttemptEvent} The logged event
 */
export function logAttemptEvent({
  eventType,
  mode,
  skillId,
  subskillId,
  itemId,
  correct,
  latencyMs,
  hintUsed,
  revealed,
  distractorChosen,
  expectedAnswer,
  userAnswer,
  assignmentId,
  attemptId,
  excerptId,
  metadata,
}) {
  const studentId = getCurrentStudentId({ assignmentId });

  const event = {
    id: generateEventId(),
    timestamp: Date.now(),
    studentId,
    eventType: eventType || EVENT_TYPES.ANSWER_SUBMIT,
    mode: mode || "unknown",
    skillId: skillId || "unknown",
    subskillId: subskillId || "unknown",
    itemId: itemId || "unknown",
    correct: !!correct,
    latencyMs: latencyMs != null ? Number(latencyMs) : null,
    hintUsed: !!hintUsed,
    revealed: !!revealed,
    distractorChosen: distractorChosen || null,
    expectedAnswer: expectedAnswer || null,
    userAnswer: userAnswer || null,
    assignmentId: assignmentId || null,
    attemptId: attemptId || null,
    excerptId: excerptId || null,
    metadata: metadata || null,
  };

  // Always store locally
  appendLocalEvent(event);

  // If in assignment mode, queue for server sync
  if (assignmentId) {
    queueServerSync(event);
  }

  return event;
}

// ============================================================================
// CONVENIENCE LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a correct answer submission.
 */
export function logCorrectAnswer(params) {
  return logAttemptEvent({
    ...params,
    eventType: EVENT_TYPES.ANSWER_SUBMIT,
    correct: true,
  });
}

/**
 * Log an incorrect answer submission.
 */
export function logIncorrectAnswer(params) {
  return logAttemptEvent({
    ...params,
    eventType: EVENT_TYPES.ANSWER_SUBMIT,
    correct: false,
  });
}

/**
 * Log a hint usage.
 */
export function logHintUsed(params) {
  return logAttemptEvent({
    ...params,
    eventType: EVENT_TYPES.HINT_USED,
    hintUsed: true,
    correct: false, // Hints don't count as correct
  });
}

/**
 * Log an answer reveal.
 */
export function logRevealUsed(params) {
  return logAttemptEvent({
    ...params,
    eventType: EVENT_TYPES.REVEAL_USED,
    revealed: true,
    correct: false, // Reveals don't count as correct
  });
}

/**
 * Log a check action (intermediate step).
 */
export function logCheckAction(params) {
  return logAttemptEvent({
    ...params,
    eventType: EVENT_TYPES.CHECK_ACTION,
  });
}

/**
 * Log a mode switch.
 */
export function logModeSwitch({ fromMode, toMode, studentId, assignmentId }) {
  return logAttemptEvent({
    eventType: EVENT_TYPES.MODE_SWITCH,
    mode: toMode,
    skillId: "system",
    subskillId: "navigation",
    itemId: `${fromMode}->${toMode}`,
    correct: true,
    assignmentId,
    metadata: { fromMode, toMode },
  });
}

/**
 * Log session start.
 */
export function logSessionStart({ mode, skillId, assignmentId, excerptId }) {
  return logAttemptEvent({
    eventType: EVENT_TYPES.SESSION_START,
    mode,
    skillId: skillId || mode,
    subskillId: "session",
    itemId: excerptId || `session_${Date.now()}`,
    correct: true,
    assignmentId,
    excerptId,
  });
}

/**
 * Log session end.
 */
export function logSessionEnd({ mode, skillId, assignmentId, excerptId, metadata }) {
  return logAttemptEvent({
    eventType: EVENT_TYPES.SESSION_END,
    mode,
    skillId: skillId || mode,
    subskillId: "session",
    itemId: excerptId || `session_${Date.now()}`,
    correct: true,
    assignmentId,
    excerptId,
    metadata,
  });
}

// ============================================================================
// SERVER SYNC (for assignment mode)
// ============================================================================

const SYNC_QUEUE_KEY = "latin_event_sync_queue";
const SYNC_BATCH_SIZE = 20;
const SYNC_DEBOUNCE_MS = 2000;

// Auth sync (for logged-in users)
const AUTH_SYNC_INTERVAL_MS = 30000; // 30 seconds
let authSyncIntervalId = null;
let lastAuthSyncTime = 0;

let syncTimeoutId = null;

/**
 * Get the sync queue.
 */
function getSyncQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save the sync queue.
 */
function saveSyncQueue(queue) {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

/**
 * Queue an event for server sync.
 */
function queueServerSync(event) {
  const queue = getSyncQueue();
  queue.push(event);
  saveSyncQueue(queue);

  // Debounce the sync
  if (syncTimeoutId) clearTimeout(syncTimeoutId);
  syncTimeoutId = setTimeout(flushSyncQueue, SYNC_DEBOUNCE_MS);
}

/**
 * Flush the sync queue to the server.
 */
export async function flushSyncQueue() {
  const queue = getSyncQueue();
  if (!queue.length) return;

  // Take a batch
  const batch = queue.slice(0, SYNC_BATCH_SIZE);
  const remaining = queue.slice(SYNC_BATCH_SIZE);

  try {
    // Group events by assignmentId for efficient API calls
    const byAssignment = {};
    for (const event of batch) {
      const aid = event.assignmentId;
      if (!aid) continue;
      if (!byAssignment[aid]) byAssignment[aid] = [];
      byAssignment[aid].push(event);
    }

    // Send to server for each assignment
    for (const [assignmentId, events] of Object.entries(byAssignment)) {
      await syncEventsToServer(assignmentId, events);
    }

    // Update queue with remaining events
    saveSyncQueue(remaining);

    // If there are more events, schedule another sync
    if (remaining.length) {
      syncTimeoutId = setTimeout(flushSyncQueue, SYNC_DEBOUNCE_MS);
    }
  } catch (e) {
    console.warn("Event sync failed, will retry:", e);
    // Keep events in queue for retry
  }
}

/**
 * Send events to the server.
 */
async function syncEventsToServer(assignmentId, events) {
  if (!events.length) return;

  const firstEvent = events[0];
  const studentName = firstEvent.metadata?.studentName || "";
  const studentId = firstEvent.studentId;
  const attemptId = firstEvent.attemptId;

  // Use the existing /assignments/event endpoint for each event
  // In a production system, you'd batch these into a single call
  for (const event of events) {
    try {
      await fetch(`${API_BASE_URL}/api/caesar/assignments/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          attemptId: event.attemptId || attemptId,
          studentName,
          studentId: event.studentId || studentId,
          event: {
            t: event.timestamp,
            type: event.eventType,
            skillId: event.skillId,
            subskillId: event.subskillId,
            itemId: event.itemId,
            correct: event.correct,
            latencyMs: event.latencyMs,
            hintUsed: event.hintUsed,
            revealed: event.revealed,
          },
        }),
      });
    } catch {
      // Individual event sync failed, continue with others
    }
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get events for a specific student.
 */
export function getEventsForStudent(studentId, options = {}) {
  const { skillId, subskillId, itemId, eventType, limit } = options;
  let events = loadLocalEvents().filter((e) => e.studentId === studentId);

  if (skillId) events = events.filter((e) => e.skillId === skillId);
  if (subskillId) events = events.filter((e) => e.subskillId === subskillId);
  if (itemId) events = events.filter((e) => e.itemId === itemId);
  if (eventType) events = events.filter((e) => e.eventType === eventType);

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => b.timestamp - a.timestamp);

  if (limit) events = events.slice(0, limit);

  return events;
}

/**
 * Get answer events only (no hints, reveals, etc.).
 */
export function getAnswerEvents(studentId, options = {}) {
  return getEventsForStudent(studentId, {
    ...options,
    eventType: EVENT_TYPES.ANSWER_SUBMIT,
  });
}

/**
 * Get events for a specific item.
 */
export function getItemHistory(studentId, itemId) {
  return getEventsForStudent(studentId, { itemId });
}

/**
 * Get recent accuracy for a skill.
 */
export function getSkillAccuracy(studentId, skillId, windowSize = 20) {
  const events = getAnswerEvents(studentId, { skillId, limit: windowSize });
  if (!events.length) return null;

  const correct = events.filter((e) => e.correct).length;
  return {
    accuracy: correct / events.length,
    correct,
    total: events.length,
    recentEvents: events,
  };
}

/**
 * Get item mastery status.
 * An item is mastered if the last N attempts were correct without hints/reveals.
 */
export function getItemMastery(studentId, itemId, requiredStreak = 2) {
  const events = getEventsForStudent(studentId, { itemId });

  // Filter to answer events only
  const answerEvents = events.filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT);

  if (answerEvents.length < requiredStreak) {
    return { mastered: false, streak: 0, attempts: answerEvents.length };
  }

  // Check if recent attempts were correct without hints/reveals
  const recent = answerEvents.slice(0, requiredStreak);
  const streak = recent.filter((e) => e.correct && !e.hintUsed && !e.revealed).length;

  return {
    mastered: streak >= requiredStreak,
    streak,
    attempts: answerEvents.length,
    lastAttempt: answerEvents[0] || null,
  };
}

/**
 * Get items that need review (recent misses or long time since seen).
 */
export function getItemsNeedingReview(studentId, skillId, options = {}) {
  const { maxAge = 7 * 24 * 60 * 60 * 1000, limit = 20 } = options;
  const now = Date.now();

  const events = getEventsForStudent(studentId, { skillId });

  // Group by itemId
  const byItem = {};
  for (const e of events) {
    if (!byItem[e.itemId]) byItem[e.itemId] = [];
    byItem[e.itemId].push(e);
  }

  const needsReview = [];

  for (const [itemId, itemEvents] of Object.entries(byItem)) {
    const answerEvents = itemEvents.filter((e) => e.eventType === EVENT_TYPES.ANSWER_SUBMIT);
    if (!answerEvents.length) continue;

    const lastEvent = answerEvents[0];
    const timeSinceLastAttempt = now - lastEvent.timestamp;

    // Needs review if: last attempt was wrong, or it's been too long
    const recentMiss = !lastEvent.correct;
    const stale = timeSinceLastAttempt > maxAge;

    if (recentMiss || stale) {
      needsReview.push({
        itemId,
        skillId,
        lastAttempt: lastEvent,
        reason: recentMiss ? "recent_miss" : "stale",
        timeSinceLastAttempt,
      });
    }
  }

  // Sort by priority (recent misses first, then by staleness)
  needsReview.sort((a, b) => {
    if (a.reason === "recent_miss" && b.reason !== "recent_miss") return -1;
    if (b.reason === "recent_miss" && a.reason !== "recent_miss") return 1;
    return b.timeSinceLastAttempt - a.timeSinceLastAttempt;
  });

  return needsReview.slice(0, limit);
}

/**
 * Clear all local events (use with caution).
 */
export function clearLocalEvents() {
  localStorage.removeItem(EVENTS_STORAGE_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

// ============================================================================
// AUTH SYNC (for logged-in students)
// ============================================================================

/**
 * Start periodic sync to server when user is logged in.
 * Call this when user logs in as a student.
 */
export function startAuthSync() {
  if (authSyncIntervalId) return; // Already running

  // Do an immediate sync
  syncEventsToAuth();

  // Set up periodic sync
  authSyncIntervalId = setInterval(syncEventsToAuth, AUTH_SYNC_INTERVAL_MS);
}

/**
 * Stop auth sync.
 * Call this when user logs out.
 */
export function stopAuthSync() {
  if (authSyncIntervalId) {
    clearInterval(authSyncIntervalId);
    authSyncIntervalId = null;
  }
}

/**
 * Sync events to server using auth API.
 */
async function syncEventsToAuth() {
  const token = localStorage.getItem("auth_token");
  if (!token) return;

  try {
    // Get events since last sync
    const events = loadLocalEvents();
    const eventsToSync = lastAuthSyncTime > 0
      ? events.filter((e) => e.timestamp > lastAuthSyncTime)
      : events;

    if (!eventsToSync.length) return;

    const res = await fetch(`${API_BASE_URL}/api/student/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: eventsToSync }),
    });

    if (res.ok) {
      lastAuthSyncTime = Date.now();
    }
  } catch {
    // Silently fail, will retry on next interval
  }
}

/**
 * Check if auth sync is enabled.
 */
export function isAuthSyncEnabled() {
  return authSyncIntervalId !== null;
}
