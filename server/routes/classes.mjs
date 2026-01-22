// server/routes/classes.mjs
// Class management endpoints for teachers and students

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { authMiddleware } from "./auth.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

const PILOT_DIR = path.join(__dirname, "..", "data", "pilot");
const CLASSES_FILE = path.join(PILOT_DIR, "classes.json");
const STUDENTS_FILE = path.join(PILOT_DIR, "students.json");
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
    return {};
  }
}

function safeWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function generateClassCode() {
  // 6-character alphanumeric code
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// ============================================================================
// CREATE CLASS (Teacher only)
// ============================================================================

router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only teachers can create classes" });
    }

    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Class name required" });
    }

    const classes = safeReadJson(CLASSES_FILE);
    const classId = generateId("class");
    const classCode = generateClassCode();

    // Ensure class code is unique
    let attempts = 0;
    let finalCode = classCode;
    while (Object.values(classes).some((c) => c.classCode === finalCode) && attempts < 10) {
      finalCode = generateClassCode();
      attempts++;
    }

    classes[classId] = {
      classId,
      teacherId: req.user.id,
      name: String(name).trim(),
      classCode: finalCode,
      createdAt: Date.now(),
      studentIds: [],
    };

    safeWriteJson(CLASSES_FILE, classes);

    return res.json({
      ok: true,
      class: {
        classId,
        name: classes[classId].name,
        classCode: finalCode,
        createdAt: classes[classId].createdAt,
        studentCount: 0,
      },
    });
  } catch (e) {
    console.error("Create class error:", e);
    return res.status(500).json({ error: "Failed to create class" });
  }
});

// ============================================================================
// LIST CLASSES (Teacher sees their classes, Student sees joined classes)
// ============================================================================

router.get("/", authMiddleware, async (req, res) => {
  try {
    const classes = safeReadJson(CLASSES_FILE);
    const students = safeReadJson(STUDENTS_FILE);

    if (req.user.role === "teacher") {
      // Return all classes owned by this teacher
      const teacherClasses = Object.values(classes)
        .filter((c) => c.teacherId === req.user.id)
        .map((c) => ({
          classId: c.classId,
          name: c.name,
          classCode: c.classCode,
          createdAt: c.createdAt,
          studentCount: (c.studentIds || []).length,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);

      return res.json({ ok: true, classes: teacherClasses });
    } else {
      // Return classes the student has joined
      const student = Object.values(students).find((s) => s.studentId === req.user.id);
      if (!student) {
        return res.json({ ok: true, classes: [] });
      }

      const studentClasses = (student.classIds || [])
        .map((cid) => classes[cid])
        .filter(Boolean)
        .map((c) => ({
          classId: c.classId,
          name: c.name,
          joinedAt: student.joinedDates?.[c.classId] || null,
        }));

      return res.json({ ok: true, classes: studentClasses });
    }
  } catch (e) {
    console.error("List classes error:", e);
    return res.status(500).json({ error: "Failed to list classes" });
  }
});

// ============================================================================
// JOIN CLASS (Student only)
// ============================================================================

router.post("/join", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can join classes" });
    }

    const { code } = req.body;
    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: "Class code required" });
    }

    const codeNorm = String(code).trim().toUpperCase();
    const classes = safeReadJson(CLASSES_FILE);
    const students = safeReadJson(STUDENTS_FILE);

    // Find class by code
    const foundClass = Object.values(classes).find((c) => c.classCode === codeNorm);
    if (!foundClass) {
      return res.status(404).json({ error: "Invalid class code" });
    }

    // Find student
    const studentEmail = req.user.email;
    const student = students[studentEmail];
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if already joined
    if (student.classIds?.includes(foundClass.classId)) {
      return res.status(400).json({ error: "Already joined this class" });
    }

    // Add student to class
    if (!student.classIds) student.classIds = [];
    if (!student.joinedDates) student.joinedDates = {};

    student.classIds.push(foundClass.classId);
    student.joinedDates[foundClass.classId] = Date.now();

    // Add student to class's student list
    if (!foundClass.studentIds) foundClass.studentIds = [];
    if (!foundClass.studentIds.includes(student.studentId)) {
      foundClass.studentIds.push(student.studentId);
    }

    safeWriteJson(STUDENTS_FILE, students);
    safeWriteJson(CLASSES_FILE, classes);

    return res.json({
      ok: true,
      class: {
        classId: foundClass.classId,
        name: foundClass.name,
        joinedAt: student.joinedDates[foundClass.classId],
      },
    });
  } catch (e) {
    console.error("Join class error:", e);
    return res.status(500).json({ error: "Failed to join class" });
  }
});

// ============================================================================
// GET CLASS DETAILS (Teacher only - includes student list)
// ============================================================================

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only teachers can view class details" });
    }

    const classId = req.params.id;
    const classes = safeReadJson(CLASSES_FILE);
    const students = safeReadJson(STUDENTS_FILE);

    const cls = classes[classId];
    if (!cls) {
      return res.status(404).json({ error: "Class not found" });
    }

    if (cls.teacherId !== req.user.id) {
      return res.status(403).json({ error: "Not your class" });
    }

    // Get student details
    const studentList = (cls.studentIds || [])
      .map((sid) => {
        const student = Object.values(students).find((s) => s.studentId === sid);
        if (!student) return null;
        return {
          studentId: student.studentId,
          displayName: student.displayName,
          email: student.email,
          joinedAt: student.joinedDates?.[classId] || null,
          lastActive: student.lastLoginAt,
        };
      })
      .filter(Boolean);

    return res.json({
      ok: true,
      class: {
        classId: cls.classId,
        name: cls.name,
        classCode: cls.classCode,
        createdAt: cls.createdAt,
        students: studentList,
      },
    });
  } catch (e) {
    console.error("Get class error:", e);
    return res.status(500).json({ error: "Failed to get class details" });
  }
});

// ============================================================================
// GET CLASS INSIGHTS (Teacher only - aggregated analytics)
// ============================================================================

router.get("/:id/insights", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only teachers can view insights" });
    }

    const classId = req.params.id;
    const classes = safeReadJson(CLASSES_FILE);
    const students = safeReadJson(STUDENTS_FILE);

    const cls = classes[classId];
    if (!cls) {
      return res.status(404).json({ error: "Class not found" });
    }

    if (cls.teacherId !== req.user.id) {
      return res.status(403).json({ error: "Not your class" });
    }

    // Aggregate student data
    const studentInsights = [];
    let totalAttempts = 0;
    let totalCorrect = 0;

    // Track skill-level stats across all students
    const skillStats = {};  // { skillId: { attempts, correct, studentCount, studentsStruggling } }

    for (const sid of cls.studentIds || []) {
      const student = Object.values(students).find((s) => s.studentId === sid);
      if (!student) continue;

      // Load student events
      const eventsFile = path.join(STUDENT_EVENTS_DIR, `${sid}.json`);
      const events = safeReadJson(eventsFile);
      const eventList = Array.isArray(events) ? events : events.events || [];

      // Calculate metrics
      const answers = eventList.filter((e) => e.eventType === "answer_submit");
      const correct = answers.filter((e) => e.correct).length;
      const accuracy = answers.length > 0 ? correct / answers.length : null;

      totalAttempts += answers.length;
      totalCorrect += correct;

      // Track per-skill stats for this student
      const studentSkillStats = {};
      for (const e of answers) {
        if (!e.skillId) continue;
        if (!studentSkillStats[e.skillId]) {
          studentSkillStats[e.skillId] = { attempts: 0, correct: 0 };
        }
        studentSkillStats[e.skillId].attempts++;
        if (e.correct) studentSkillStats[e.skillId].correct++;
      }

      // Aggregate into class-level skill stats
      for (const [skillId, stats] of Object.entries(studentSkillStats)) {
        if (!skillStats[skillId]) {
          skillStats[skillId] = { attempts: 0, correct: 0, studentCount: 0, studentsStruggling: 0 };
        }
        skillStats[skillId].attempts += stats.attempts;
        skillStats[skillId].correct += stats.correct;
        skillStats[skillId].studentCount++;

        // Mark struggling if accuracy < 60% with at least 3 attempts
        const skillAccuracy = stats.attempts > 0 ? stats.correct / stats.attempts : 0;
        if (stats.attempts >= 3 && skillAccuracy < 0.6) {
          skillStats[skillId].studentsStruggling++;
        }
      }

      // Find last activity timestamp from events
      const lastEventTime = eventList.length > 0
        ? Math.max(...eventList.map(e => e.timestamp || 0))
        : null;

      studentInsights.push({
        studentId: sid,
        displayName: student.displayName,
        attempts: answers.length,
        correct,
        accuracy,
        lastActive: lastEventTime || student.lastLoginAt,
      });
    }

    // Calculate skill-level insights
    const skillInsights = Object.entries(skillStats)
      .map(([skillId, stats]) => ({
        skillId,
        attempts: stats.attempts,
        correct: stats.correct,
        accuracy: stats.attempts > 0 ? stats.correct / stats.attempts : null,
        studentCount: stats.studentCount,
        studentsStruggling: stats.studentsStruggling,
      }))
      .filter(s => s.attempts >= 5)  // Only show skills with meaningful data
      .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0));  // Lowest accuracy first

    // Areas to review: skills where class accuracy is below 70%
    const areasToReview = skillInsights
      .filter(s => s.accuracy !== null && s.accuracy < 0.7)
      .slice(0, 5)
      .map(s => ({
        skillId: s.skillId,
        classAccuracy: s.accuracy,
        studentsStruggling: s.studentsStruggling,
        totalStudents: s.studentCount,
      }));

    return res.json({
      ok: true,
      insights: {
        classId,
        className: cls.name,
        studentCount: (cls.studentIds || []).length,
        totalAttempts,
        totalCorrect,
        classAccuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
        areasToReview,
        skillBreakdown: skillInsights.slice(0, 10),  // Top 10 skills by need
        students: studentInsights,
      },
    });
  } catch (e) {
    console.error("Get insights error:", e);
    return res.status(500).json({ error: "Failed to get insights" });
  }
});

export default router;
