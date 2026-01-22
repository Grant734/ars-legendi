// server/routes/studentData.mjs
// Student data sync and mastery retrieval endpoints

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authMiddleware } from "./auth.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(express.json({ limit: "2mb" }));

const PILOT_DIR = path.join(__dirname, "..", "data", "pilot");
const STUDENT_EVENTS_DIR = path.join(PILOT_DIR, "student_events");

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { events: [], lastSyncAt: null };
  }
}

function safeWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

// ============================================================================
// SYNC EVENTS (Student pushes localStorage events to server)
// ============================================================================

router.post("/sync", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can sync events" });
    }

    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "Events array required" });
    }

    const studentId = req.user.id;
    const eventsFile = path.join(STUDENT_EVENTS_DIR, `${studentId}.json`);
    const existing = safeReadJson(eventsFile);

    // Merge events (dedupe by event id)
    const existingIds = new Set((existing.events || []).map((e) => e.id));
    const newEvents = events.filter((e) => e.id && !existingIds.has(e.id));

    const merged = [...(existing.events || []), ...newEvents];

    // Sort by timestamp and limit to last 10000 events
    merged.sort((a, b) => a.timestamp - b.timestamp);
    const trimmed = merged.slice(-10000);

    safeWriteJson(eventsFile, {
      studentId,
      events: trimmed,
      lastSyncAt: Date.now(),
    });

    return res.json({
      ok: true,
      syncedCount: newEvents.length,
      totalEvents: trimmed.length,
    });
  } catch (e) {
    console.error("Sync error:", e);
    return res.status(500).json({ error: "Sync failed" });
  }
});

// ============================================================================
// GET STUDENT MASTERY (Teacher can view, Student can view own)
// ============================================================================

router.get("/:studentId/mastery", authMiddleware, async (req, res) => {
  try {
    const targetStudentId = req.params.studentId;

    // Students can only view their own data
    if (req.user.role === "student" && req.user.id !== targetStudentId) {
      return res.status(403).json({ error: "Cannot view other student data" });
    }

    // Teachers can view any student in their classes
    // (For now, we allow teachers to view any student; in production, verify class membership)

    const eventsFile = path.join(STUDENT_EVENTS_DIR, `${targetStudentId}.json`);
    const data = safeReadJson(eventsFile);
    const events = data.events || [];

    // Calculate mastery metrics
    const answerEvents = events.filter((e) => e.eventType === "answer_submit");

    // Group by skill
    const bySkill = {};
    for (const e of answerEvents) {
      const sid = e.skillId || "unknown";
      if (!bySkill[sid]) {
        bySkill[sid] = { attempts: 0, correct: 0, lastAttempt: null };
      }
      bySkill[sid].attempts++;
      if (e.correct) bySkill[sid].correct++;
      if (!bySkill[sid].lastAttempt || e.timestamp > bySkill[sid].lastAttempt) {
        bySkill[sid].lastAttempt = e.timestamp;
      }
    }

    // Calculate accuracy per skill
    const skillMastery = Object.entries(bySkill).map(([skillId, stats]) => ({
      skillId,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: stats.attempts > 0 ? stats.correct / stats.attempts : null,
      lastAttempt: stats.lastAttempt,
    }));

    // Sort by accuracy (ascending - show struggles first)
    skillMastery.sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0));

    // Overall stats
    const totalAttempts = answerEvents.length;
    const totalCorrect = answerEvents.filter((e) => e.correct).length;

    return res.json({
      ok: true,
      mastery: {
        studentId: targetStudentId,
        totalAttempts,
        totalCorrect,
        overallAccuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
        skills: skillMastery,
        lastSyncAt: data.lastSyncAt,
      },
    });
  } catch (e) {
    console.error("Get mastery error:", e);
    return res.status(500).json({ error: "Failed to get mastery data" });
  }
});

// ============================================================================
// GET STUDENT EVENTS (for teacher dashboard drill-down)
// ============================================================================

router.get("/:studentId/events", authMiddleware, async (req, res) => {
  try {
    const targetStudentId = req.params.studentId;

    // Only teachers or the student themselves can view
    if (req.user.role === "student" && req.user.id !== targetStudentId) {
      return res.status(403).json({ error: "Cannot view other student data" });
    }

    const { limit = 100, skill, after } = req.query;

    const eventsFile = path.join(STUDENT_EVENTS_DIR, `${targetStudentId}.json`);
    const data = safeReadJson(eventsFile);
    let events = data.events || [];

    // Filter by skill if specified
    if (skill) {
      events = events.filter((e) => e.skillId === skill);
    }

    // Filter by timestamp if specified
    if (after) {
      const afterTs = Number(after);
      if (Number.isFinite(afterTs)) {
        events = events.filter((e) => e.timestamp > afterTs);
      }
    }

    // Sort by timestamp descending (most recent first)
    events.sort((a, b) => b.timestamp - a.timestamp);

    // Limit
    const limitNum = Math.min(Number(limit) || 100, 1000);
    events = events.slice(0, limitNum);

    return res.json({
      ok: true,
      events,
      count: events.length,
    });
  } catch (e) {
    console.error("Get events error:", e);
    return res.status(500).json({ error: "Failed to get events" });
  }
});

export default router;
