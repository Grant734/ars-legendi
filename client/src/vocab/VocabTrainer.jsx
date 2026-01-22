// src/vocab/VocabTrainer.jsx
// Vocab Trainer v3.1 — Phase 3 + polish pass
// - Feedback: removed "Note" row entirely
// - Example sentences always ON; removed TTS and its toggles
// - Phase 2 summary: no "Finish Session" (only Proceed to Phase 3)
// - Phase 3 typing: Latin lemma is NOT displayed on question screen
// - Enter key submits in MC and Typed modes
// - Restored HistoryView

import React, { useEffect, useRef, useState } from "react";
import { nounsByDeclension } from "./data/nouns";
import { verbsByConjugation } from "./data/verbs";
import { adjectivesByDeclension } from "./data/adjectives";
import {
  initStorage,
  loadSeenWords,
  saveSeenWords,
  saveSnapshot,
  clearSnapshot,
  pushHistory,
  loadSnapshot,
  loadHistory,
  loadPrefs,
  savePrefs,
  exportHistoryCSV,
  getPoints,
  addPoints,
  getStoredMnemonic,
  saveStoredMnemonic,
  getStoredImage,
  saveStoredImage
} from "./storage";
import { shuffle, sampleWithoutReplacement } from "./rng";
import { fetchSentence, fetchMnemonic, fetchHint, fetchImage, downloadFlashcardsPDF } from "./llm";
import { describeRankByPoints, pointsFromRaw } from "./tiering";
import {
  logAttemptEvent,
  EVENT_TYPES,
  SKILLS,
  SUBSKILLS,
} from "../lib/attemptEvents";

const DEFAULT_SESSION_SIZE = 30;

// ===== Mastery (localStorage) — ⭐ count per lemma =====
const MASTER_KEY = "vt_mastery_v1";
function loadMasteryMap() {
  try { const raw = localStorage.getItem(MASTER_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function saveMasteryMap(map) { try { localStorage.setItem(MASTER_KEY, JSON.stringify(map)); } catch {} }
function addMastery(lemma, english, entry) {
  const map = loadMasteryMap();
  const key = String(lemma || "").trim();
  if (!key) return;
  const cur = map[key] || { count: 0, english: english || "", entry: entry || "", lastAt: 0 };
  cur.count += 1;
  if (english) cur.english = english;
  if (entry)   cur.entry   = entry;
  cur.lastAt = Date.now();
  map[key] = cur;
  saveMasteryMap(map);
}
function listMastered() {
  const map = loadMasteryMap();
  const arr = Object.keys(map).map(k => ({ lemma: k, ...map[k] }));
  arr.sort((a,b) => (b.count - a.count) || a.lemma.localeCompare(b.lemma));
  return arr;
}

export default function VocabTrainer() {
  useEffect(() => {
    initStorage();
    if (!window.vocabTrainer) window.vocabTrainer = {};
  }, []);

  // screen flow: selector | ready | question | feedback | report | history | final
  const [screen, setScreen] = useState("selector");

  // PHASE: 1 (MC pass) → report1 → 2 (MC master-once) → report2 → 3 (typed) → final
  const [phase, setPhase] = useState(1);
  const [reportType, setReportType] = useState(null); // "phase1" | "phase2" | null

  // Preferences (kept for sessionSize/includeSeen only)
  const [prefs, setPrefs] = useState(loadPrefs());

  // Node 2 state (mode + category selection)
  const [selection, setSelection] = useState({
    mode: "noun",
    categories: new Set([1, 2])
  });

  // Node 3 / session state
  // wordSet: lemma -> [englishDef, [d1,d2,d3], id(1..N), meta]
  const [wordSet, setWordSet] = useState({});
  const [order, setOrder] = useState([]); // lemmas order (Phase 1)
  const [perCatCounts, setPerCatCounts] = useState([]);

  // Node 4/5 runtime
  const [idx, setIdx] = useState(0);              // index for Phase 1
  const [phase2Queue, setPhase2Queue] = useState([]); // queue of lemmas in Phase 2
  const [phase2Tries, setPhase2Tries] = useState({}); // lemma -> tries in Phase 2

  // Phase 3 runtime
  const [phase3Queue, setPhase3Queue] = useState([]); // lemmas remaining
  const [phase3Orig, setPhase3Orig]   = useState(0);  // original total for progress
  const [phase3Tries, setPhase3Tries] = useState({}); // lemma -> tries in THIS encounter (0,1,2)
  const [typedInput, setTypedInput]   = useState("");
  const [phase3InlineError, setPhase3InlineError] = useState("");
  const [phase3HintLoading, setPhase3HintLoading] = useState(false);

  // MC choices + current answer
  const [choices, setChoices] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState(null);

  // Last result (for FeedbackView across MC & typed)
  const [lastWasCorrect, setLastWasCorrect] = useState(null);

  // Logs
  const [logs, setLogs] = useState({}); // lemma -> [true/false,...]
  const [phaseLogs, setPhaseLogs] = useState({ 1: {}, 2: {}, 3: {} });

  // LLM bits — cached by lemma across phases
  const [llmData, setLlmData] = useState(null); // {latin_sentence, english_translation}
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [aiMnemonic, setAiMnemonic] = useState("");
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [llmCache, setLlmCache] = useState({}); // lemma -> { example?:obj, mnemonic?:string }

    // AI image (cartoon) — cached by lemma
  const [aiImageUrl, setAiImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");


  // Snapshot presence (for resume)
  const [hasSnapshot, setHasSnapshot] = useState(false);

  // Timer (runs on question & feedback)
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(null);
  const tickerRef = useRef(null);
    // === Image prefetch control ===
  const prefetchQueueRef = useRef([]);       // array of {lemma, mode, entry, english}
  const prefetchRunningRef = useRef(false);  // one worker at a time
  const prefetchedSetRef = useRef(new Set()); // "mode::lemma" already queued/attempted

  function getEntryForLemma(lemma) {
    const meta = wordSet?.[lemma]?.[3] || {};
    return meta.entry || "";
  }

  async function runPrefetchWorker() {
    if (prefetchRunningRef.current) return;
    prefetchRunningRef.current = true;

    try {
      while (prefetchQueueRef.current.length > 0) {
        const job = prefetchQueueRef.current.shift();
        if (!job) continue;

        const key = `${job.mode}::${job.lemma}`;
        if (prefetchedSetRef.current.has(key)) continue;
        prefetchedSetRef.current.add(key);

        // If your storage.js has image caching, try it first (optional, harmless if not)
        try {
          const cached = (typeof loadStoredImage === "function") ? loadStoredImage(job.lemma) : "";
          if (cached) continue;
        } catch {}

        // Fire the request (server will cache; client can cache too)
        try {
          const out = await fetchImage(job.lemma, job.mode, job.entry, job.english);

          const dataUrl = out?.image_data_url || "";
          if (dataUrl) {
            try {
              if (typeof saveStoredImage === "function") saveStoredImage(job.lemma, dataUrl);
            } catch {}
          }

          // Tiny breathing room so we don't clobber the API
          await new Promise(r => setTimeout(r, 150));
        } catch {
          // ignore failures during prefetch
        }
      }
    } finally {
      prefetchRunningRef.current = false;
    }
  }

  function enqueuePrefetchForNext3() {
    // Determine the "current sequence" depending on phase
    const mode = selection?.mode || "noun";

    let upcoming = [];

    if (phase === 1) {
      // Current lemma is order[idx], so next 3 are idx+1..idx+3
      upcoming = order.slice(idx + 1, idx + 4);
    } else if (phase === 2) {
      // phase2Queue[0] is current; next 3 are [1..3]
      upcoming = (phase2Queue || []).slice(1, 4);
    } else if (phase === 3) {
      // phase3Queue[0] is current; next 3 are [1..3]
      upcoming = (phase3Queue || []).slice(1, 4);
    }

    for (const lemma of upcoming) {
      if (!lemma) continue;
      const english = (wordSet?.[lemma]?.[0] || "");
      const entry = getEntryForLemma(lemma);
      prefetchQueueRef.current.push({ lemma, mode, entry, english });
    }

    runPrefetchWorker();
  }


  // Final summary (for confetti screen)
  const [finalSummary, setFinalSummary] = useState(null); // {right, total, pct, timeMs, points, rank}

  // ===== Timer ticking =====
  useEffect(() => {
    const runTimer = screen === "question" || screen === "feedback";
    if (runTimer && !tickerRef.current) {
      lastTickRef.current = Date.now();
      tickerRef.current = setInterval(() => {
        const now = Date.now();
        elapsedRef.current += (now - lastTickRef.current);
        lastTickRef.current = now;
      }, 250);
    }
    if (!runTimer && tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    return () => { if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; } };
  }, [screen]);

  // Enter key submits (MC and Typed)
  useEffect(() => {
    if (screen !== "question") return;
    const onKeyDown = (e) => {
      if (e.key !== "Enter") return;
      if (phase === 1 || phase === 2) {
        if (currentAnswer) submitAnswerMC();
      } else if (phase === 3) {
        if (typedInput.trim()) submitAnswerTyped();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, phase, currentAnswer, typedInput]);

  // Enter key navigates: Next (feedback), proceed between phases (report), start questions (ready)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Enter") return;

      // Avoid stealing Enter from text inputs (Phase 3 typing already handles it)
      const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") return;

      if (screen === "feedback") {
        e.preventDefault();
        nextAfterFeedback();
        return;
      }
      if (screen === "report") {
        e.preventDefault();
        if (reportType === "phase1") proceedToPhase2();
        else proceedToPhase3();
        return;
      }
      if (screen === "ready") {
        e.preventDefault();
        setIdx(0);
        setScreen("question");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, reportType]);

  // On entering selector, check snapshot
  useEffect(() => {
    if (screen !== "selector") return;
    const snap = loadSnapshot();
    setHasSnapshot(!!snap);
  }, [screen]);

    // Prefetch images for the next 3 words whenever the question advances
  useEffect(() => {
    if (screen !== "question") return;
    enqueuePrefetchForNext3();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, phase, idx, phase2Queue, phase3Queue]);

  // ===== Node 2: Selector handlers =====
  function toggleCategory(cat) {
    const next = new Set(selection.categories);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setSelection({ ...selection, categories: next });
  }
  function setMode(m) {
    let defaults;
    if (m === "noun") defaults = new Set([1, 2]);
    else if (m === "verb") defaults = new Set([1]);
    else if (m === "adjective") defaults = new Set([12, 3]);
    else defaults = new Set();
    setSelection({ mode: m, categories: defaults });
  }
  function onSessionSizeChange(e) {
    const size = Number(e.target.value) || DEFAULT_SESSION_SIZE;
    const next = savePrefs({ sessionSize: size });
    setPrefs(next);
  }
  function toggleIncludeSeen() {
    const next = savePrefs({ includeSeen: !prefs.includeSeen });
    setPrefs(next);
  }

  // ===== Node 3: Build session (Phase 1) =====
  function startSession() {
    const cats = Array.from(selection.categories);
    if (cats.length === 0) { alert("Select at least one category."); return; }

    const { wordSet: built, order: sequence, breakdown } = buildSession(selection.mode, cats);
    if (sequence.length === 0) { alert("No words available for the selected categories yet."); return; }

    setWordSet(built);
    setOrder(sequence);
    setPerCatCounts(breakdown);

    // Phase resets
    setPhase(1);
    setIdx(0);
    setPhase2Queue([]);
    setPhase2Tries({});
    setPhase3Queue([]);
    setPhase3Orig(0);
    setPhase3Tries({});
    setTypedInput("");
    setPhase3InlineError("");
    setPhase3HintLoading(false);
    setLogs({});
    setPhaseLogs({ 1: {}, 2: {}, 3: {} });
    setLastWasCorrect(null);

    // UI
    setChoices([]);
    setCurrentAnswer(null);
    setLlmData(null);
    setSentenceLoading(false);
    setAiMnemonic("");
    setMnemonicLoading(false);
    setLlmCache({});

    elapsedRef.current = 0;

    saveSnapshot({
      selection: { mode: selection.mode, categories: Array.from(selection.categories) },
      phase: 1,
      wordSet: built,
      order: sequence,
      idx: 0,
      logs: {},
      phaseLogs: { 1: {}, 2: {}, 3: {} },
      phase2: { queue: [], tries: {} },
      phase3: { queue: [], tries: {}, orig: 0 },
      llmCache: {},
      elapsedMs: 0
    });

    window.vocabTrainer.selection = selection;
    window.vocabTrainer.wordSet = built;
    window.vocabTrainer.order = sequence;

    setScreen("ready");
        // Kick off prefetch immediately for the first few words
    setTimeout(() => {
      try { enqueuePrefetchForNext3(); } catch {}
    }, 0);

  }

  function restartSession() {
    try { clearSnapshot(); } catch {}
    startSession();
  }

  function confirmEndSession() {
    if (window.confirm("End this session now and record points so far?")) {
      finishSession();
    }
  }

  function buildSession(mode, categories) {
    const banks = mode === "noun" ? nounsByDeclension : mode === "adjective" ? adjectivesByDeclension : verbsByConjugation;
    const seen = loadSeenWords(mode);

    const poolByCat = {};
    let totalAvail = 0;
    categories.forEach((c) => {
      const arr = (banks[c] || []).slice();
      poolByCat[c] = arr;
      totalAvail += arr.length;
    });

    const sessionCap = Math.max(10, Math.min(50, Number(prefs.sessionSize || DEFAULT_SESSION_SIZE)));
    const desired = Math.min(sessionCap, totalAvail);
    if (desired <= 0) return { wordSet: {}, order: [], breakdown: [] };

    const counts = proportionalCounts(categories, poolByCat, desired);

    const chosen = [];
    const perCatChosen = {};

    categories.forEach((c) => {
      const pool = (poolByCat[c] || []).slice();

      if (prefs.includeSeen) {
        const take = Math.min(counts[c], pool.length);
        const pick = sampleWithoutReplacement(pool, take);
        chosen.push(...pick);
        perCatChosen[c] = (perCatChosen[c] || 0) + pick.length;
      } else {
        const seenSet = seen[String(c)] || new Set();
        const fresh = pool.filter((w) => !seenSet.has(w.lemma));
        const takeFresh = Math.min(counts[c], fresh.length);
        const takeSeen = counts[c] - takeFresh;

        const pickFresh = sampleWithoutReplacement(fresh, takeFresh);
        chosen.push(...pickFresh);
        perCatChosen[c] = (perCatChosen[c] || 0) + pickFresh.length;

        if (takeSeen > 0) {
          const seenPool = pool.filter((w) => seenSet.has(w.lemma));
          const pickOld = sampleWithoutReplacement(seenPool, takeSeen);
          chosen.push(...pickOld);
          perCatChosen[c] = (perCatChosen[c] || 0) + pickOld.length;
        }
      }
    });

    while (chosen.length < desired) {
      const anyCat = categories[Math.floor(Math.random() * categories.length)];
      const pool = poolByCat[anyCat] || [];
      if (!pool.length) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) { chosen.push(pick); perCatChosen[anyCat] = (perCatChosen[anyCat] || 0) + 1; }
    }

    const shuffledForIds = shuffle(chosen);
    const builtWordSet = {};
    shuffledForIds.forEach((w, i) => {
      const id = i + 1;
      const meta =
       mode === "noun"
         ? { entry: w.entry, declension: w.declension, category: w.category }
          : mode === "adjective"
         ? { entry: w.entry, declension: w.declension, category: w.category }
          : { entry: w.entry, conjugation: w.conjugation };
      builtWordSet[w.lemma] = [w.english, (w.distractors || []).slice(0, 3), id, meta];
    });

    const sequence = shuffle(shuffledForIds.map((w) => w.lemma));
    const breakdown = categories.map((c) => ({
      label:
        mode === "noun"
          ? `Declension ${c}`
          : mode === "adjective"
          ? (String(c) === "212" ? "1/2 (2-1-2) adjectives" : "1st/2nd Declension Adjectives")
          : (c === "irregular" ? "Irregular" : `Conjugation ${c}`),
      count: perCatChosen[c] || 0
    }));
    

    return { wordSet: builtWordSet, order: sequence, breakdown };
  }

  function proportionalCounts(categories, poolByCat, desired) {
    const sizes = categories.map((c) => (poolByCat[c] || []).length);
    const total = sizes.reduce((a, b) => a + b, 0);
    const nonEmpty = categories.filter((c) => (poolByCat[c] || []).length > 0);
    if (nonEmpty.length === 0) return {};

    const raw = categories.map((c) => {
      const size = (poolByCat[c] || []).length;
      return total > 0 ? desired * (size / total) : 0;
    });

    const counts = {};
    let sum = 0;
    categories.forEach((c, i) => {
      const rounded = Math.round(raw[i]);
      counts[c] = (poolByCat[c] || []).length > 0 ? Math.max(0, rounded) : 0;
      sum += counts[c];
    });

    while (sum > desired) {
      const c = categories[Math.floor(Math.random() * categories.length)];
      if (counts[c] > 0) { counts[c]--; sum--; }
    }
    while (sum < desired) {
      const c = categories[Math.floor(Math.random() * categories.length)];
      if ((poolByCat[c] || []).length > counts[c]) { counts[c]++; sum++; }
    }
    return counts;
  }

  // Build choices on entering a MC question (Phase 1/2 only)
  useEffect(() => {
    if (screen !== "question") return;
    if (phase === 3) return; // typed recall, no MC

    const lemma = phase === 1 ? order[idx] : phase2Queue[0];
    if (!lemma) return;

    const [correct, distractors] = wordSet[lemma] || [];
    const safeDistractors = (distractors || []).filter(
      d => d && d.toLowerCase() !== (correct || "").toLowerCase()
    );
    const padded = [...safeDistractors];
    const filler = ["—", "––", "— —"];
    for (let i = 0; i < 3 - padded.length; i++) padded.push(filler[i]);
    const opts = shuffle([correct, ...padded.slice(0, 3)]);

    setChoices(opts);
    setCurrentAnswer(null);
    setLlmData(null);
    setSentenceLoading(false);
    setAiMnemonic("");
    setMnemonicLoading(false);
    setLastWasCorrect(null);
  }, [screen, idx, order, phase, phase2Queue, wordSet]);

  // ===== Resume helpers =====
  function resumeFromSnapshot() {
    const snap = loadSnapshot();
    if (!snap) return;

    let restoredCats = new Set();
    if (snap.selection) {
      const maybeArr = Array.isArray(snap.selection.categories)
        ? snap.selection.categories
        : Object.values(snap.selection.categories || {});
      restoredCats = new Set(maybeArr);
    }
    const restoredSel = { mode: snap.selection?.mode || "noun", categories: restoredCats };

    setSelection(restoredSel);
    setWordSet(snap.wordSet || {});
    setOrder(snap.order || []);
    setIdx(Math.max(0, snap.idx || 0));
    setLogs(snap.logs || {});
    setPhaseLogs(snap.phaseLogs || { 1: {}, 2: {}, 3: {} });
    setPhase(snap.phase || 1);

    const p2 = snap.phase2 || { queue: [], tries: {} };
    setPhase2Queue(Array.isArray(p2.queue) ? p2.queue : []);
    setPhase2Tries(p2.tries || {});

    const p3 = snap.phase3 || { queue: [], tries: {}, orig: 0 };
    setPhase3Queue(Array.isArray(p3.queue) ? p3.queue : []);
    setPhase3Tries(p3.tries || {});
    setPhase3Orig(Number(p3.orig || 0));

    setLlmCache(snap.llmCache || {});

    setChoices([]);
    setCurrentAnswer(null);
    setLlmData(null);
    setSentenceLoading(false);
    setAiMnemonic("");
    setMnemonicLoading(false);
    setLastWasCorrect(null);
    elapsedRef.current = Math.max(0, snap.elapsedMs || 0);
    setReportType(null);

    window.vocabTrainer.selection = restoredSel;
    window.vocabTrainer.wordSet = snap.wordSet || {};
    window.vocabTrainer.order = snap.order || {};

    if (snap.phase === 3) {
      if ((p3.queue || []).length === 0) {
        setScreen("report"); 
        setReportType("phase2"); 
      } else {
        setScreen("question");
      }
    } else if (snap.phase === 2) {
      if ((p2.queue || []).length === 0) {
        setReportType("phase2");
        setScreen("report");
      } else {
        setScreen("question");
      }
    } else {
      if ((snap.idx || 0) >= (snap.order || []).length) {
        setReportType("phase1");
        setScreen("report");
      } else {
        setScreen("question");
      }
    }
  }

  function discardSnapshot() {
    clearSnapshot();
    setHasSnapshot(false);
  }

  // ===== UI routing =====
  if (screen === "selector") return <SelectorView />;
  if (screen === "ready")    return <SessionReadyView />;
  if (screen === "question") return <QuestionView />;
  if (screen === "feedback") return <FeedbackView />;
  if (screen === "report")   return <ReportView />;
  if (screen === "history")  return <HistoryView />;
  if (screen === "final")    return <FinalView />;
  return null;

  function SelectorView() {
    const isNoun = selection.mode === "noun";
    const snap = loadSnapshot();
    const remaining =
      snap && snap.phase === 1
        ? Math.max(0, (snap.order?.length || 0) - (snap.idx || 0))
        : (snap && snap.phase === 2 ? (snap.phase2?.queue?.length || 0) :
           (snap && snap.phase === 3 ? (snap.phase3?.queue?.length || 0) : 0));

    return (
      <div style={wrap}>
        <h2>Vocab Trainer — Start</h2>

        {/* Resume card */}
        {hasSnapshot && (
          <div style={{ ...card, borderColor: "#bdb", background: "#f6fff6" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Resume last session?</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              {snap?.selection?.mode === "verb" ? "Verbs" : "Nouns"} • Phase {snap?.phase || 1} • Remaining: {remaining} • Elapsed {formatTime(snap?.elapsedMs || 0)}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button style={primary} onClick={resumeFromSnapshot}>Resume</button>
              <button style={danger} onClick={discardSnapshot}>Discard</button>
            </div>
          </div>
        )}

        {/* Session options (no example/TTS toggles anymore) */}
        <div style={{ ...card, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Session Options</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Set session length and sampling behavior.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Session Size</div>
                <select value={prefs.sessionSize || DEFAULT_SESSION_SIZE} onChange={onSessionSizeChange} style={select}>
                  {[10,20,30,50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <label style={toggleWrap}>
                <input type="checkbox" checked={!!prefs.includeSeen} onChange={toggleIncludeSeen} />
                <span style={{ marginLeft: 8 }}>Include previously seen</span>
              </label>
            </div>
          </div>
        </div>

        {/* mode toggle */}
        <div style={{ ...row, marginTop: 12 }}>
          <button onClick={() => setMode("noun")} style={btn(selection.mode === "noun")}>Nouns</button>
          <button onClick={() => setMode("verb")} style={btn(selection.mode === "verb")}>Verbs</button>
          <button onClick={() => setMode("adjective")} style={btn(selection.mode === "adjective")}>Adjectives</button>
        </div>

        {/* category checkboxes */}
        <div style={{ marginTop: 12 }}>
          <strong>
            {selection.mode === "noun"
              ? "Choose declensions"
              : selection.mode === "adjective"
              ? "Choose adjective groups"
              : "Choose conjugations"}
          </strong>
          <div style={rowWrap}>
            {(selection.mode === "noun"
              ? [1, 2, 3, 4, 5]
              : selection.mode === "adjective"
              ? [12, 3]
              : [1, 2, 3, 4, "irregular"]
            ).map((c) => (
              <label key={String(c)} style={chip(selection.categories.has(c))}>
                <input
                  type="checkbox"
                  checked={selection.categories.has(c)}
                  onChange={() => toggleCategory(c)}
                  style={{ marginRight: 6 }}
                />
                {selection.mode === "noun"
                  ? `Declension ${c}`
                  : selection.mode === "adjective"
                  ? c === 12
                    ? "1/2 (2-1-2) adjectives"
                    : "3rd declension adjectives"
                  : c === "irregular"
                  ? "Irregular"
                  : `Conjugation ${c}`}
              </label>
            ))}
          </div>
        </div>

        {/* actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={startSession} style={primary}>Start practicing</button>
          <button onClick={() => setScreen("history")} style={secondary}>History / Leaderboard</button>
        </div>
      </div>
    );
  }

  function SessionReadyView() {
    const total = order.length;
    const isNoun = selection.mode === "noun";
    return (
      <div style={wrap}>
        <h2>Session Ready</h2>
        <div style={{ marginBottom: 8, fontSize: 16 }}>
          Mode: <strong>{isNoun ? "Nouns" : "Verbs"}</strong>
        </div>
        <div style={card}>
          <div><strong>Total questions:</strong> {total}</div>
          <div style={{ marginTop: 8 }}>
            <strong>Per-category allocation:</strong>
            <ul style={{ margin: "8px 0 0 20px" }}>
              {perCatCounts.map((p) => (<li key={p.label}>{p.label}: {p.count}</li>))}
            </ul>
          </div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            (We don’t reveal items here to avoid giving answers away.)
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={() => { setIdx(0); setScreen("question"); }}>
            Proceed to Questions
          </button>
          <button style={secondary} onClick={() => setScreen("history")}>History / Leaderboard</button>
        </div>
      </div>
    );
  }

  function QuestionView() {
    const isPhase1 = phase === 1;
    const isPhase2 = phase === 2;
    const isPhase3 = phase === 3;

    const lemma = isPhase1 ? order[idx] : (isPhase2 ? phase2Queue[0] : phase3Queue[0]);
    const rec = wordSet[lemma];
    const meta = rec ? rec[3] : null;
    const isNoun = selection.mode === "noun";
    const phaseLabel = isPhase1 ? "Phase 1" : (isPhase2 ? "Phase 2" : "Phase 3");

    // Progress
    const p2Target = phase2OrigCount();
    const p2Done   = Math.max(0, p2Target - (phase2Queue?.length || 0));
    const p3Target = phase3Orig || 0;
    const p3Done   = Math.max(0, p3Target - (phase3Queue?.length || 0));


    const headerText =
      isPhase1 ? `${phaseLabel} — Question ${idx + 1} / ${order.length}` :
      isPhase2 ? `${phaseLabel} — ${p2Done}/${p2Target} mastered` :
      `${phaseLabel} — ${p3Done}/${p3Target} mastered`;

    // Phase 3: attempts remaining on current word
    const tries = isPhase3 ? (phase3Tries[lemma] || 0) : 0;
    const attemptsLeft = isPhase3 ? Math.max(0, 2 - tries) : null;

    return (
      <div style={wrap}>
        <HeaderTimer elapsedRef={elapsedRef} />
        <h3>{headerText}</h3>

        {isPhase2 && (
          <div style={{ marginBottom: 8 }}>
            <ProgressBar label="Phase 2 progress"
              value={p2Target ? p2Done / p2Target : 0}
              suffix={`${p2Done}/${p2Target} mastered`} />
          </div>
        )}
        {isPhase3 && (
          <div style={{ marginBottom: 8 }}>
            <ProgressBar label="Phase 3 progress"
              value={p3Target ? p3Done / p3Target : 0}
              suffix={`${p3Done}/${p3Target} mastered`} />
          </div>
        )}

        <div style={{ marginBottom: 6, fontSize: 14, opacity: 0.8 }}>
          {isNoun
            ? (isPhase3
                ? (meta?.declension ? `Noun — Declension ${meta.declension}` : "Noun")
                : `Noun — ${meta?.entry}`)
            : (isPhase3
                ? (meta?.conjugation
                    ? (meta.conjugation === "irregular" ? "Verb — Irregular" : `Verb — Conjugation ${meta.conjugation}`)
                    : "Verb")
                : `Verb — ${meta?.entry}`)}
        </div>

        {/* Question card */}
        <div style={card}>
          {isPhase3 ? (
            <>
              <div style={{ fontSize: 18, marginBottom: 6 }}>
                Type the Latin for: <strong>{rec ? rec[0] : ""}</strong>
              </div>
              <input
                type="text"
                value={typedInput}
                onChange={(e) => { setTypedInput(e.target.value); setPhase3InlineError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && typedInput.trim()) submitAnswerTyped(); }}
                placeholder="Type the lemma exactly"
                autoFocus
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #aaa", width: "100%", fontSize: 16 }}
              />
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Attempts left for this word: <strong>{attemptsLeft}</strong>
              </div>
              {phase3InlineError && (
                <div style={{ marginTop: 8, color: "#b00", fontSize: 14 }}>
                  {phase3InlineError}
                </div>
              )}

              {(tries >= 1) && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fafafa" }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Hint</div>
                  {phase3HintLoading ? (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Generating a hint…</div>
                  ) : (
                    <div style={{ fontSize: 14, opacity: 0.95 }}>
                      {llmCache[lemma]?.hint ? llmCache[lemma].hint : "(No hint available.)"}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, marginBottom: 12 }}>{lemma}</div>
              <div>
                {choices.map((opt) => (
                  <label key={opt} style={choice}>
                    <input
                      type="radio"
                      name="mc"
                      onChange={() => setCurrentAnswer(opt)}
                      checked={currentAnswer === opt}
                      onKeyDown={(e) => { if (e.key === "Enter" && currentAnswer) submitAnswerMC(); }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isPhase3 ? (
            <button onClick={submitAnswerMC} style={primary} disabled={!currentAnswer}>Submit</button>
          ) : (
            <button onClick={submitAnswerTyped} style={primary} disabled={!typedInput.trim()}>Submit</button>
          )}
          <button onClick={confirmEndSession} style={secondary}>End Session</button>
          <button onClick={restartSession} style={secondary}>Restart Session</button>
        </div>
      </div>
    );
  }

  // ===== Answer submit (Phase 1/2 MC) -> Feedback =====
  async function submitAnswerMC() {
    const lemma = phase === 1 ? order[idx] : phase2Queue[0];
    const rec = wordSet[lemma];
    if (!rec) return;

    const correctEnglish = rec[0];
    const isCorrect = currentAnswer === correctEnglish;

    // Phase 2: Log to universal event store
    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "vocab",
      skillId: SKILLS.VOCAB_GENERAL,
      subskillId: SUBSKILLS.RECOGNIZE,
      itemId: lemma,
      correct: isCorrect,
      userAnswer: currentAnswer,
      expectedAnswer: correctEnglish,
      metadata: { phase: phase === 1 ? "p1" : "p2" },
    });

    await handleAnswerAndFeedback(lemma, isCorrect);
  }

  // ===== Answer submit (Phase 3 typed) =====
  async function submitAnswerTyped() {
    const lemma = phase3Queue[0];
    const rec = wordSet[lemma];
    if (!rec) return;

    const input = (typedInput || "").trim().toLowerCase();
    const target = (lemma || "").trim().toLowerCase();

    const nowTries = (phase3Tries[lemma] || 0) + 1;
    const nextTries = { ...phase3Tries, [lemma]: nowTries };
    const isCorrect = input === target;

    // Phase 2: Log to universal event store
    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "vocab",
      skillId: SKILLS.VOCAB_GENERAL,
      subskillId: SUBSKILLS.PRODUCE,
      itemId: lemma,
      correct: isCorrect,
      userAnswer: input,
      expectedAnswer: target,
      metadata: { phase: "p3", attemptNum: nowTries },
    });

    if (isCorrect) {
      setPhase3Tries(nextTries);
      setPhase3InlineError("");
      setTypedInput("");
      await handleAnswerAndFeedback(lemma, true);
      return;
    }

    // Wrong attempt (1st miss): keep them on the same word, and generate a hint
    if (nowTries < 2) {
      setPhase3Tries(nextTries);
      setPhase3InlineError("Incorrect — try again (1 attempt left).");

      // Hint protocol: after first wrong attempt in Phase 3, fetch a short English-only hint
      try {
        const meta = rec ? rec[3] : null;
        const entry = meta?.entry || "";
        const english = rec ? rec[0] : "";
        const cachedHint = llmCache[lemma]?.hint;

        if (!cachedHint) {
          setPhase3HintLoading(true);
          fetchHint(lemma, entry, english)
            .then((hint) => {
              const h = String(hint || "").trim();
              if (!h) return;

              setLlmCache((prev) => {
                const next = { ...prev, [lemma]: { ...(prev[lemma] || {}), hint: h } };
                persistSnapshot({ llmCache: next });
                return next;
              });
            })
            .catch(() => {})
            .finally(() => setPhase3HintLoading(false));
        }
      } catch {
        setPhase3HintLoading(false);
      }

      persistSnapshot({ phase: 3, phase3: { queue: phase3Queue, tries: nextTries, orig: phase3Orig } });
      return;
    }

    // Second miss -> wrong feedback
    setPhase3Tries(nextTries);
    setPhase3InlineError("");
    setTypedInput("");
    await handleAnswerAndFeedback(lemma, false);
  }

  // ===== Common feedback path (used by MC and Typed) =====
  async function handleAnswerAndFeedback(lemma, isCorrect) {
    const rec = wordSet[lemma];
    const correctEnglish = rec ? rec[0] : "";
    const meta = rec ? rec[3] : null;

    // Update overall logs
    const nextLogs = { ...logs, [lemma]: [...(logs[lemma] || []), isCorrect] };
    setLogs(nextLogs);

    // Update per-phase logs
    const pl = { ...phaseLogs };
    const cur = { ...(pl[phase] || {}) };
    cur[lemma] = [...(cur[lemma] || []), isCorrect];
    pl[phase] = cur;
    setPhaseLogs(pl);

    // Flip to Feedback instantly
    setLastWasCorrect(isCorrect);
    setLlmData(null);
    setSentenceLoading(true); // always ON now
    setAiMnemonic("");
    setMnemonicLoading(!isCorrect);
    setAiImageUrl("");
    setImageError("");
    setImageLoading(true);

    setScreen("feedback");

    // Example (cache)
    try {
      const cachedEx = llmCache[lemma]?.example;
      if (cachedEx) {
        setLlmData(cachedEx);
        setSentenceLoading(false);
      } else {
        fetchSentence(lemma, selection.mode, meta.entry, correctEnglish)
          .then((llm) => {
            setLlmData(llm);
            setSentenceLoading(false);
            setLlmCache(prev => ({ ...prev, [lemma]: { ...(prev[lemma] || {}), example: llm } }));
            persistSnapshot({ llmCache: { ...llmCache, [lemma]: { ...(llmCache[lemma] || {}), example: llm } } });
          })
          .catch(() => setSentenceLoading(false));
      }
    } catch { setSentenceLoading(false); }

    // Mnemonic (only when incorrect) — cache
    if (!isCorrect) {
      try {
        const cached = getStoredMnemonic(lemma) || llmCache[lemma]?.mnemonic;
        if (cached) {
          setAiMnemonic(cached);
          setMnemonicLoading(false);
        } else {
          const mm = await fetchMnemonic(lemma, selection.mode, meta.entry, correctEnglish);
          const text = mm?.mnemonic || `Picture “${lemma}” meaning “${correctEnglish}” in a vivid image.`;
          setAiMnemonic(text);
          setMnemonicLoading(false);
          saveStoredMnemonic(lemma, text);
          setLlmCache(prev => ({ ...prev, [lemma]: { ...(prev[lemma] || {}), mnemonic: text } }));
          persistSnapshot({ llmCache: { ...llmCache, [lemma]: { ...(llmCache[lemma] || {}), mnemonic: text } } });
        }
      } catch {
        setAiMnemonic(`Picture “${lemma}” meaning “${correctEnglish}” in a vivid image.`);
        setMnemonicLoading(false);
      }
    } else {
      setAiMnemonic("");
      setMnemonicLoading(false);
    }

        // Image (always attempt) — cache
    try {
      const cachedImg = getStoredImage(lemma) || llmCache[lemma]?.imageUrl;
      if (cachedImg) {
        setAiImageUrl(cachedImg);
        setImageLoading(false);
      } else {
        fetchImage(lemma, selection.mode, meta?.entry || "", correctEnglish)
          .then((img) => {
            const url = img?.image_data_url || img?.imageUrl || "";
            if (url) {
              setAiImageUrl(url);
              saveStoredImage(lemma, url);
              setLlmCache(prev => ({
                ...prev,
                [lemma]: { ...(prev[lemma] || {}), imageUrl: url }
              }));
              persistSnapshot({
                llmCache: {
                  ...llmCache,
                  [lemma]: { ...(llmCache[lemma] || {}), imageUrl: url }
                }
              });
            } else {
              setImageError("(Image unavailable.)");
            }
            setImageLoading(false);
          })
          .catch(() => {
            setImageError("(Image unavailable.)");
            setImageLoading(false);
          });
      }
    } catch {
      setImageError("(Image unavailable.)");
      setImageLoading(false);
    }


    // Save snapshot after answer
    persistSnapshot({
      logs: nextLogs,
      phaseLogs: pl,
    });
  }

  function simpleLocalExample(lemma, mode, entry, english) {
    const isVerb = (english || "").toLowerCase().startsWith("to ");
    if (isVerb) {
      const base = (english || "").replace(/^to\s+/i, "");
      return {
        latin_sentence: `Puella ${lemma} cotidie.`,
        english_translation: `The girl ${base}s every day.`
      };
    }
    return {
      latin_sentence: `Puella ${lemma} videt.`,
      english_translation: `The girl sees the ${english}.`
    };
  }

  function FeedbackView() {
    const isPhase1 = phase === 1;
    const isPhase2 = phase === 2;
    const isPhase3 = phase === 3;

    const lemma = isPhase1 ? order[idx] : (isPhase2 ? phase2Queue[0] : phase3Queue[0]);
    const rec = wordSet[lemma];
    const correctEnglish = rec ? rec[0] : "";
    const meta = rec ? rec[3] : null;
    const gotIt = !!lastWasCorrect;

    // Progress helper bars
    const p2Target = phase2OrigCount();
    const p2Done = Math.max(0, p2Target - (phase2Queue?.length || 0));
    const p3Done = Math.max(0, (phase3Orig || 0) - (phase3Queue?.length || 0));

    return (
      <div style={wrap}>
        <HeaderTimer elapsedRef={elapsedRef} />
        <h3>{gotIt ? "✅ Correct" : "❌ Incorrect"}</h3>

        {phase === 2 && (
          <div style={{ marginBottom: 8 }}>
            <ProgressBar label="Phase 2 progress"
              value={p2Target ? p2Done / p2Target : 0}
              suffix={`${p2Done}/${p2Target} mastered`} />
          </div>
        )}
        {phase === 3 && (
          <div style={{ marginBottom: 8 }}>
            <ProgressBar label="Phase 3 progress"
              value={(phase3Orig || 0) ? p3Done / (phase3Orig || 1) : 0}
              suffix={`${p3Done}/${phase3Orig} mastered`} />
          </div>
        )}

        <div style={card}>
          <div style={{ marginBottom: 8 }}><strong>{lemma}</strong> — {correctEnglish}</div>
          <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.8 }}>Full entry: {meta?.entry}</div>

          {/* Example (no Note row; TTS removed) */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Example</div>
            {sentenceLoading && (
              <div style={{ marginBottom: 8 }}>
                <LoadingBar />
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Generating sentence & translation…</div>
              </div>
            )}
            {!sentenceLoading && llmData && (
              <div>
                <div><em>Latin:</em> {llmData.latin_sentence}</div>
                <div><em>English:</em> {llmData.english_translation}</div>
              </div>
            )}
            {!sentenceLoading && !llmData && (
              <div style={{ opacity: 0.7 }}>(Example unavailable.)</div>
            )}
          </div>

          {/* Mnemonics */}
          {!gotIt && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Helpful mnemonic</div>
              {mnemonicLoading ? (
                <div>
                  <LoadingBar />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Crafting a memory aid…</div>
                </div>
              ) : (
                <div style={{ fontSize: 14, opacity: 0.95 }}>
                  {aiMnemonic}
                </div>
              )}
            </div>
          )}         
          {/* Picture (cartoon image) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Picture</div>
  
              {imageLoading && (
                <div style={{ marginBottom: 8 }}>
                  <LoadingBar />
                 <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                   Generating an image…
                  </div>
                </div>
            )}
  
            {!imageLoading && aiImageUrl && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <img
                  src={aiImageUrl}
                  alt={`${lemma} — ${correctEnglish}`}
                  style={{
                    width: "min(340px, 100%)",
                    height: "auto",
                    borderRadius: 12,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                  }}
                />
              </div>
            )}
  
            {!imageLoading && !aiImageUrl && (
              <div style={{ opacity: 0.7 }}>{imageError || "(Image unavailable.)"}</div>
            )}
          </div>
  
          
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={nextAfterFeedback} style={primary}>Next</button>
          <button onClick={confirmEndSession} style={secondary}>End Session</button>
          <button onClick={restartSession} style={secondary}>Restart Session</button>
        </div>
      </div>
    );
  }

  function nextAfterFeedback() {
    if (phase === 1) {
      const nextIndex = idx + 1;

      if (nextIndex >= order.length) {
        // Build Phase 2 queue from Phase 1 misses
        const p1 = phaseLogs[1] || {};
        const misses = [];
        Object.keys(p1).forEach(lemma => {
          const arr = p1[lemma] || [];
          if (arr.length && arr[arr.length - 1] === false) misses.push(lemma);
        });

        const queue = shuffle(misses);
        setPhase2Queue(queue);
        setPhase2Tries({});
        setReportType("phase1");
        persistSnapshot({
          idx: nextIndex,
          phase: 1,
          phase2: { queue, tries: {} }
        });
        setScreen("report");
        return;
      }

      setIdx(nextIndex);
      setCurrentAnswer(null);
      setLlmData(null);
      setSentenceLoading(false);
      setAiMnemonic("");
      setMnemonicLoading(false);
      setLastWasCorrect(null);
      setAiImageUrl("");
      setImageLoading(false);
      setImageError("");
      persistSnapshot({ idx: nextIndex });
      setScreen("question");
      return;
    }

    if (phase === 2) {
      const lemma = phase2Queue[0];
      if (!lemma) {
        setReportType("phase2");
        setScreen("report");
        return;
      }
      const rec = wordSet[lemma];
      const correct = rec ? rec[0] : "";
      const gotIt = !!lastWasCorrect;

      let nextQueue = [...phase2Queue];
      let nextTries = { ...phase2Tries };
      nextTries[lemma] = (nextTries[lemma] || 0) + 1;

      if (gotIt) {
        nextQueue.shift();
      } else {
        nextQueue = [...nextQueue.slice(1), lemma];
      }

      setPhase2Queue(nextQueue);
      setPhase2Tries(nextTries);

      persistSnapshot({ phase: 2, phase2: { queue: nextQueue, tries: nextTries } });

      if (nextQueue.length === 0) {
        setReportType("phase2");
        setScreen("report");
        return;
      }

      setCurrentAnswer(null);
      setLlmData(null);
      setSentenceLoading(false);
      setAiMnemonic("");
      setMnemonicLoading(false);
      setLastWasCorrect(null);
      setScreen("question");
      return;
    }

    // Phase 3
    const lemma = phase3Queue[0];
    if (!lemma) {
      finishSession();
      return;
    }

    const gotIt = !!lastWasCorrect;
    let q = [...phase3Queue];
    let tries = { ...phase3Tries };

    if (gotIt) {
      q.shift();
      delete tries[lemma];
    } else {
      q = [...q.slice(1), lemma];
      tries[lemma] = 0;
    }

    setPhase3Queue(q);
    setPhase3Tries(tries);
    setTypedInput("");
    setPhase3InlineError("");
    setPhase3HintLoading(false);
    setLastWasCorrect(null);

    persistSnapshot({ phase: 3, phase3: { queue: q, tries: tries, orig: phase3Orig } });

    if (q.length === 0) {
      finishSession();
      return;
    }

    setScreen("question");
  }

  function phase2OrigCount() {
    const q = Array.isArray(phase2Queue) ? phase2Queue : [];
    const keys = Object.keys(phase2Tries || {});
    const total = new Set([...q, ...keys]).size;
    return total || 1;
  }

  function computeStatsPhaseAware() {
    let right = 0, wrong = 0;
    Object.keys(logs).forEach((lemma) => { (logs[lemma] || []).forEach((b) => (b ? right++ : wrong++)); });
    const pct = right + wrong ? Math.round((right / (right + wrong)) * 100) : 0;
    return { right, wrong, pct, total: right + wrong };
  }

  function ReportView() {
    const isPhase1 = reportType === "phase1";
    const stats = computeStatsPhaseAware(); // across all answers so far

    return (
      <div style={wrap}>
        <h2>{isPhase1 ? "Phase 1 Summary" : "Phase 2 Summary"}</h2>

        <div style={{ marginBottom: 8, fontSize: 18 }}>
          Right: {stats.right} • Wrong: {stats.wrong} • Accuracy: {stats.pct}%
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Elapsed Time:</strong> {formatTime(elapsedRef.current)}
        </div>

        {/* Missed words section */}
        {isPhase1 ? (
          <MissedBlockPhase1 phaseLogs={phaseLogs} wordSet={wordSet} />
        ) : (
          <MissedBlockPhase2 tries={phase2Tries} wordSet={wordSet} />
        )}

        {/* Optional flashcards at phase 2 end */}
        {!isPhase1 && (
          <div style={card}>
            <h4 style={{ marginTop: 0 }}>Flashcards (Phase 2 set)</h4>
            <div>Download printable PDF for words involved in Phase 2.</div>
            <div style={{ marginTop: 8 }}>
              <button
                style={secondary}
                onClick={() => {
                  const subset = {};
                  Object.keys(wordSet).forEach(lemma => {
                    if (phase2Tries[lemma] != null) subset[lemma] = wordSet[lemma];
                  });
                  const pack = Object.keys(subset).length ? subset : wordSet;
                  downloadFlashcardsPDF(pack, selection.mode);
                }}
              >
                Download Flashcards (PDF)
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isPhase1 ? (
            <button onClick={proceedToPhase2} style={primary}>
              Proceed to Phase 2
            </button>
          ) : (
            <>
              <button onClick={proceedToPhase3} style={primary}>Proceed to Phase 3</button>
              {/* No Finish Session button here per request */}
            </>
          )}
        </div>
      </div>
    );
  }

  function MissedBlockPhase1({ phaseLogs, wordSet }) {
    const p1 = phaseLogs[1] || {};
    const missedOnce = [];
    Object.keys(p1).forEach(lemma => {
      const arr = p1[lemma] || [];
      if (arr.length && arr[arr.length - 1] === false) {
        missedOnce.push(lemma);
      }
    });
    return (
      <div style={card}>
        <h4 style={{ marginTop: 0 }}>Missed words in Phase 1</h4>
        {missedOnce.length === 0 ? (
          <div>No misses — excellent! You can still proceed to Phase 2 (quick check) or finish now.</div>
        ) : (
          <ul style={{ margin: "8px 0 0 18px" }}>
            {missedOnce.map(lemma => {
              const rec = wordSet[lemma];
              return <li key={lemma}><strong>{lemma}</strong> — {rec ? rec[0] : ""}</li>;
            })}
          </ul>
        )}
      </div>
    );
  }

  function MissedBlockPhase2({ tries, wordSet }) {
    const lemmas = Object.keys(tries || {});
    if (lemmas.length === 0) {
      return (
        <div style={card}>
          <h4 style={{ marginTop: 0 }}>Missed words…</h4>
          <div>No words needed remediation in Phase 2. 🎉</div>
        </div>
      );
    }
    return (
      <div style={card}>
        <h4 style={{ marginTop: 0 }}>Missed words and retries (Phase 2)</h4>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Lemma</th>
              <th style={th}>English</th>
              <th style={th}>Entry</th>
              <th style={th}>Phase 2 Attempts</th>
            </tr>
          </thead>
          <tbody>
            {lemmas.map((lemma) => {
              const rec = wordSet[lemma];
              return (
                <tr key={lemma} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{lemma}</td>
                  <td style={td}>{rec ? rec[0] : "—"}</td>
                  <td style={td}>{rec ? rec[3]?.entry : "—"}</td>
                  <td style={td}>×{tries[lemma] || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function proceedToPhase2() {
    const q = [...phase2Queue];
    setPhase(2);
    persistSnapshot({ phase: 2 });

    if (q.length === 0) {
      setReportType("phase2");
      setScreen("report");
      return;
    }
    setScreen("question");
  }

  function proceedToPhase3() {
    // Build Phase 3 queue from ALL session words, shuffled
    const allLemmas = Object.keys(wordSet || {});
    const queue = shuffle(allLemmas);
    setPhase(3);
    setPhase3Queue(queue);
    setPhase3Orig(queue.length);
    setPhase3Tries({});
    setTypedInput("");
    setPhase3InlineError("");
    setPhase3HintLoading(false);
    setReportType(null);
    persistSnapshot({ phase: 3, phase3: { queue, tries: {}, orig: queue.length } });
    setScreen("question");
  }

  function finishSession() {
    try {
      // Compute totals across all phases
      let right = 0, total = 0;
      Object.keys(logs).forEach((lemma) => { (logs[lemma] || []).forEach((b) => { if (b) right++; total++; }); });
      const pts = pointsFromRaw(right);

      // Save session history
      const persisted = pushHistory({
        timestampStart: Date.now() - (elapsedRef.current || 0),
        mode: selection.mode,
        categories: Array.from(selection.categories || []),
        accuracyPct: total ? Math.round((right / total) * 100) : 0,
        totalTimeMs: elapsedRef.current || 0,
        pointsAwarded: pts,
        items: Object.keys(wordSet).map((lemma) => {
          const arr = logs[lemma] || [];
          return { lemma, correctCount: arr.filter(Boolean).length, attemptCount: arr.length };
        })
      });

      // Add points to account
      addPoints(pts);
      const newTotal = getPoints();
      const rank = describeRankByPoints(newTotal);

      // Mark words as seen
      const seen = loadSeenWords(selection.mode) || {};
      Array.from(selection.categories || []).forEach((c) => {
        const k = String(c);
        if (!(seen[k] instanceof Set)) {
          seen[k] = new Set(Array.isArray(seen[k]) ? seen[k] : (seen[k] ? [seen[k]] : []));
        }
      });
      Object.keys(wordSet).forEach((lemma) => {
        const meta = wordSet[lemma][3] || {};
        const key = selection.mode === "noun" ? String(meta.declension) : String(meta.conjugation);
        if (!key) return;
        if (!(seen[key] instanceof Set)) {
          seen[key] = new Set(Array.isArray(seen[key]) ? seen[key] : (seen[key] ? [seen[key]] : []));
        }
        seen[key].add(lemma);
      });
      saveSeenWords(selection.mode, seen);

      // ⭐ Mastered words: increment star for final correct
      try {
        Object.keys(wordSet).forEach((lemma) => {
          const arr = logs[lemma] || [];
          if (arr.length && arr[arr.length - 1] === true) {
            const english = wordSet[lemma][0];
            const entry   = (wordSet[lemma][3] || {}).entry;
            addMastery(lemma, english, entry);
          }
        });
      } catch {}

      // Build final summary for congrats screen
      setFinalSummary({
        right,
        total,
        pct: total ? Math.round((right / total) * 100) : 0,
        timeMs: elapsedRef.current || 0,
        points: pts,
        rank
      });

    } finally {
      try { clearSnapshot(); } catch {}
      // reset internal state but go to final screen
      setReportType(null);
      setOrder([]);
      setWordSet({});
      setIdx(0);
      setPhase(1);
      setPhase2Queue([]);
      setPhase2Tries({});
      setPhase3Queue([]);
      setPhase3Orig(0);
      setPhase3Tries({});
      setLogs({});
      setPhaseLogs({ 1: {}, 2: {}, 3: {} });
      setChoices([]);
      setCurrentAnswer(null);
      setLlmData(null);
      setAiMnemonic("");
      setMnemonicLoading(false);
      setSentenceLoading(false);
      setLlmCache({});
      setLastWasCorrect(null);
      elapsedRef.current = 0;
      setScreen("final");
    }
  }

  // Persist partial snapshot merge
  function persistSnapshot(patch) {
    const snap = loadSnapshot() || {};
    const merged = {
      selection: snap.selection || { mode: selection.mode, categories: Array.from(selection.categories) },
      phase: (patch.phase ?? phase),
      wordSet: snap.wordSet || wordSet,
      order: snap.order || order,
      idx: (patch.idx ?? idx),
      logs: (patch.logs ?? logs),
      phaseLogs: (patch.phaseLogs ?? phaseLogs),
      phase2: (patch.phase2 ?? { queue: phase2Queue, tries: phase2Tries }),
      phase3: (patch.phase3 ?? { queue: phase3Queue, tries: phase3Tries, orig: phase3Orig }),
      llmCache: (patch.llmCache ?? llmCache),
      elapsedMs: (patch.elapsedMs ?? elapsedRef.current)
    };
    saveSnapshot(merged);
  }

  // ===== Final congrats screen =====
  function FinalView() {
    const f = finalSummary || { right: 0, total: 0, pct: 0, timeMs: 0, points: 0, rank: describeRankByPoints(getPoints()) };
    return (
      <div style={{ ...wrap, position: "relative", overflow: "hidden" }}>
        <ConfettiBurst />
        <h2>🎉 Session Complete!</h2>
        <div style={{ ...card, fontSize: 16 }}>
          <div><strong>Correct:</strong> {f.right} / {f.total} ({f.pct}%)</div>
          <div style={{ marginTop: 4 }}><strong>Time:</strong> {formatTime(f.timeMs)}</div>
          <div style={{ marginTop: 4 }}><strong>Points earned:</strong> +{f.points}</div>
        </div>

        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 34 }}>{f.rank.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>
              {f.rank.tierName} {f.rank.levelIndex ? roman(f.rank.levelIndex) : (f.rank.tierId === "deus" ? "" : "—")}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{f.rank.mastery}</div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar
                label={f.rank.atCap ? "Max Tier" : `To ${f.rank.nextTierName} ${f.rank.nextLevelName}`}
                value={Math.min(1, f.rank.nextNeed ? f.rank.intoNext / f.rank.nextNeed : 1)}
                suffix={f.rank.atCap ? "—" : `${f.rank.toNext} pts to next`}
              />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Your rank</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={() => setScreen("selector")}>Back to Start</button>
          <button style={secondary} onClick={() => setScreen("history")}>History / Leaderboard</button>
        </div>
      </div>
    );
  }

  // ===== History / Leaderboard (restored) =====
  function HistoryView() {
    const history = loadHistory() || [];
    const parsed = history
      .map(h => ({
        ...h,
        date: new Date(h.timestampStart || Date.now()),
        readableCats: (h.categories || []).map(String).join(", ")
      }))
      .sort((a,b) => b.date - a.date);

    const totalPoints = getPoints();
    const rank = describeRankByPoints(totalPoints);

    const bestAcc = parsed.reduce((acc, it) => it.accuracyPct > (acc?.accuracyPct ?? -1) ? it : acc, null);
    const fastGood = parsed
      .filter(it => it.accuracyPct >= 80)
      .reduce((best, it) => best ? (it.totalTimeMs < best.totalTimeMs ? it : best) : it, null);

    const mastered = listMastered(); // [{lemma, count, english, entry, lastAt}...]

    return (
      <div style={wrap}>
        <h2>History / Leaderboard</h2>

        {/* Rank panel */}
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 34 }}>{rank.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>
              {rank.tierName} {rank.levelIndex ? roman(rank.levelIndex) : (rank.tierId === "deus" ? "" : "—")}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{rank.mastery}</div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar
                label={rank.atCap ? "Max Tier" : `To ${rank.nextTierName} ${rank.nextLevelName}`}
                value={Math.min(1, rank.nextNeed ? rank.intoNext / rank.nextNeed : 1)}
                suffix={rank.atCap ? "—" : `${rank.toNext} pts to next`}
              />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>{totalPoints} pts</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Cumulative</div>
          </div>
        </div>

        {/* Bests */}
        <div style={{ ...card, marginTop: 8 }}>
          <h4 style={{ marginTop: 0 }}>Bests</h4>
          <div>
            <div>Best Accuracy: {bestAcc ? `${bestAcc.accuracyPct}%` : "—"}</div>
            <div>Fastest @ ≥80%: {fastGood ? formatTime(fastGood.totalTimeMs) : "—"}</div>
          </div>
        </div>

        {/* Mastered words */}
        <div style={{ ...card }}>
          <h4 style={{ marginTop: 0 }}>Mastered Words (⭐ per session-correct)</h4>
          {mastered.length === 0 ? (
            <div>No mastered words yet. Finish a session to start collecting stars!</div>
          ) : (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Lemma</th>
                    <th style={th}>English</th>
                    <th style={th}>Entry</th>
                    <th style={th}>Stars</th>
                    <th style={th}>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {mastered.slice(0, 200).map((m, i) => (
                    <tr key={m.lemma + i} style={{ borderTop: "1px solid #eee" }}>
                      <td style={td}>{m.lemma}</td>
                      <td style={td}>{m.english || "—"}</td>
                      <td style={td}>{m.entry || "—"}</td>
                      <td style={td} title={`${m.count} session(s) correct`}>
                        {"⭐".repeat(Math.min(8, m.count))}{m.count > 8 ? ` ×${m.count}` : ""}
                      </td>
                      <td style={td}>{m.lastAt ? new Date(m.lastAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mastered.length > 200 && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  Showing first 200. (We can add search/pagination later.)
                </div>
              )}
            </div>
          )}
        </div>

        {/* All sessions table + CSV */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button style={secondary} onClick={() => exportHistoryCSV()}>Export CSV</button>
          <button style={primary} onClick={() => setScreen("selector")}>Back</button>
        </div>

        <div style={card}>
          <h4 style={{ marginTop: 0 }}>All Sessions</h4>
          {parsed.length === 0 ? (
            <div>No completed sessions yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Mode</th>
                  <th style={th}>Categories</th>
                  <th style={th}>Accuracy</th>
                  <th style={th}>Time</th>
                  <th style={th}>Points</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>{h.date.toLocaleString()}</td>
                    <td style={td}>{h.mode === "verb" ? "Verbs" : "Nouns"}</td>
                    <td style={td}>{h.readableCats || "—"}</td>
                    <td style={td}>{h.accuracyPct}%</td>
                    <td style={td}>{formatTime(h.totalTimeMs || 0)}</td>
                    <td style={td}>{h.pointsAwarded ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }
}

// ===== Confetti (lightweight CSS) =====
function ConfettiBurst() {
  if (typeof document !== "undefined" && !document.getElementById("vt-confetti-css")) {
    const style = document.createElement("style");
    style.id = "vt-confetti-css";
    style.textContent = `
      @keyframes vt-fall {
        0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
        100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
      }
    `;
    document.head.appendChild(style);
  }
  const pieces = Array.from({ length: 80 }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur = 2.2 + Math.random() * 1.4;
    const size = 6 + Math.random() * 6;
    return (
      <div key={i} style={{
        position: "absolute",
        top: -20,
        left: `${left}vw`,
        width: size,
        height: size * (0.6 + Math.random()*0.8),
        background: `hsl(${Math.floor(Math.random()*360)},90%,65%)`,
        borderRadius: 2,
        opacity: 0.95,
        animation: `vt-fall ${dur}s ease-in ${delay}s both`
      }} />
    );
  });
  return <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{pieces}</div>;
}

// ===== Timer header =====
function HeaderTimer({ elapsedRef }) {
  const [, force] = useState(0);
  useEffect(() => { const h = setInterval(() => force(x => x + 1), 500); return () => clearInterval(h); }, []);
  return <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>⏱ {formatTime(elapsedRef.current)}</div>;
}

// ===== Small components & helpers =====
function ProgressBar({ label, value, suffix }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.8 }}>{label}</div>
      <div style={{ height: 10, background: "#eee", borderRadius: 999 }}>
        <div style={{
          width: `${pct}%`, height: 10, background: "#7eb", borderRadius: 999, transition: "width 400ms ease"
        }} />
      </div>
      <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>{suffix}</div>
    </div>
  );
}

function LoadingBar() {
  if (typeof document !== "undefined" && !document.getElementById("vt-loading-css")) {
    const style = document.createElement("style");
    style.id = "vt-loading-css";
    style.textContent = `
      @keyframes vt-load { 0%{transform:translateX(-60%)} 50%{transform:translateX(10%)} 100%{transform:translateX(120%)} }
    `;
    document.head.appendChild(style);
  }
  return (
    <div style={{ position: "relative", height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0, transform: "translateX(-60%)",
        background: "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(126,235,180,0.55) 50%, rgba(0,0,0,0) 100%)",
        animation: "vt-load 1.2s ease-in-out infinite"
      }} />
    </div>
  );
}

function roman(n) { return ["","I","II","III"][n] || ""; }

const wrap = { maxWidth: 750, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif" };
const row = { display: "flex", gap: 8, alignItems: "center" };
const rowWrap = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 };
const primary = { padding: "8px 14px", borderRadius: 8, border: "1px solid #444", background: "#eee", cursor: "pointer" };
const secondary = { padding: "8px 14px", borderRadius: 8, border: "1px solid #aaa", background: "#fafafa", cursor: "pointer" };
const danger = { padding: "8px 14px", borderRadius: 8, border: "1px solid #844", background: "#ffecec", cursor: "pointer" };
const mini = { padding: "2px 8px", borderRadius: 999, border: "1px solid #aaa", background: "#fafafa", cursor: "pointer", marginLeft: 8, fontSize: 12 };
const card = { border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 8 };
const choice = { display: "block", padding: "6px 0" };
const chip = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  border: "1px solid " + (active ? "#444" : "#ccc"),
  padding: "6px 10px", borderRadius: 999
});
const btn = (active) => ({
  padding: "6px 10px", borderRadius: 8,
  border: "1px solid " + (active ? "#222" : "#aaa"),
  background: active ? "#e9e9e9" : "#f7f7f7", cursor: "pointer"
});
const select = { padding: "6px 10px", borderRadius: 8, border: "1px solid #aaa", background: "#fff" };
const toggleWrap = { display: "inline-flex", alignItems: "center", fontWeight: 600 };

const th = { textAlign: "left", padding: "6px 8px", fontWeight: 600, borderBottom: "1px solid #eee" };
const td = { textAlign: "left", padding: "6px 8px" };

function formatTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60).toString().padStart(2, "0");
  const s = (t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
