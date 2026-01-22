// server/routes/auth.mjs
// Authentication endpoints for students and teachers

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

const PILOT_DIR = path.join(__dirname, "..", "data", "pilot");
const STUDENTS_FILE = path.join(PILOT_DIR, "students.json");
const TEACHERS_FILE = path.join(PILOT_DIR, "teachers.json");

// JWT secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || "latin-edu-jwt-secret-change-in-prod";

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

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(salt + password).digest("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

// Simple JWT implementation
function createToken(payload, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Date.now() + expiresInMs;
  const data = { ...payload, exp };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

// Middleware to extract user from token
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

// Optional auth - doesn't fail if no token
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

// ============================================================================
// REGISTRATION
// ============================================================================

router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const userRole = role === "teacher" ? "teacher" : "student";

    // Check if user already exists
    if (userRole === "teacher") {
      const teachers = safeReadJson(TEACHERS_FILE);
      if (teachers[emailNorm]) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Create teacher account
      const salt = generateSalt();
      const pwHash = hashPassword(password, salt);
      const teacherId = generateId("teacher");

      teachers[emailNorm] = {
        teacherId,
        email: emailNorm,
        displayName: displayName || emailNorm.split("@")[0],
        salt,
        pwHash,
        createdAt: Date.now(),
        lastLoginAt: null,
      };

      safeWriteJson(TEACHERS_FILE, teachers);

      const token = createToken({ id: teacherId, email: emailNorm, role: "teacher" });
      return res.json({
        ok: true,
        token,
        user: {
          id: teacherId,
          email: emailNorm,
          displayName: teachers[emailNorm].displayName,
          role: "teacher",
        },
      });
    } else {
      // Create student account
      const students = safeReadJson(STUDENTS_FILE);
      if (students[emailNorm]) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const salt = generateSalt();
      const pwHash = hashPassword(password, salt);
      const studentId = generateId("student");

      students[emailNorm] = {
        studentId,
        email: emailNorm,
        displayName: displayName || emailNorm.split("@")[0],
        salt,
        pwHash,
        createdAt: Date.now(),
        lastLoginAt: null,
        classIds: [],
        joinedDates: {},
      };

      safeWriteJson(STUDENTS_FILE, students);

      const token = createToken({ id: studentId, email: emailNorm, role: "student" });
      return res.json({
        ok: true,
        token,
        user: {
          id: studentId,
          email: emailNorm,
          displayName: students[emailNorm].displayName,
          role: "student",
        },
      });
    }
  } catch (e) {
    console.error("Register error:", e);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// ============================================================================
// LOGIN
// ============================================================================

router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const userRole = role === "teacher" ? "teacher" : "student";

    if (userRole === "teacher") {
      const teachers = safeReadJson(TEACHERS_FILE);
      const teacher = teachers[emailNorm];

      if (!teacher) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const pwHash = hashPassword(password, teacher.salt);
      if (pwHash !== teacher.pwHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last login
      teacher.lastLoginAt = Date.now();
      safeWriteJson(TEACHERS_FILE, teachers);

      const token = createToken({ id: teacher.teacherId, email: emailNorm, role: "teacher" });
      return res.json({
        ok: true,
        token,
        user: {
          id: teacher.teacherId,
          email: emailNorm,
          displayName: teacher.displayName,
          role: "teacher",
        },
      });
    } else {
      const students = safeReadJson(STUDENTS_FILE);
      const student = students[emailNorm];

      if (!student) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const pwHash = hashPassword(password, student.salt);
      if (pwHash !== student.pwHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last login
      student.lastLoginAt = Date.now();
      safeWriteJson(STUDENTS_FILE, students);

      const token = createToken({ id: student.studentId, email: emailNorm, role: "student" });
      return res.json({
        ok: true,
        token,
        user: {
          id: student.studentId,
          email: emailNorm,
          displayName: student.displayName,
          role: "student",
          classIds: student.classIds || [],
        },
      });
    }
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ============================================================================
// GET CURRENT USER
// ============================================================================

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { id, email, role } = req.user;

    if (role === "teacher") {
      const teachers = safeReadJson(TEACHERS_FILE);
      const teacher = teachers[email];

      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      return res.json({
        ok: true,
        user: {
          id: teacher.teacherId,
          email,
          displayName: teacher.displayName,
          role: "teacher",
        },
      });
    } else {
      const students = safeReadJson(STUDENTS_FILE);
      const student = students[email];

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      return res.json({
        ok: true,
        user: {
          id: student.studentId,
          email,
          displayName: student.displayName,
          role: "student",
          classIds: student.classIds || [],
        },
      });
    }
  } catch (e) {
    console.error("Me error:", e);
    return res.status(500).json({ error: "Failed to get user info" });
  }
});

export default router;
