# Ars Legendi

**A classical reading framework for Latin**

Ars Legendi is a mastery-based reading and learning platform for Latin. The first module teaches students to read Caesar's *De Bello Gallico* Book 1 by combining vocabulary training, grammar support anchored to real passages, and adaptive progress tracking.



## What it does

Ars Legendi helps students do four things in one place:

- **Learn grammar in context.** Grammatical concepts are taught directly as they appear in the Latin, with clear lessons for each construction linked to examples in the text.
- **Master vocabulary.** 54 chapter-based quizzes build lasting recognition and recall through a three-phase learning model (multiple choice, error correction, typed production).
- **Read with support.** Every word is fully parsed and constructions are identified, so students can read real Latin with morphological and syntactic information at their fingertips.
- **Track progress.** An Elo-based mastery system provides adaptive feedback based on areas of strength and weakness, guiding students toward what they actually need to practice.

Teachers have access to a dashboard that surfaces class-wide patterns, flags skills that need reteaching, and tracks individual student progress.



## How it works

Under the hood, the text is processed through a Natural Language Processing pipeline. Each sentence is annotated with lemmas, morphological features, and syntactic structure using Universal Dependencies. Rule-based detectors then identify 11 grammatical construction types (ablative absolutes, indirect statements, purpose clauses, *cum* clauses, conditionals, and more) and mark their exact span in each sentence.

This means grammatical support is generated systematically rather than written by hand line-by-line, and the same pipeline can be extended to other authors and texts.

The adaptive learning system uses an Elo rating algorithm (adapted from chess) to measure student skill per topic, calibrate item difficulty from aggregate performance data, and detect behavioral patterns like guessing, fatigue, or momentum to trigger appropriate interventions.



## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, React Router |
| Backend | Node.js, Express |
| Data storage | JSON files (no traditional database) |
| NLP pipeline | Stanza (Python), Universal Dependencies |
| Auth | Custom JWT (HMAC-SHA256) |
| Deployment | Vercel (frontend) + Railway (backend) |



## Key data files

All Latin text data lives in `/server/data/caesar/`:

| File | Purpose |
|------|---------|
| `dbg1_ud.json` | Full Universal Dependencies token annotations |
| `dbg1_sentences.json` | Sentence bundles with text and metadata |
| `dbg1_translations.json` | English translations keyed by sentence ID |
| `dbg1_constructions.json` | Grammar construction tags for practice |
| `dbg1_chapter_vocab_ok.json` | Target vocabulary per chapter |
| `caesar_lemma_glosses_MASTER.json` | Dictionary definitions for all lemmas |
| `dbg1_lemma_index.json` | Form-to-lemma lookup (powers the Word Inspector) |
| `dbg1_form_index.json` | Lemma-to-forms lookup |



## Core systems

### Three-phase vocabulary trainer

Each session progresses through recognition (multiple choice), reinforcement (retry missed items), and production (typed recall from English). Words mastered in Phase 3 are persisted and tracked over time.

**Key file:** `client/src/pages/CaesarDBG1.jsx`

### Grammar practice

Interactive exercises anchored to detected constructions. Students identify construction spans in real sentences and classify subtypes. Quiz configurations are declarative, making it straightforward to add new exercise types.

**Key files:** `client/src/pages/GrammarPractice.jsx`, `client/src/data/grammarQuizConfigs.js`

### Word Inspector

Click any word in the reading view to see its lemma, full morphological parse, syntactic role, and dictionary definition. Powered by the UD token data and the glossary API.

**Key file:** `client/src/components/WordInspector.jsx`

### Elo-based mastery tracking

Student skill ratings and item difficulties are calculated using an adapted Elo algorithm. Skills are categorized as novice, learning, proficient, or mastered based on rating thresholds.

**Key file:** `client/src/lib/eloRating.js`

### Adaptive feedback engine

Monitors student behavior to detect seven patterns (high latency, guessing, hint dependency, inconsistency, stagnation, momentum, fatigue) and triggers appropriate interventions.

**Key file:** `client/src/lib/adaptiveFeedback.js`

### Teacher dashboard

Aggregates class data to surface reteaching decisions, misconception patterns, and per-student alerts. Includes built-in pedagogical templates for each grammar skill.

**Key files:** `client/src/pages/TeacherDashboard.jsx`, `client/src/lib/classInsights.js`



## Running locally

**Prerequisites:** Node.js 18+, npm

```bash
# Install dependencies
cd client && npm install
cd ../server && npm install

# Set environment variables (server)
# Create server/.env with:
#   PORT=3001
#   JWT_SECRET=your-secret
#   TEACHER_SECRET=your-secret

# Start the server
cd server && npm start

# In a separate terminal, start the client
cd client && npm run dev
```

The client runs on `localhost:5173` by default, the server on `localhost:3001`.

If you want LLM-powered features (example sentences, mnemonics, hints), add `OPENAI_API_KEY` to the server environment.



## Adapting for another Latin text

Ars Legendi is designed as a repeatable framework. The learning engine is decoupled from the content, so adapting it to a new text means swapping data files without rewriting logic.

The high-level process:

1. **Prepare your text.** Obtain a clean digital version, split into sentences, assign stable IDs.
2. **Run the NLP pipeline.** Use Stanza (or UDPipe) to generate Universal Dependencies annotations. Export to JSON.
3. **Detect constructions.** Run the rule-based detectors on parsed sentences. Review and tune output.
4. **Build vocabulary data.** Extract lemmas, assign to chapters, obtain glossary definitions (Whitaker's Words, Perseus).
5. **Assemble data files.** Place JSON files in a new `/server/data/[yourtext]/` directory.
6. **Update routes and UI.** Point server routes to the new data directory. Copy and adapt the client page components.

For a detailed walkthrough with code snippets and implementation guidance, see the Methodology page on the site.



## Background

I started learning Latin the way most students do: vocabulary lists and grammar charts disconnected from reading real authors. When I began reading Caesar, I realized I could know the grammar and still not be able to read a page. Even with access to a classroom and teacher, resources for practicing grammar and vocabulary in a text-anchored way were limited.

I built Ars Legendi to function as a teacher tool inside and outside the classroom. I chose Caesar because his prose is straightforward while covering most fundamental constructions, and nearly all Latin students encounter him at some point. The system is designed to recreate teacher support in an efficient, text-anchored way for both students and teachers.



## Contact

I'm Grant Henry, a high school student with a love for Classics and a background in technology.

If you are interested in building a version for another author, have feedback, or want to pilot Ars Legendi with students, reach out at **granthenry34@icloud.com**.
