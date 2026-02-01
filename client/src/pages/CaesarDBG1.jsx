import { useEffect, useMemo, useRef, useState } from "react";
import CaesarSentence from "../components/CaesarSentence";
import TextSelector from "../components/TextSelector";
import {
  logAttemptEvent,
  EVENT_TYPES,
  SKILLS,
  SUBSKILLS,
} from "../lib/attemptEvents";
import { API_BASE_URL } from "../lib/api";
/**
 * Caesar DBG1 MVP
 * - Setup: choose chapter range
 * - Phase 1: Multiple choice (all words once)
 * - Phase 1 Report (continue)
 * - Phase 2: Multiple choice (only missed words; loop until each correct once)
 * - Phase 2 Report (continue)
 * - Phase 3: Type-back (KEEP AS-IS)
 * - Final Report
 */

function shuffleArray(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffle(a) {
  return shuffleArray(a);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeForCompare(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[“”‘’"']/g, "")
    .replace(/\s+/g, " ");
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
}

function MCQuestion({
  lemma,
  prompt,
  choices,
  selected,
  onSelect,
  onSubmit,
  onNext,
  feedback,
  showCorrect,
  disabled,
  showNextButton,
}) {
  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
      <div className="text-2xl font-bold text-primary mb-2">{lemma}</div>
      <div className="text-gray-600 mb-4">{prompt}</div>

      <div className="grid gap-3">
        {choices.map((opt) => {
          const isSelected = selected === opt;
          return (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              disabled={disabled}
              className={`text-left w-full px-4 py-3 rounded-lg border-2 transition-all ${
                !showCorrect && isSelected
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 items-center">
        <button
          onClick={onSubmit}
          disabled={disabled || !selected}
          className={`px-5 py-2 rounded-lg font-bold transition-colors ${
            disabled || !selected
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-accent text-primary hover:bg-yellow-400"
          }`}
        >
          Submit
        </button>

        {showNextButton && (
          <button
            onClick={onNext}
            className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Next
          </button>
        )}

        <div className="min-h-6 text-gray-700">{feedback}</div>
      </div>
    </div>
  );
}

export default function CaesarDBG1() {
  const [phase, setPhase] = useState("setup"); // setup | p1 | p1_report | p2 | p2_report | p3 | final_report
  const [error, setError] = useState("");

  const [targets, setTargets] = useState([]); // enriched from backend: { lemma, upos, chapter, gloss_short, dictionary_entry, example: {sid,...}, ... }

  // Chapter selection (min/max)
  const [rangeMin, setRangeMin] = useState(1);
  const [rangeMax, setRangeMax] = useState(1);

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Phase 3 typing (KEEP AS-IS)
  const [typingQueue, setTypingQueue] = useState([]);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [typingAttempts, setTypingAttempts] = useState(0);
  const [typingHint, setTypingHint] = useState("");
  const [typingFeedback, setTypingFeedback] = useState("");

  // Tracking
  const [tries, setTries] = useState({}); // lemma -> { attempts, correct, wrong }
  const triesRef = useRef({});
  useEffect(() => {
    triesRef.current = tries;
  }, [tries]);

  const [wrongSet, setWrongSet] = useState(new Set());
  const [correctOnce, setCorrectOnce] = useState(new Set());

  // MC UI
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [showCorrect, setShowCorrect] = useState(false);
  const [mcLocked, setMcLocked] = useState(false);

  // Result screen bundle (between each word)
  const [resultBundle, setResultBundle] = useState(null);
  // shape: { isCorrect, lemma, correctDef, dictionary_entry, sid, latin, english, sentenceBundle, highlightTokenIndex }

  // Keep MC choice packs stable across renders/phases so the options don't reshuffle.
  const choicePackCacheRef = useRef(new Map());

  // Current session indices (so distractors only come from the same set)
  const sessionIndicesRef = useRef([]);

  // Refs for Set state (handy for phase transitions)
  const wrongSetRef = useRef(new Set());
  const correctOnceRef = useRef(new Set());
  const p3AdvanceRef = useRef(null);

  useEffect(() => {
    wrongSetRef.current = wrongSet;
  }, [wrongSet]);

  useEffect(() => {
    correctOnceRef.current = correctOnce;
  }, [correctOnce]);

  function resetMCUI() {
    setSelectedChoice(null);
    setFeedback("");
    setShowCorrect(false);
    setMcLocked(false);
    setResultBundle(null);
  }

  function bumpTry(lemma, correct) {
    setTries((prev) => {
      const cur = prev[lemma] || { attempts: 0, correct: 0, wrong: 0 };
      const next = {
        attempts: cur.attempts + 1,
        correct: cur.correct + (correct ? 1 : 0),
        wrong: cur.wrong + (correct ? 0 : 1),
      };
      return { ...prev, [lemma]: next };
    });
  }

  function buildPhaseReportFromState(name, wrongLemmasSet) {
    const wrong = Array.from(wrongLemmasSet || []);
    return {
      name,
      wrongCount: wrong.length,
      wrong,
    };
  }

  const [phaseReport, setPhaseReport] = useState(null);
  const [phaseReportNext, setPhaseReportNext] = useState(null);
  // phaseReportNext: { kind: "toP2", wrongLemmas } | { kind: "toP3" } | { kind: "toFinal" }

  // Timer
  const [startMs, setStartMs] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    // run timer any time we're not in setup
    if (!startMs) return;
    if (phase === "setup") return;

    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    }, 250);

    return () => clearInterval(id);
  }, [startMs, phase]);

  const overallAccuracy = useMemo(() => {
    const obj = tries || {};
    let attempts = 0;
    let correct = 0;

    Object.values(obj).forEach((v) => {
      attempts += Number(v?.attempts || 0);
      correct += Number(v?.correct || 0);
    });

    const pct = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
    return { attempts, correct, pct };
  }, [tries]);

  function sessionMaxChapter() {
    let m = 1;
    for (const t of targets) {
      const ch = Number(t?.chapter);
      if (Number.isFinite(ch)) m = Math.max(m, ch);
    }
    return m;
  }

  function getShortDef(t) {
    const s = String(t?.gloss_short || "").trim();
    if (s) return s;
    const g = String(t?.gloss || "").trim();
    return g || "(definition pending)";
  }

  function normalizeLatinForm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/j/g, "i")
      .replace(/v/g, "u")
      .replace(/[^a-z]/g, "");
  }

  async function fetchExampleBySid(sid) {
    if (!sid) return { sid: "", latin: "", english: "" };
    try {
      const res = await fetch(`${API_BASE_URL}/api/caesar/example?sid=${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      return {
        sid: String(data?.sid || sid),
        latin: String(data?.latin || ""),
        english: String(data?.english || ""),
      };
    } catch {
      return { sid: String(sid), latin: "", english: "" };
    }
  }

  async function fetchSentenceBundleBySid(sid) {
    const s = String(sid || "").trim();
    if (!s) return null;

    const res = await fetch(`${API_BASE_URL}/api/caesar/sentenceBundle?sid=${encodeURIComponent(s)}`);
    if (!res.ok) return null;

    const data = await res.json();
    return data?.sentence || data || null;
  }

  function startSession() {
    setError("");
    choicePackCacheRef.current = new Map();
    sessionIndicesRef.current = [];
    resetMCUI();

    if (!targets.length) {
      setError("No targets loaded yet.");
      return;
    }

    const maxCh = sessionMaxChapter();
    const lo = clamp(Number(rangeMin || 1), 1, maxCh);
    const hi = clamp(Number(rangeMax || lo), lo, maxCh);

    const inRange = targets
      .map((t, idx) => ({ idx, t }))
      .filter((x) => {
        const ch = Number(x.t?.chapter);
        return Number.isFinite(ch) && ch >= lo && ch <= hi;
      });

    const seen = new Set();
    const uniqueIdxs = [];
    for (const x of inRange) {
      const lemma = String(x.t?.lemma || "").trim().toLowerCase();
      if (!lemma) continue;
      if (seen.has(lemma)) continue;
      seen.add(lemma);
      uniqueIdxs.push(x.idx);
    }

    if (!uniqueIdxs.length) {
      setError("No targets in that chapter range.");
      return;
    }

    sessionIndicesRef.current = uniqueIdxs.slice();

    setQueue(shuffle(uniqueIdxs));
    setCurrentIndex(0);

    setPhaseReport(null);
    setPhaseReportNext(null);

    setTries({});
    setWrongSet(new Set());
    wrongSetRef.current = new Set();
    setCorrectOnce(new Set());
    correctOnceRef.current = new Set();

    setStartMs(Date.now());
    setElapsedSec(0);

    setPhase("p1");
  }

  function buildChoicesForIndex(targetIndex) {
    const cacheKey = String(targetIndex);
    const cached = choicePackCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const target = targets[targetIndex];
    const correctLabel = getShortDef(target);

    const sessionIdxs =
      sessionIndicesRef.current && sessionIndicesRef.current.length
        ? sessionIndicesRef.current
        : targets.map((_, i) => i);

    const targetUpos = String(target?.upos || "").trim();
    const basePool = sessionIdxs
      .map((idx) => ({
        idx,
        upos: String(targets[idx]?.upos || "").trim(),
        gloss: getShortDef(targets[idx]),
      }))
      .filter((x) => x.idx !== targetIndex && x.gloss && x.gloss !== correctLabel);

    let pool = basePool.filter((x) => targetUpos && x.upos === targetUpos);
    if (pool.length < 3) pool = basePool;

    const shuffled = shuffleArray(pool).slice(0, 3);
    const distractors = shuffled.map((x) => x.gloss);

    const choices = shuffleArray([correctLabel, ...distractors]).slice(0, 4);

    const pack = { choices, correctLabel };
    choicePackCacheRef.current.set(cacheKey, pack);
    return pack;
  }

  function currentTarget() {
    const idx = queue[currentIndex];
    return targets[idx];
  }

  function currentChoicePack() {
    const idx = queue[currentIndex];
    return buildChoicesForIndex(idx);
  }

  async function lockAndBuildResultScreen({ isCorrect, lemma, correctDef, t }) {
    const dictEntry = String(t?.dictionary_entry || "").trim();
    const sid = String(t?.example?.sid || "").trim();

    const sentenceBundle = sid ? await fetchSentenceBundleBySid(sid) : null;
    const ex = sid ? await fetchExampleBySid(sid) : { sid: "", latin: "", english: "" };

    const highlightTokenIndex = Number.isFinite(Number(t?.example?.token_index))
      ? Number(t.example.token_index)
      : null;

    setResultBundle({
      isCorrect,
      lemma,
      correctDef,
      dictionary_entry: dictEntry,
      sid: ex.sid || sid,
      sentenceBundle: sentenceBundle || null,
      highlightTokenIndex,
      latin: ex.latin || "",
      english: ex.english || "",
    });
  }

  async function submitPhase1Answer() {
    if (mcLocked) return;
    const qIdx = queue[currentIndex];
    const t = targets[qIdx];
    const lemma = t?.lemma || "";
    if (!lemma) return;
    if (!selectedChoice) return;

    const pack = buildChoicesForIndex(qIdx);
    const isCorrect = selectedChoice === pack.correctLabel;

    bumpTry(lemma, isCorrect);

    // Phase 2: Log to universal event store
    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "caesar_vocab",
      skillId: SKILLS.VOCAB_GENERAL,
      subskillId: SUBSKILLS.RECOGNIZE,
      itemId: lemma,
      correct: isCorrect,
      userAnswer: selectedChoice,
      expectedAnswer: pack.correctLabel,
      metadata: { phase: "p1", chapter: t?.chapter },
    });

    setFeedback(isCorrect ? "Correct." : "Incorrect.");
    setShowCorrect(true);
    setMcLocked(true);

    if (!isCorrect) {
      setWrongSet((prev) => {
        const next = new Set(prev);
        next.add(lemma);
        wrongSetRef.current = next;
        return next;
      });
    }

    await lockAndBuildResultScreen({
      isCorrect,
      lemma,
      correctDef: pack.correctLabel,
      t,
    });
  }

  function startPhase2FromWrong(wrongLemmas) {
    const wrong = new Set(
      (Array.isArray(wrongLemmas) ? wrongLemmas : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );

    const seenLemma = new Set();
    const idxs = [];
    for (let i = 0; i < targets.length; i++) {
      const lem = String(targets[i]?.lemma || "").trim();
      if (!lem) continue;
      if (!wrong.has(lem)) continue;
      if (seenLemma.has(lem)) continue;
      seenLemma.add(lem);
      idxs.push(i);
    }

    setQueue(shuffleArray(idxs));
    setCurrentIndex(0);
    setPhase("p2");

    setWrongSet(new Set());
    wrongSetRef.current = new Set();
    setCorrectOnce(new Set());
    correctOnceRef.current = new Set();

    resetMCUI();
  }

  async function submitPhase2Answer() {
    if (mcLocked) return;

    const qIdx = queue[currentIndex];
    const t = targets[qIdx];
    const lemma = t?.lemma || "";
    if (!lemma) return;
    if (!selectedChoice) return;

    const pack = buildChoicesForIndex(qIdx);
    const isCorrect = selectedChoice === pack.correctLabel;

    bumpTry(lemma, isCorrect);

    // Phase 2: Log to universal event store
    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "caesar_vocab",
      skillId: SKILLS.VOCAB_GENERAL,
      subskillId: SUBSKILLS.RECOGNIZE,
      itemId: lemma,
      correct: isCorrect,
      userAnswer: selectedChoice,
      expectedAnswer: pack.correctLabel,
      metadata: { phase: "p2", chapter: t?.chapter },
    });

    setFeedback(isCorrect ? "Correct." : "Incorrect.");
    setShowCorrect(true);
    setMcLocked(true);

    if (isCorrect) {
      setCorrectOnce((prev) => {
        const next = new Set(prev);
        next.add(lemma);
        correctOnceRef.current = next;
        return next;
      });
    } else {
      setWrongSet((prev) => {
        const next = new Set(prev);
        next.add(lemma);
        wrongSetRef.current = next;
        return next;
      });
    }

    await lockAndBuildResultScreen({
      isCorrect,
      lemma,
      correctDef: pack.correctLabel,
      t,
    });
  }

  function toPhaseReport(name, next) {
    setPhaseReport(buildPhaseReportFromState(name, new Set(wrongSetRef.current)));
    setPhaseReportNext(next);
    setPhase(name === "Phase 1" ? "p1_report" : "p2_report");
  }

  function handleNextMC() {
    if (!mcLocked) return;

    if (phase === "p3" && p3AdvanceRef.current) {
      const st = p3AdvanceRef.current;
      p3AdvanceRef.current = null;

      setShowCorrect(false);
      setMcLocked(false);

      if (st.kind === "toFinal") {
        setPhaseReportNext({ kind: "toFinal" });
        setPhase("final_report");
        setTyped("");
        setTypingAttempts(0);
        setTypingHint("");
        return;
      }

      if (st.kind === "continuePass") {
        setTypingQueue(Array.isArray(st.typingQueue) ? st.typingQueue : typingQueue);
        setTypingIndex(Number.isFinite(st.typingIndex) ? st.typingIndex : 0);
        setTyped("");
        setTypingAttempts(0);
        setTypingHint("");
        resetMCUI();
        return;
      }
    }

    if (phase === "p1") {
      const nextIndex = currentIndex + 1;

      if (nextIndex < queue.length) {
        setCurrentIndex(nextIndex);
        resetMCUI();
        return;
      }

      const phase1Wrong = new Set(wrongSetRef.current);
      if (phase1Wrong.size > 0) {
        toPhaseReport("Phase 1", { kind: "toP2", wrongLemmas: Array.from(phase1Wrong) });
      } else {
        toPhaseReport("Phase 1", { kind: "toP3" });
      }

      resetMCUI();
      return;
    }

    if (phase === "p2") {
      const nextIndex = currentIndex + 1;

      if (nextIndex < queue.length) {
        setCurrentIndex(nextIndex);
        resetMCUI();
        return;
      }

      const mastered = correctOnceRef.current;
      const remaining = queue.filter((qIdx) => {
        const lemma = targets[qIdx]?.lemma || "";
        return lemma && !mastered.has(lemma);
      });

      if (remaining.length === 0) {
        toPhaseReport("Phase 2", { kind: "toP3" });
        resetMCUI();
        return;
      }

      setQueue(shuffleArray(remaining));
      setCurrentIndex(0);
      resetMCUI();
      return;
    }
  }

  function startPhase3FromAll() {
    const sessionIdxs =
      sessionIndicesRef.current && sessionIndicesRef.current.length
        ? sessionIndicesRef.current.slice()
        : targets.map((_, i) => i);

    const indices = shuffleArray(sessionIdxs);

    setTypingQueue(indices);
    setTypingIndex(0);
    setTyped("");
    setTypingAttempts(0);
    setTypingHint("");
    setTypingFeedback("");
    setWrongSet(new Set());
    wrongSetRef.current = new Set();
    setCorrectOnce(new Set());
    correctOnceRef.current = new Set();
    setPhase("p3");
    resetMCUI();
  }

  function continueFromReport() {
    if (!phaseReportNext) return;

    if (phaseReportNext.kind === "toP2") {
      startPhase2FromWrong(phaseReportNext.wrongLemmas || []);
      return;
    }

    if (phaseReportNext.kind === "toP3") {
      startPhase3FromAll();
      return;
    }
  }

  async function fetchHintForLemma(lemma, entry, english) {
    const l = String(lemma || "").trim();
    if (!l) return "";

    try {
      const res = await fetch(`${API_BASE_URL}/api/latinHint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lemma: l,
          entry: String(entry || "").trim(),
          english: String(english || "").trim(),
        }),
      });

      if (!res.ok) return "";
      const data = await res.json().catch(() => ({}));
      return String(data?.hint || "").trim();
    } catch {
      return "";
    }
  }

  async function requestHint() {
    const idx = typingQueue[typingIndex];
    const t = targets[idx];
    const lemma = String(t?.lemma || "").trim();
    if (!lemma) return;

    const english =
      String(t?.gloss_short || "").trim() ||
      String(t?.gloss || "").trim() ||
      "";

    const entry = String(t?.dictionary_entry || "").trim();

    const hint = await fetchHintForLemma(lemma, entry, english);
    setTypingHint(hint || "(no hint)");
  }

  async function submitTyping() {
    if (mcLocked) return;

    const qIdx = typingQueue[typingIndex];
    const t = targets[qIdx];
    const lemma = String(t?.lemma || "").trim();
    if (!lemma) return;

    const def = getShortDef(t);
    const guessRaw = String(typed || "").trim();
    if (!guessRaw) return;

    const expectedLemma = lemma;

    const isCorrect =
      normalizeLatinForm(guessRaw) === normalizeLatinForm(expectedLemma);

    // Phase 2: Log to universal event store
    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "caesar_vocab",
      skillId: SKILLS.VOCAB_GENERAL,
      subskillId: SUBSKILLS.PRODUCE,
      itemId: lemma,
      correct: isCorrect,
      userAnswer: guessRaw,
      expectedAnswer: expectedLemma,
      metadata: { phase: "p3", chapter: t?.chapter, attemptNum: (typingAttempts || 0) + 1 },
    });

    const storeP3Advance = (nextState) => {
      p3AdvanceRef.current = nextState;
    };

    if (isCorrect) {
      bumpTry(lemma, true);

      setTypingFeedback("Correct.");
      setTypingHint("");

      setCorrectOnce((prev) => {
        const next = new Set(prev);
        next.add(lemma);
        correctOnceRef.current = next;
        return next;
      });

      const remaining = typingQueue.filter((_, i) => i !== typingIndex);

      if (remaining.length === 0) {
        const mastered = correctOnceRef.current;
        const still = typingQueue.filter((qi) => {
          const l = String(targets[qi]?.lemma || "").trim();
          return l && !mastered.has(l);
        });

        if (still.length === 0) {
          storeP3Advance({ kind: "toFinal" });
        } else {
          storeP3Advance({
            kind: "continuePass",
            typingQueue: shuffleArray(still),
            typingIndex: 0,
          });
        }
      } else {
        storeP3Advance({
          kind: "continuePass",
          typingQueue: remaining,
          typingIndex: Math.min(typingIndex, remaining.length - 1),
        });
      }

      await lockAndBuildResultScreen({
        isCorrect: true,
        lemma,
        correctDef: def,
        t,
      });

      setShowCorrect(true);
      setMcLocked(true);
      return;
    }

    bumpTry(lemma, false);

    const nextAttempts = (Number(typingAttempts) || 0) + 1;
    setTypingAttempts(nextAttempts);

    if (nextAttempts === 1) {
      const idx = typingQueue[typingIndex];
      const tt = targets[idx];

      const english =
        String(tt?.gloss_short || "").trim() ||
        String(tt?.gloss || "").trim() ||
        "";

      const entry = String(tt?.dictionary_entry || "").trim();

      const h = await fetchHintForLemma(lemma, entry, english);
      setTypingHint(h || "(no hint)");
      setTypingFeedback("Incorrect. Try again.");
      return;
    }

    setTypingFeedback("Incorrect.");
    setTypingHint("");

    setWrongSet((prev) => {
      const next = new Set(prev);
      next.add(lemma);
      wrongSetRef.current = next;
      return next;
    });

    const nextIndex = typingIndex + 1;

    if (nextIndex < typingQueue.length) {
      storeP3Advance({
        kind: "continuePass",
        typingQueue,
        typingIndex: nextIndex,
      });
    } else {
      const mastered = correctOnceRef.current;
      const remaining2 = typingQueue.filter((qIdx2) => {
        const l = String(targets[qIdx2]?.lemma || "").trim();
        return l && !mastered.has(l);
      });

      if (remaining2.length === 0) {
        storeP3Advance({ kind: "toFinal" });
      } else {
        storeP3Advance({
          kind: "continuePass",
          typingQueue: shuffleArray(remaining2),
          typingIndex: 0,
        });
      }
    }

    await lockAndBuildResultScreen({
      isCorrect: false,
      lemma,
      correctDef: def,
      t,
    });

    setShowCorrect(true);
    setMcLocked(true);
  }

  // load targets on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/caesar/targets`);
        const data = await res.json();
        const arr = Array.isArray(data?.targets) ? data.targets : [];

        if (!cancelled) {
          setTargets(arr);

          let maxCh = 1;
          for (const t of arr) {
            const ch = Number(t?.chapter);
            if (Number.isFinite(ch)) maxCh = Math.max(maxCh, ch);
          }

          setRangeMin(1);
          setRangeMax(Math.min(5, maxCh));
        }
      } catch (e) {
        if (!cancelled) setError("Failed to load targets.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = useMemo(() => {
    if (phase === "p1" || phase === "p2") {
      return queue.length ? `${currentIndex + 1} / ${queue.length}` : "";
    }
    if (phase === "p3") {
      return typingQueue.length ? `${typingIndex + 1} / ${typingQueue.length}` : "";
    }
    return "";
  }, [phase, queue.length, currentIndex, typingQueue.length, typingIndex]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Enter") return;
      if (e.isComposing) return;

      if (phase === "p1" || phase === "p2") {
        e.preventDefault();
        if (mcLocked) {
          handleNextMC();
        } else {
          if (!selectedChoice) return;
          (phase === "p1" ? submitPhase1Answer : submitPhase2Answer)();
        }
        return;
      }

      if (phase === "p3") {
        if (mcLocked || showCorrect) {
          handleNextMC();
        } else {
          submitTyping();
        }
        return;
      }

      if (phase === "setup") {
        e.preventDefault();
        startSession();
        return;
      }

      if (phase === "p1_report" || phase === "p2_report") {
        e.preventDefault();
        continueFromReport();
        return;
      }

      if (phase === "final_report") {
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    mcLocked,
    showCorrect,
    selectedChoice,
    currentIndex,
    queue,
    typingIndex,
    typingQueue,
    startMs,
  ]);

  const derivedFinalStats = useMemo(() => {
    const t = triesRef.current || {};
    const rows = Object.entries(t).map(([lemma, v]) => ({
      lemma,
      attempts: Number(v?.attempts || 0),
      correct: Number(v?.correct || 0),
      wrong: Number(v?.wrong || 0),
    }));

    const totalAttempts = rows.reduce((a, r) => a + r.attempts, 0);
    const totalCorrect = rows.reduce((a, r) => a + r.correct, 0);
    const totalWrong = rows.reduce((a, r) => a + r.wrong, 0);

    const hardest = rows
      .slice()
      .sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts || a.lemma.localeCompare(b.lemma))
      .slice(0, 10)
      .filter((r) => r.wrong > 0);

    return { totalAttempts, totalCorrect, totalWrong, hardest };
  }, [tries, phase]);

  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-primary mb-2">Vocabulary Practice</h1>
        <p className="text-gray-600 mb-4">Master Caesar's vocabulary chapter by chapter.</p>

      {error ? (
        <div className="p-4 border-2 border-red-300 bg-red-50 rounded-xl text-red-700 mb-4">
          {error}
        </div>
      ) : null}

      {phase !== "setup" && phase !== "final_report" ? (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => {
              setPhase("setup");
              setPhaseReport(null);
              setPhaseReportNext(null);
              setResultBundle(null);
              resetMCUI();
            }}
            className="px-4 py-2 text-sm border-2 border-gray-200 rounded-lg hover:border-red-300 hover:text-red-600 transition-colors text-gray-600"
          >
            End Session
          </button>
        </div>
      ) : null}

      {phase === "setup" ? (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-primary mb-4">Select Chapter Range</h3>
          <div className="flex gap-6 items-center flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700">Start:</label>
              <input
                type="number"
                min={1}
                max={rangeMax}
                value={rangeMin}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setRangeMin(Math.min(val, rangeMax));
                }}
                className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700">End:</label>
              <input
                type="number"
                min={rangeMin}
                value={rangeMax}
                onChange={(e) => {
                  const val = Math.max(rangeMin, Number(e.target.value) || rangeMin);
                  setRangeMax(val);
                }}
                className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={startSession}
            className="px-6 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Start Practice
          </button>
        </div>
      ) : null}

      {phase === "p1_report" || phase === "p2_report" ? (
        <div className="mt-4 space-y-4">
          <h2 className="text-xl font-bold text-primary">
            {phaseReport?.name ? `${phaseReport.name} Report` : "Report"}
          </h2>

          <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
            <div className="text-gray-700">
              Wrong count: <span className="font-bold text-primary">{phaseReport?.wrongCount ?? 0}</span>
            </div>
            {phaseReport?.wrong?.length ? (
              <div className="mt-3 text-sm text-gray-600">
                <span className="font-semibold">Missed lemmas:</span> {phaseReport.wrong.join(", ")}
              </div>
            ) : (
              <div className="mt-3 text-sm text-green-700 font-medium">Nice. Clean pass!</div>
            )}
          </div>

          <button
            onClick={continueFromReport}
            className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Continue
          </button>

          <p className="text-xs text-gray-500">Tip: Enter also continues.</p>
        </div>
      ) : null}

      {phase === "p1" || phase === "p2" ? (
        <div className="mt-4">
          {/* Progress indicator */}
          <div className="mb-4 flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-primary">{phase === "p1" ? "Phase 1" : "Phase 2"}</span>
              {" · "}
              <span className="font-medium">{currentIndex + 1}</span>
              <span className="text-gray-400"> / </span>
              <span className="font-medium">{queue.length}</span>
              <span className="text-gray-500"> words</span>
            </div>
            <div className="text-xs text-gray-500">
              {sessionIndicesRef.current?.length || 0} words in session
            </div>
          </div>

          {queue.length ? (
            <MCQuestion
              lemma={currentTarget()?.lemma}
              prompt={"Choose the correct definition:"}
              choices={currentChoicePack().choices}
              selected={selectedChoice}
              onSelect={setSelectedChoice}
              onSubmit={phase === "p1" ? submitPhase1Answer : submitPhase2Answer}
              onNext={handleNextMC}
              feedback={feedback}
              showCorrect={showCorrect}
              disabled={mcLocked}
              showNextButton={mcLocked}
            />
          ) : (
            <div className="text-gray-600">No items in queue.</div>
          )}

          {mcLocked && resultBundle ? (
            <div className="mt-4">
              <div
                className={`p-5 rounded-xl border-2 ${
                  resultBundle.isCorrect
                    ? "border-green-300 bg-green-50"
                    : "border-red-300 bg-red-50"
                }`}
              >
                <div className={`font-bold text-lg mb-2 ${resultBundle.isCorrect ? "text-green-700" : "text-red-700"}`}>
                  {resultBundle.isCorrect ? "Correct" : "Incorrect"}
                </div>

                <div className="text-gray-700">
                  <span className="font-semibold">Definition:</span> {resultBundle.correctDef}
                </div>

                {resultBundle.dictionary_entry ? (
                  <div className="mt-2 text-gray-700">
                    <span className="font-semibold">Dictionary:</span> {resultBundle.dictionary_entry}
                  </div>
                ) : null}

                {resultBundle.sentenceBundle ? (
                  <div className="mt-3">
                    <CaesarSentence
                      sentence={{
                        ...resultBundle.sentenceBundle,
                        translation:
                          resultBundle.sentenceBundle.translation || resultBundle.english || "",
                      }}
                      highlightTokenIndex={resultBundle.highlightTokenIndex}
                    />
                  </div>
                ) : resultBundle.latin ? (
                  <div className="text-base leading-relaxed mt-2">
                    <span className="font-semibold">Caesar:</span> {resultBundle.latin}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mt-2">
                    <span className="font-semibold">Caesar:</span> (example unavailable)
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-2">Tip: Enter also advances.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "p3" ? (
        <div className="mt-4">
          {/* Progress indicator */}
          <div className="mb-4 flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-primary">Phase 3</span>
              {" · "}
              <span className="font-medium">{typingIndex + 1}</span>
              <span className="text-gray-400"> / </span>
              <span className="font-medium">{typingQueue.length}</span>
              <span className="text-gray-500"> words</span>
            </div>
            <div className="text-xs text-gray-500">
              {sessionIndicesRef.current?.length || 0} words in session
            </div>
          </div>

          {!mcLocked ? (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
              <h3 className="text-lg font-bold text-primary mb-2">Phase 3: Type-back</h3>
              <p className="text-sm text-gray-600 mb-4">
                Type the <span className="font-semibold">Latin lemma</span> for the English definition.
              </p>

              <div className="text-lg text-gray-700 mb-4">
                <span className="font-semibold">Definition:</span> {getShortDef(targets[typingQueue[typingIndex]] || {})}
              </div>

              <div className="flex gap-3 flex-wrap items-center">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type the Latin lemma…"
                  className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none min-w-[260px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitTyping();
                  }}
                />

                <button
                  onClick={submitTyping}
                  className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
                >
                  Submit
                </button>

                <button
                  onClick={requestHint}
                  className="px-4 py-2 border-2 border-gray-200 rounded-lg hover:border-accent transition-colors text-gray-600"
                >
                  Hint
                </button>
              </div>

              {typingHint ? (
                <div className="mt-4 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                  <div className="text-xs font-bold text-accent mb-1">Hint</div>
                  <div className="text-sm text-gray-700">{typingHint}</div>
                </div>
              ) : null}

              {typingFeedback ? (
                <div className="mt-3 text-sm text-gray-700">{typingFeedback}</div>
              ) : null}

              {typingAttempts ? (
                <div className="mt-2 text-xs text-gray-500">Attempts: {typingAttempts}/2</div>
              ) : null}
            </div>
          ) : null}

          {mcLocked && resultBundle ? (
            <div className="mt-4">
              <div
                className={`p-5 rounded-xl border-2 ${
                  resultBundle.isCorrect
                    ? "border-green-300 bg-green-50"
                    : "border-red-300 bg-red-50"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`font-bold text-lg ${resultBundle.isCorrect ? "text-green-700" : "text-red-700"}`}>
                    {resultBundle.isCorrect ? "Correct" : "Incorrect"}
                  </div>
                  <button
                    onClick={handleNextMC}
                    className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
                  >
                    Next
                  </button>
                </div>

                <div className="text-gray-700">
                  <span className="font-semibold">Definition:</span> {resultBundle.correctDef}
                </div>

                {resultBundle.dictionary_entry ? (
                  <div className="mt-2 text-gray-700">
                    <span className="font-semibold">Dictionary:</span> {resultBundle.dictionary_entry}
                  </div>
                ) : null}

                {resultBundle.sentenceBundle ? (
                  <div className="mt-3">
                    <CaesarSentence
                      sentence={{
                        ...resultBundle.sentenceBundle,
                        translation: resultBundle.sentenceBundle.translation || resultBundle.english || "",
                      }}
                      highlightTokenIndex={resultBundle.highlightTokenIndex}
                    />
                  </div>
                ) : resultBundle.latin ? (
                  <div className="text-base leading-relaxed mt-2">
                    <span className="font-semibold">Caesar:</span> {resultBundle.latin}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mt-2">
                    <span className="font-semibold">Caesar:</span> (example unavailable)
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-2">Tip: Enter also advances.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "final_report" ? (
        <div className="mt-4 space-y-4">
          <h2 className="text-2xl font-bold text-primary">Session Complete</h2>

          <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
            <div className="text-gray-700">
              Total time: <span className="font-bold text-primary">{formatTime(elapsedSec)}</span>
            </div>
            <div className="mt-2 text-gray-700">
              Total attempts: <span className="font-bold text-primary">{derivedFinalStats.totalAttempts}</span> ·
              Correct: <span className="font-bold text-green-600">{derivedFinalStats.totalCorrect}</span> ·
              Wrong: <span className="font-bold text-red-600">{derivedFinalStats.totalWrong}</span>
            </div>

            {derivedFinalStats.hardest.length ? (
              <div className="mt-4">
                <div className="font-semibold text-gray-700 mb-2">Hardest lemmas (most misses):</div>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  {derivedFinalStats.hardest.map((r) => (
                    <li key={r.lemma}>
                      <span className="font-medium">{r.lemma}</span>: {r.wrong} miss{r.wrong === 1 ? "" : "es"} ({r.attempts} attempt{r.attempts === 1 ? "" : "s"})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 text-sm text-green-700 font-medium">
                Perfect score! No misses recorded.
              </div>
            )}

          </div>

          <button
            onClick={() => {
              setPhase("setup");
              setPhaseReport(null);
              setPhaseReportNext(null);
              setResultBundle(null);
              resetMCUI();
            }}
            className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Back to Setup
          </button>
        </div>
      ) : null}
      </div>
    </>
  );
}
