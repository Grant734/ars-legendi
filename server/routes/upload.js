import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Setup Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve("uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Upload endpoint
router.post("/", upload.array("pdfs", 5), (req, res) => {
  if (!req.files) return res.status(400).send("No files uploaded.");
  const fileInfos = req.files.map(file => ({
    originalname: file.originalname,
    filename: file.filename,
    path: file.path
  }));
  res.json({ files: fileInfos });
});

export default router;
