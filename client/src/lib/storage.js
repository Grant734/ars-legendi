// client/src/lib/storage.js
// Phase 9: Storage Abstraction Layer
// Provides a clean interface for data persistence that can swap between
// localStorage (current) and server-side storage (future).

// ============================================================================
// STORAGE PROVIDER INTERFACE
// ============================================================================

/**
 * Storage provider interface.
 * All providers must implement these methods.
 */
const StorageProviderInterface = {
  // Events
  saveEvents: async (studentId, events) => {},
  loadEvents: async (studentId) => [],
  appendEvent: async (studentId, event) => {},

  // Mastery state (cached computation)
  saveMasteryState: async (studentId, state) => {},
  loadMasteryState: async (studentId) => null,
  invalidateMasteryState: async (studentId) => {},

  // Student identity
  saveStudentIdentity: async (identity) => {},
  loadStudentIdentity: async () => null,

  // Teacher/Class data
  saveClassRoster: async (classId, roster) => {},
  loadClassRoster: async (classId) => [],
  saveClassInsights: async (classId, insights) => {},
  loadClassInsights: async (classId) => null,

  // Metadata
  getStorageType: () => "unknown",
  isServerSide: () => false,
};

// ============================================================================
// LOCAL STORAGE PROVIDER
// ============================================================================

const STORAGE_KEYS = {
  EVENTS: "latin_attempt_events",
  MASTERY_STATE: "latin_mastery_state_cache",
  STUDENT_IDENTITY: "latin_student_identity",
  GRAMMAR_PROGRESS: "grammar_progress",
  SEEN_EXCERPTS: "seen_excerpts",
  CLASS_ROSTER: "latin_class_roster",
  CLASS_INSIGHTS: "latin_class_insights",
};

/**
 * localStorage-based storage provider.
 * Current implementation - stores everything in browser localStorage.
 */
const LocalStorageProvider = {
  // ---- Events ----
  saveEvents: async (studentId, events) => {
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      return true;
    } catch (e) {
      console.error("[Storage] Failed to save events:", e);
      return false;
    }
  },

  loadEvents: async (studentId) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!raw) return [];
      const events = JSON.parse(raw);
      // Filter by studentId if provided
      if (studentId) {
        return events.filter((e) => e.studentId === studentId);
      }
      return events;
    } catch (e) {
      console.error("[Storage] Failed to load events:", e);
      return [];
    }
  },

  appendEvent: async (studentId, event) => {
    try {
      const events = await LocalStorageProvider.loadEvents();
      events.push(event);
      // Keep last 10000 events max
      const trimmed = events.slice(-10000);
      await LocalStorageProvider.saveEvents(studentId, trimmed);
      return true;
    } catch (e) {
      console.error("[Storage] Failed to append event:", e);
      return false;
    }
  },

  // ---- Mastery State (Cached) ----
  saveMasteryState: async (studentId, state) => {
    try {
      const key = `${STORAGE_KEYS.MASTERY_STATE}_${studentId}`;
      localStorage.setItem(key, JSON.stringify({
        ...state,
        cachedAt: Date.now(),
      }));
      return true;
    } catch (e) {
      console.error("[Storage] Failed to save mastery state:", e);
      return false;
    }
  },

  loadMasteryState: async (studentId) => {
    try {
      const key = `${STORAGE_KEYS.MASTERY_STATE}_${studentId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const state = JSON.parse(raw);

      // Check if cache is stale (5 minutes)
      const CACHE_TTL = 5 * 60 * 1000;
      if (Date.now() - (state.cachedAt || 0) > CACHE_TTL) {
        return null; // Stale cache
      }

      return state;
    } catch (e) {
      console.error("[Storage] Failed to load mastery state:", e);
      return null;
    }
  },

  invalidateMasteryState: async (studentId) => {
    try {
      const key = `${STORAGE_KEYS.MASTERY_STATE}_${studentId}`;
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  },

  // ---- Student Identity ----
  saveStudentIdentity: async (identity) => {
    try {
      localStorage.setItem(STORAGE_KEYS.STUDENT_IDENTITY, JSON.stringify(identity));
      return true;
    } catch (e) {
      return false;
    }
  },

  loadStudentIdentity: async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENT_IDENTITY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  // ---- Class Data ----
  saveClassRoster: async (classId, roster) => {
    try {
      const key = `${STORAGE_KEYS.CLASS_ROSTER}_${classId}`;
      localStorage.setItem(key, JSON.stringify(roster));
      return true;
    } catch (e) {
      return false;
    }
  },

  loadClassRoster: async (classId) => {
    try {
      const key = `${STORAGE_KEYS.CLASS_ROSTER}_${classId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  saveClassInsights: async (classId, insights) => {
    try {
      const key = `${STORAGE_KEYS.CLASS_INSIGHTS}_${classId}`;
      localStorage.setItem(key, JSON.stringify(insights));
      return true;
    } catch (e) {
      return false;
    }
  },

  loadClassInsights: async (classId) => {
    try {
      const key = `${STORAGE_KEYS.CLASS_INSIGHTS}_${classId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  // ---- Metadata ----
  getStorageType: () => "localStorage",
  isServerSide: () => false,
};

// ============================================================================
// SERVER STORAGE PROVIDER (FUTURE)
// ============================================================================

/**
 * Server-based storage provider.
 * This is a placeholder for future implementation.
 * When server storage is available, implement these methods with API calls.
 */
const ServerStorageProvider = {
  baseUrl: "/api", // Configure based on environment

  saveEvents: async (studentId, events) => {
    // Future: POST /api/students/{studentId}/events
    console.warn("[Storage] Server storage not implemented, falling back to localStorage");
    return LocalStorageProvider.saveEvents(studentId, events);
  },

  loadEvents: async (studentId) => {
    // Future: GET /api/students/{studentId}/events
    console.warn("[Storage] Server storage not implemented, falling back to localStorage");
    return LocalStorageProvider.loadEvents(studentId);
  },

  appendEvent: async (studentId, event) => {
    // Future: POST /api/students/{studentId}/events/append
    console.warn("[Storage] Server storage not implemented, falling back to localStorage");
    return LocalStorageProvider.appendEvent(studentId, event);
  },

  saveMasteryState: async (studentId, state) => {
    // Future: PUT /api/students/{studentId}/mastery
    return LocalStorageProvider.saveMasteryState(studentId, state);
  },

  loadMasteryState: async (studentId) => {
    // Future: GET /api/students/{studentId}/mastery
    return LocalStorageProvider.loadMasteryState(studentId);
  },

  invalidateMasteryState: async (studentId) => {
    // Future: DELETE /api/students/{studentId}/mastery/cache
    return LocalStorageProvider.invalidateMasteryState(studentId);
  },

  saveStudentIdentity: async (identity) => {
    // Future: This would integrate with real auth
    return LocalStorageProvider.saveStudentIdentity(identity);
  },

  loadStudentIdentity: async () => {
    // Future: GET /api/auth/me
    return LocalStorageProvider.loadStudentIdentity();
  },

  saveClassRoster: async (classId, roster) => {
    // Future: PUT /api/classes/{classId}/roster
    return LocalStorageProvider.saveClassRoster(classId, roster);
  },

  loadClassRoster: async (classId) => {
    // Future: GET /api/classes/{classId}/roster
    return LocalStorageProvider.loadClassRoster(classId);
  },

  saveClassInsights: async (classId, insights) => {
    // Future: PUT /api/classes/{classId}/insights
    return LocalStorageProvider.saveClassInsights(classId, insights);
  },

  loadClassInsights: async (classId) => {
    // Future: GET /api/classes/{classId}/insights
    return LocalStorageProvider.loadClassInsights(classId);
  },

  getStorageType: () => "server",
  isServerSide: () => true,
};

// ============================================================================
// STORAGE MANAGER
// ============================================================================

/**
 * Determines which storage provider to use based on configuration.
 */
let activeProvider = LocalStorageProvider;

/**
 * Configure the storage system.
 *
 * @param {Object} config
 * @param {string} config.type - "localStorage" | "server"
 * @param {string} [config.serverUrl] - Base URL for server storage
 */
export function configureStorage(config = {}) {
  const { type = "localStorage", serverUrl } = config;

  if (type === "server") {
    if (serverUrl) {
      ServerStorageProvider.baseUrl = serverUrl;
    }
    activeProvider = ServerStorageProvider;
  } else {
    activeProvider = LocalStorageProvider;
  }
}

/**
 * Get the current storage provider.
 */
export function getStorage() {
  return activeProvider;
}

/**
 * Check if currently using server storage.
 */
export function isServerStorage() {
  return activeProvider.isServerSide();
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Re-export provider methods for easy access
export const storage = {
  // Events
  saveEvents: (...args) => activeProvider.saveEvents(...args),
  loadEvents: (...args) => activeProvider.loadEvents(...args),
  appendEvent: (...args) => activeProvider.appendEvent(...args),

  // Mastery
  saveMasteryState: (...args) => activeProvider.saveMasteryState(...args),
  loadMasteryState: (...args) => activeProvider.loadMasteryState(...args),
  invalidateMasteryState: (...args) => activeProvider.invalidateMasteryState(...args),

  // Identity
  saveStudentIdentity: (...args) => activeProvider.saveStudentIdentity(...args),
  loadStudentIdentity: (...args) => activeProvider.loadStudentIdentity(...args),

  // Class
  saveClassRoster: (...args) => activeProvider.saveClassRoster(...args),
  loadClassRoster: (...args) => activeProvider.loadClassRoster(...args),
  saveClassInsights: (...args) => activeProvider.saveClassInsights(...args),
  loadClassInsights: (...args) => activeProvider.loadClassInsights(...args),

  // Metadata
  getStorageType: () => activeProvider.getStorageType(),
  isServerSide: () => activeProvider.isServerSide(),
};

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Export all local data for backup or migration.
 */
export async function exportAllData() {
  const identity = await LocalStorageProvider.loadStudentIdentity();
  const events = await LocalStorageProvider.loadEvents();

  return {
    exportedAt: Date.now(),
    version: "1.0",
    identity,
    events,
    grammarProgress: JSON.parse(localStorage.getItem(STORAGE_KEYS.GRAMMAR_PROGRESS) || "null"),
    seenExcerpts: JSON.parse(localStorage.getItem(STORAGE_KEYS.SEEN_EXCERPTS) || "null"),
  };
}

/**
 * Import data from export.
 */
export async function importData(data) {
  if (!data || data.version !== "1.0") {
    throw new Error("Invalid or unsupported data format");
  }

  if (data.identity) {
    await LocalStorageProvider.saveStudentIdentity(data.identity);
  }

  if (data.events) {
    await LocalStorageProvider.saveEvents(data.identity?.studentId, data.events);
  }

  if (data.grammarProgress) {
    localStorage.setItem(STORAGE_KEYS.GRAMMAR_PROGRESS, JSON.stringify(data.grammarProgress));
  }

  if (data.seenExcerpts) {
    localStorage.setItem(STORAGE_KEYS.SEEN_EXCERPTS, JSON.stringify(data.seenExcerpts));
  }

  return true;
}

/**
 * Clear all stored data.
 */
export async function clearAllData() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });

  // Clear any other latin_ prefixed keys
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("latin_") || key.startsWith("grammar_") || key.startsWith("seen_"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  return true;
}

export default {
  configureStorage,
  getStorage,
  isServerStorage,
  storage,
  exportAllData,
  importData,
  clearAllData,
  STORAGE_KEYS,
};
