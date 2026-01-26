// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import rateLimit from 'express-rate-limit';
import caesarRouter from "./routes/caesar.mjs";
import authRouter from "./routes/auth.mjs";
import classesRouter from "./routes/classes.mjs";
import studentDataRouter from "./routes/studentData.mjs";

// Optional routers (don't crash server if these files aren't present in your project)
async function tryImport(modulePath) {
  try {
    const mod = await import(modulePath);
    return mod?.default ?? null;
  } catch (e) {
    return null;
  }
}

const postsRouter = await tryImport("./routes/posts.mjs");
const curriculumRouter = await tryImport("./routes/curriculum.mjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// --- middleware ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- uploads (if you use it elsewhere in the site) ---
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || "upload")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage });

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// --- health ---
app.get("/api/health", (req, res) => res.json({ ok: true }));

// --- core routes ---
app.use("/api/caesar", caesarRouter);
app.use("/api/auth", authRouter);
app.use("/api/classes", classesRouter);
app.use("/api/student", studentDataRouter);


// Optional (only mounts if file exists)
if (postsRouter) app.use("/api/posts", postsRouter);
if (curriculumRouter) app.use("/api/curriculum", curriculumRouter);

// Example upload endpoint (safe to keep even if unused)
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ ok: true, filename: req.file.filename, url: `/uploads/${req.file.filename}` });
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

app.use(limiter);