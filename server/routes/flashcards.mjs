// routes/flashcards.mjs — build a simple printable PDF of flashcards
import 'dotenv/config';
import express from 'express';
import PDFDocument from 'pdfkit';

const router = express.Router();

// Simple 2x2 layout per page (4 cards/page)
const PAGE = { width: 612, height: 792, margin: 36 }; // Letter portrait (pts)
const GRID = { cols: 2, rows: 2, gap: 18 };

router.post('/', async (req, res) => {
  try {
    const { title = "Vocab Flashcards", items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="flashcards.pdf"');

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin } });
    doc.pipe(res);

    // Title page
    doc.font('Times-Bold').fontSize(22).text(title, { align: 'center' }).moveDown(0.5);
    doc.font('Times-Roman').fontSize(12).text(`Cards: ${items.length}`, { align: 'center' });
    doc.addPage();

    let idx = 0;
    const cardW = (PAGE.width - PAGE.margin * 2 - GRID.gap) / GRID.cols;
    const cardH = (PAGE.height - PAGE.margin * 2 - GRID.gap) / GRID.rows;

    function drawCard(x, y, w, h, lemma, english, entry) {
      // outline
      doc.save().lineWidth(0.5).rect(x, y, w, h).stroke('#999').restore();

      const pad = 10;
      const innerX = x + pad, innerY = y + pad, innerW = w - pad * 2;

      doc.font('Times-Bold').fontSize(20).text(lemma, innerX, innerY, { width: innerW, align: 'center' });
      doc.moveDown(0.4);

      doc.font('Times-Roman').fontSize(14).text(english, { width: innerW, align: 'center' });
      doc.moveDown(0.2);

      doc.font('Times-Italic').fontSize(11).fillColor('#444').text(entry, { width: innerW, align: 'center' });
      doc.fillColor('black');
    }

    while (idx < items.length) {
      for (let r = 0; r < GRID.rows && idx < items.length; r++) {
        for (let c = 0; c < GRID.cols && idx < items.length; c++) {
          const x = PAGE.margin + c * (cardW + GRID.gap);
          const y = PAGE.margin + r * (cardH + GRID.gap);
          const it = items[idx++];
          drawCard(x, y, cardW, cardH, it.lemma, it.english, it.entry);
        }
      }
      if (idx < items.length) doc.addPage();
    }

    doc.end();
  } catch (e) {
    console.error('flashcards error:', e);
    return res.status(500).json({ error: "PDF generation failed" });
  }
});

export default router;
