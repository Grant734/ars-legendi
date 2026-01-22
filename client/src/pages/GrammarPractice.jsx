import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TextSelector from "../components/TextSelector";
import { fetchPracticeChunk, fetchExamplesIndex, fetchPracticePoolSize } from "../lib/caesarPracticeApi";
import WordInspector from "../components/WordInspector";
import { ClausePill, styleForType, getBoundaryIndicator, ConstructionTooltip } from "../components/ClauseLegend";
import {
  loadGrammarProgress,
  saveGrammarProgress,
  masteredSet,
  markMastered,
  clearMastered,
  recordAttempt,
  struggleBuckets,
  countMastered,
  canMarkMastered,
} from "../lib/grammarProgress";
import { getStudentIdentity } from "../lib/studentIdentity";
import {
  addSeenExcerpt,
  getExcludeString,
  resetSeenExcerpts,
  getSeenStats,
  shouldReset,
} from "../lib/seenExcerpts";
import {
  logAttemptEvent,
  logCorrectAnswer,
  logIncorrectAnswer,
  logRevealUsed,
  logSessionStart,
  logSessionEnd,
  getSkillForConstructionType,
  SUBSKILLS,
  EVENT_TYPES,
} from "../lib/attemptEvents";
import { useCoach, CoachOverlay } from "../components/Coach";

const PRACTICE_OPTIONS = [
  { value: "all", label: "All constructions (mixed)" },
  { value: "cum_clause", label: "Cum clause" },
  { value: "abl_abs", label: "Ablative absolute" },
  { value: "indirect_statement", label: "Indirect statement (acc + inf)" },
  { value: "purpose_clause", label: "Purpose clause" },
  { value: "result_clause", label: "Result clause" },
  { value: "relative_clause", label: "Relative clause" },
  { value: "subjunctive_relative_clause", label: "Subjunctive relative clause (characteristic)" },
  { value: "gerund", label: "Gerund" },
  { value: "gerundive", label: "Gerundive" },
  { value: "gerund_gerundive_flip", label: "Gerund ↔ Gerundive flip" },
  { value: "conditionals", label: "Conditionals (protasis + apodosis)" },
];

const MODE_SENTENCE_CAP = {
  all: 12,
  abl_abs: 4,
  cum_clause: 4,
  purpose_clause: 5,
  result_clause: 5,
  relative_clause: 5,
  subjunctive_relative_clause: 4,
  gerund: 4,
  gerundive: 4,
  gerund_gerundive_flip: 4,
  indirect_statement: 5,
  conditionals: 4,
};

const TYPE_TO_LESSON_ID = {
  cum_clause: "cum_clause",
  abl_abs: "ablative",
  indirect_statement: "indirect_statement",
  purpose_clause: "purpose_clause",
  result_clause: "result_clause",
  relative_clause: "relative_clauses",
  subjunctive_relative_clause: "relative_clauses",
  gerund: "gerunds_gerundives",
  gerundive: "gerunds_gerundives",
  gerund_gerundive_flip: "gerunds_gerundives",
  conditionals: "conditionals",
};

const CONDITIONAL_LABEL_OPTIONS = [
  { value: "future_more_vivid", label: "Future more vivid" },
  { value: "future_less_vivid", label: "Future less vivid" },
  { value: "present_simple", label: "Present simple" },
  { value: "past_simple", label: "Past simple" },
  { value: "present_contrafactual", label: "Present contrary-to-fact" },
  { value: "past_contrafactual", label: "Past contrary-to-fact" },
  { value: "mixed", label: "Mixed" },
  { value: "mixed_indicative", label: "Mixed indicative" },
  { value: "mixed_subjunctive", label: "Mixed subjunctive" },
];

const PURPOSE_SUBTYPE_OPTIONS = [
  { value: "ut_ne", label: "ut/ne + subjunctive" },
  { value: "ad_gerund", label: "ad + gerund" },
  { value: "ad_noun_gerundive", label: "ad + noun + gerundive" },
];

const RELATIVE_SUBTYPE_OPTIONS = [
  { value: "indicative", label: "Indicative relative clause" },
  { value: "subjunctive", label: "Subjunctive relative clause" },
];

const GERUND_FLIP_SUBTYPE_OPTIONS = [
  { value: "gerund_form_with_object", label: "Gerund + object (flip candidate)" },
  { value: "gerundive_form_ad_phrase", label: "ad + noun + gerundive" },
  { value: "gerundive_form_ad_phrase_no_noun", label: "ad + gerundive (no noun detected)" },
];

const ALL_NON_CONDITIONAL_TYPES = PRACTICE_OPTIONS
  .map((x) => x.value)
  .filter((v) => v !== "all" && v !== "conditionals");

const ALL_TYPES_FOR_ALL_MODE = [
  ...ALL_NON_CONDITIONAL_TYPES,
  "conditional_protasis",
  "conditional_apodosis",
];

function clearNativeSelection() {
  try {
    const sel = window.getSelection?.();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  } catch {}
}

function prettyType(t) {
  if (t === "conditional_protasis") return "Conditional (protasis)";
  if (t === "conditional_apodosis") return "Conditional (apodosis)";
  const map = Object.fromEntries(PRACTICE_OPTIONS.map((o) => [o.value, o.label]));
  return map[t] || t;
}


function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function isPunctToken(t) {
  if (!t) return false;
  if (t.upos === "PUNCT") return true;
  const s = t.text || "";
  return s.length === 1 && /[.,;:!?]/.test(s);
}

function tokenWithSpacing(tokens, i) {
  const t = tokens[i];
  const prev = i > 0 ? tokens[i - 1] : null;

  let leading = i === 0 ? "" : " ";
  if (isPunctToken(t)) leading = "";
  if (prev && (prev.text === "(" || prev.text === "[" || prev.text === "“" || prev.text === '"')) leading = "";

  return leading + (t.text || "");
}

function normalizedSpanFromConstruction(c) {
  const s = Number(c?.start ?? -1);
  const e = Number(c?.end ?? -1);
  if (Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e >= 0) return [Math.min(s, e), Math.max(s, e)];

  const hs = Array.isArray(c?.highlight_spans) ? c.highlight_spans : [];
  if (!hs.length) return [0, 0];

  let min = Infinity;
  let max = -Infinity;
  for (const pair of hs) {
    const a = Number(pair?.[0]);
    const b = Number(pair?.[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    min = Math.min(min, a, b);
    max = Math.max(max, a, b);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  return [min, max];
}

function spanKey(span) {
  if (!span || span.length < 2) return "0-0";
  return `${span[0]}-${span[1]}`;
}

// Accept either:
// - conditional.protasis.verb_index (single)
// - conditional.protasis_verb_indexes (array)
// and always require apodosis verb_index to match when provided.
function apodosisMatchesProtasis(aTag, pv, ap) {
  const ap2 = aTag?.conditional?.apodosis?.verb_index ?? null;
  if (ap != null && ap2 != null && ap2 !== ap) return false;

  const pv2 = aTag?.conditional?.protasis?.verb_index ?? null;
  const pvs = aTag?.conditional?.protasis_verb_indexes;

  if (Array.isArray(pvs)) {
    // backend-style: one apodosis shared by many protases
    return pv != null ? pvs.includes(pv) : true;
  }

  // normal case: one-to-one pairing
  if (pv != null && pv2 != null) return pv2 === pv;

  // If neither has verb_index, allow matching (best effort for incomplete tagging)
  if (pv == null && pv2 == null) {
    return true;
  }

  // If only one has verb_index, don't match - data is inconsistent
  return false;
}

function tokenSetFromHighlightSpans(c) {
  const hs = Array.isArray(c?.highlight_spans) ? c.highlight_spans : [];
  const set = new Set();

  if (!hs.length) {
    const [a, b] = normalizedSpanFromConstruction(c);
    for (let i = a; i <= b; i++) set.add(i);
    return set;
  }

  for (const [a0, b0] of hs) {
    const a = Number(a0), b = Number(b0);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = lo; i <= hi; i++) set.add(i);
  }
  return set;
}

function unionRect(rects) {
  if (!rects.length) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function clampPopoverXY(x, y, w, h) {
  const pad = 10;
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;
  return {
    x: Math.max(pad, Math.min(maxX, x)),
    y: Math.max(pad, Math.min(maxY, y)),
  };
}

function labelForConditionalValue(v) {
  return CONDITIONAL_LABEL_OPTIONS.find((x) => x.value === v)?.label || v;
}

function truncateChunk(raw, cap) {
  if (!raw || !Array.isArray(raw.blocks)) return raw;
  const out = { ...raw, blocks: [] };
  let remaining = Math.max(1, Number(cap) || 1);

  for (const b of raw.blocks) {
    if (remaining <= 0) break;
    const sents = Array.isArray(b?.sentences) ? b.sentences : [];
    if (!sents.length) continue;

    const take = sents.slice(0, remaining);
    remaining -= take.length;

    out.blocks.push({ ...b, sentences: take });
  }

  return out;
}

function trimSelectionPunct(tokens, start, end) {
  let a = start;
  let b = end;
  while (a <= b && isPunctToken(tokens[a])) a++;
  while (b >= a && isPunctToken(tokens[b])) b--;
  if (a > b) return { start, end };
  return { start: a, end: b };
}

export default function GrammarPractice() {
  // URL parameters for launching from Mastery page
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get("mode");
  const urlAction = searchParams.get("action"); // targeted_drill | review_misses | coverage_push

  const [mode, setMode] = useState(() => {
    // Initialize mode from URL if valid, otherwise default to "all"
    const validModes = PRACTICE_OPTIONS.map((o) => o.value);
    return urlMode && validModes.includes(urlMode) ? urlMode : "all";
  });
  const [actionType] = useState(urlAction || null);

  const [chunk, setChunk] = useState(null);
  const [err, setErr] = useState(null);

  const [foundIds, setFoundIds] = useState(() => new Set());
  const [revealAll, setRevealAll] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  // hunt | revealed | complete
  const [phase, setPhase] = useState("hunt");

  const [flash, setFlash] = useState(false);

  // conditionals: label answers only stored when correct
  const [condAnswers, setCondAnswers] = useState({}); // pairKey -> { chosenLabel, ok:true }

  // conditionals: “you must finish this pair next”
  const [condPairLock, setCondPairLock] = useState(null); // { pairKey, needRole: "protasis"|"apodosis" }

  // drag selection
  const [drag, setDrag] = useState({ active: false, sid: null, start: null, end: null });
  const selection = useMemo(() => {
    if (!drag.sid || drag.start == null || drag.end == null) return null;
    return { sid: drag.sid, start: Math.min(drag.start, drag.end), end: Math.max(drag.start, drag.end) };
  }, [drag]);

  // popover
  const [popover, setPopover] = useState(null); // { x, y }
  const [feedback, setFeedback] = useState(null); // { ok, text }
  const [pickType, setPickType] = useState("");
  const [pickSubtype, setPickSubtype] = useState("");

  // conditionals: label classification prompt only AFTER pair complete
  const [condLabelPrompt, setCondLabelPrompt] = useState(null); // { pairKey, correctLabel }
  const [condPickLabel, setCondPickLabel] = useState("");

  // stats modal
  const [showStats, setShowStats] = useState(false);

  // timer
  const startRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  // token refs for placement
  const tokenRefs = useRef(new Map());

  // word inspector popover AFTER reveal
  const [inspect, setInspect] = useState(null);

  // persistent progress
  const [progress, setProgress] = useState(() => loadGrammarProgress());

  // corpus totals (from /examples)
  const [corpusTotals, setCorpusTotals] = useState(null);

  // toast
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  function showToast(ok, text, ms = 1400) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ ok, text });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }

  // seen excerpts tracking (Phase 0)
  // Phase 1: Use unified identity system (solo mode for now)
  const studentId = useMemo(() => getStudentIdentity().studentId, []);
  const [poolSize, setPoolSize] = useState(null);
  const [seenStats, setSeenStats] = useState({ seen: 0, total: 0, percentage: 0, cycleCount: 0 });
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showMasteryCompleteModal, setShowMasteryCompleteModal] = useState(false);

  // Phase 6: Coach integration
  // Derive the current skill ID from mode for Coach context
  const currentSkillId = useMemo(() => {
    if (mode === "all") return "grammar:all";
    return getSkillForConstructionType(mode);
  }, [mode]);

  const coach = useCoach(studentId, {
    skillId: currentSkillId,
    subskillId: SUBSKILLS.IDENTIFY,
    enabled: true,
    onAction: (action) => {
      // Coach action handler - navigate to practice with action context
    },
  });

  // session mastery deferral
  const sessionCorrectIdsRef = useRef(new Set()); // ids user got correct via Submit
  const sessionCorrectLabelPairsRef = useRef(new Set()); // pairKeys user labeled correctly
  const sessionFinalizedRef = useRef(false);

  const sentenceCap = MODE_SENTENCE_CAP[mode] || (mode === "all" ? 12 : 6);

  const lessonId = TYPE_TO_LESSON_ID[mode] || null;
  const lessonHref = lessonId ? `/grammar/${lessonId}` : null;

  const allSentences = useMemo(() => {
    if (!chunk?.blocks) return [];
    return chunk.blocks.flatMap((b) => (Array.isArray(b?.sentences) ? b.sentences : []));
  }, [chunk]);

  // timer tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!startRef.current) return;
      const ms = Date.now() - startRef.current;
      setElapsed(Math.floor(ms / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  // fetch corpus totals on mode change
  useEffect(() => {
    let mounted = true;
  
    async function run() {
      try {
        const types = [...ALL_NON_CONDITIONAL_TYPES, "conditional_protasis", "conditional_apodosis"];
        const data = await fetchExamplesIndex({ types });
        if (!mounted) return;
        setCorpusTotals(data);
      } catch {
        if (!mounted) return;
        setCorpusTotals(null);
      }
    }
  
    run();
    return () => {
      mounted = false;
    };
  }, [mode]);

  // fetch pool size and update seen stats on mode change (Phase 0)
  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const data = await fetchPracticePoolSize({ type: mode, n: sentenceCap });
        if (!mounted) return;
        setPoolSize(data.totalWindows);

        // Update seen stats with new pool size
        const stats = getSeenStats(studentId, mode, mode, data.totalWindows);
        setSeenStats(stats);
      } catch {
        if (!mounted) return;
        setPoolSize(null);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [mode, sentenceCap, studentId]);

  // Phase 6: Session end detection (page unload)
  useEffect(() => {
    function handleBeforeUnload() {
      // Check for session end trigger before leaving
      coach.checkSessionEnd();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [coach]);

  // mouseup handler (opens grading popover)
  useEffect(() => {
    function onGlobalMouseUp() {
      clearNativeSelection();

      if (revealAll) return;
      if (phase === "complete") return;
      if (!drag.active) return;

      setDrag((d) => ({ ...d, active: false }));

      const sel = selection;
      if (!sel) return;

      const sidMap = tokenRefs.current.get(sel.sid);
      if (!sidMap) return;

      const rects = [];
      for (let i = sel.start; i <= sel.end; i++) {
        const el = sidMap.get(i);
        if (el) rects.push(el.getBoundingClientRect());
      }

      const u = unionRect(rects);
      if (!u) return;

      const popW = 340;
      const popH = 340;

      let x = u.left + u.width / 2 - popW / 2;

      const yBelow = u.bottom + 10;
      const yAbove = u.top - popH - 10;
      let y = (yBelow + popH <= window.innerHeight - 10) ? yBelow : yAbove;

      const pos = clampPopoverXY(x, y, popW, popH);

      setPopover(pos);
      setFeedback(null);
      setPickType("");
      setPickSubtype("");
      setCondLabelPrompt(null);
      setCondPickLabel("");
    }

    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, [drag.active, selection, revealAll, phase]);

  function registerTokenRef(sid, idx, el) {
    if (!el) return;
    if (!tokenRefs.current.has(sid)) tokenRefs.current.set(sid, new Map());
    tokenRefs.current.get(sid).set(idx, el);
  }

  function openInspectorAtToken(sid, idx, sentence) {
    const sidMap = tokenRefs.current.get(sid);
    const el = sidMap?.get(idx);
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const token = sentence?.tokens?.[idx] || null;
    const constructions = Array.isArray(sentence?.constructions) ? sentence.constructions : [];

    const w = 420;
    const h = 420;

    let x = rect.left;
    let y = rect.bottom + 8;

    if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
    if (x < 10) x = 10;

    if (y + h > window.innerHeight - 10) {
      y = rect.top - h - 8;
      if (y < 10) y = 10;
    }

    setInspect({ sid, idx, x, y, token, sentence, constructions });
  }

  function updateProgress(updater) {
    setProgress((p) => {
      const next = updater(p);
      return saveGrammarProgress(next);
    });
  }

  // Phase 2: Universal logging helper
  // Logs an attempt event with proper context from current state
  function logGrammarAttempt({
    constructionType,
    itemId,
    correct,
    subskill = SUBSKILLS.IDENTIFY,
    hintUsed = false,
    revealed = false,
    latencyMs = null,
    userAnswer = null,
    expectedAnswer = null,
    metadata = null,
  }) {
    const excerptId = chunk?.blocks?.[0]?.excerptId || null;

    logAttemptEvent({
      eventType: correct ? EVENT_TYPES.ANSWER_SUBMIT : EVENT_TYPES.ANSWER_SUBMIT,
      mode: "grammar",
      skillId: getSkillForConstructionType(constructionType),
      subskillId: subskill,
      itemId: itemId || constructionType,
      correct,
      latencyMs,
      hintUsed,
      revealed,
      userAnswer,
      expectedAnswer,
      excerptId,
      metadata: {
        practiceMode: mode,
        ...metadata,
      },
    });
  }

  // Phase 6: Record event for Coach and check for intervention
  function recordCoachEvent(correct, constructionType, metadata = {}) {
    const event = {
      correct,
      type: constructionType,
      skillId: getSkillForConstructionType(constructionType),
      timestamp: Date.now(),
      ...metadata,
    };

    coach.recordEvent(event);
    coach.checkIntervention(event, {
      skillId: getSkillForConstructionType(constructionType),
      subskillId: SUBSKILLS.IDENTIFY,
    });
  }

  // mastery persistence only when session ends
  function finalizeSessionMastery(targetsById) {
    if (sessionFinalizedRef.current) return;
    if (!chunk) return;

    const ids = Array.from(sessionCorrectIdsRef.current);
    const labelPairs = Array.from(sessionCorrectLabelPairsRef.current);

    if (!ids.length && !labelPairs.length) {
      sessionFinalizedRef.current = true;
      return;
    }

    updateProgress((p) => {
      let np = p;

      for (const id of ids) {
        const it = targetsById.get(id);
        if (!it) continue;
        // Phase 0: Only mark mastered if not revealed
        if (canMarkMastered(np, it.type, id)) {
          np = markMastered(np, it.type, id);
        }
      }

      for (const pairKey of labelPairs) {
        // Phase 0: Check mastery eligibility for conditional labels too
        if (canMarkMastered(np, "conditional_label", pairKey)) {
          np = markMastered(np, "conditional_label", pairKey);
        }
      }

      return np;
    });

    sessionFinalizedRef.current = true;
  }

  // finalize on unmount
  // (targetsById is defined later in the component; we pass it in from the cleanup)
  const finalizeRef = useRef(null);

  // Clear excerpt when switching practice mode
  useEffect(() => {
    setChunk(null);
    setErr(null);

    setFoundIds(new Set());
    setRevealAll(false);
    setShowTranslation(false);

    setPhase("hunt");
    setPopover(null);
    setFeedback(null);

    setPickType("");
    setPickSubtype("");

    setCondAnswers({});
    setCondPairLock(null);
    setCondLabelPrompt(null);
    setCondPickLabel("");

    setDrag({ active: false, sid: null, start: null, end: null });
    setInspect(null);

    setElapsed(0);
    setRunning(false);
    startRef.current = null;

    sessionCorrectIdsRef.current = new Set();
    sessionCorrectLabelPairsRef.current = new Set();
    sessionFinalizedRef.current = false;
  }, [mode]);

  // ---------- targets + mastery filtering ----------
  const masteredForType = useMemo(() => {
    const out = {};
    const types = [
      ...ALL_NON_CONDITIONAL_TYPES,
      "conditional_protasis",
      "conditional_apodosis",
      "conditional_label",
    ];
    for (const t of types) out[t] = masteredSet(progress, t);
    return out;
  }, [progress]);

  const corpusCounts = useMemo(() => corpusTotals?.instance_counts || {}, [corpusTotals]);

  // Compute instances remaining for the current mode (for progress display)
  const instanceProgress = useMemo(() => {
    if (mode === "all") return null; // "all" mode uses excerpt-based tracking

    // For conditionals, combine protasis + apodosis
    if (mode === "conditionals") {
      const protTotal = Number(corpusCounts?.conditional_protasis ?? 0);
      const apoTotal = Number(corpusCounts?.conditional_apodosis ?? 0);
      const protMastered = countMastered(progress, "conditional_protasis");
      const apoMastered = countMastered(progress, "conditional_apodosis");
      const total = protTotal + apoTotal;
      const mastered = protMastered + apoMastered;
      return { total, mastered, remaining: Math.max(0, total - mastered) };
    }

    // For regular types
    const total = Number(corpusCounts?.[mode] ?? 0);
    const mastered = countMastered(progress, mode);
    return { total, mastered, remaining: Math.max(0, total - mastered) };
  }, [mode, corpusCounts, progress]);

  function shouldFilterOutByMastery(type, id) {
    // Never hide something the user has already confirmed in THIS excerpt/session,
    // even if recordAttempt/mastery updates fire and would normally filter it out.
    if (foundIds.has(id) || sessionCorrectIdsRef.current.has(id)) return false;
  
    const total = Number(corpusCounts?.[type] ?? 0);
    if (total > 0) {
      const done = countMastered(progress, type);
      if (done >= total) return false; // allow reappearance for review after full completion
    }
  
    return masteredForType[type]?.has(id);
  }
  

  const targets = useMemo(() => {
    if (!chunk) return [];
    const out = [];

    for (const s of allSentences) {
      const sid = String(s.sid);
      const cons = Array.isArray(s?.constructions) ? s.constructions : [];

      // non-conditional targets
      for (let i = 0; i < cons.length; i++) {
        const c = cons[i];
        const t = String(c?.type || "");
        if (!t) continue;
        if (t === "conditional_protasis" || t === "conditional_apodosis") continue;

        const span = normalizedSpanFromConstruction(c);
        const subtype = c?.subtype ? String(c.subtype) : "";
        const id = `${sid}|${t}|${subtype}|${span[0]}|${span[1]}|${i}`;

        if (!shouldFilterOutByMastery(t, id)) {
          out.push({
            id,
            sid,
            type: t,
            subtype,
            role: null,
            pairKey: null,
            label: null,
            spans: [span],
            bands: [span],
            tokenSet: tokenSetFromHighlightSpans(c),
            conditional: null,
          });
        }
      }

      // conditionals
      const protases = cons.filter((c) => c?.type === "conditional_protasis");
      const apodoses = cons.filter((c) => c?.type === "conditional_apodosis");
      const usedAp = new Set();

      
      for (let pi = 0; pi < protases.length; pi++) {
        const p = protases[pi];

        const pv = p?.conditional?.protasis?.verb_index ?? null;
        const ap = p?.conditional?.apodosis?.verb_index ?? null;
        const label = p?.conditional?.label || p?.subtype || "mixed";

        const pSpan = normalizedSpanFromConstruction(p);

        // Find a matching apodosis tag for THIS protasis (supports shared apodosis)
        let aTag = null;
        let aIndex = -1;

        if (apodoses.length) {
          aIndex = apodoses.findIndex((c) => apodosisMatchesProtasis(c, pv, ap));
          if (aIndex >= 0) {
            aTag = apodoses[aIndex];
            usedAp.add(aIndex);
          }
        }

        // Stable pairKey even when verb indexes are missing: span-first + pv/ap disambiguation
        let pairKey = `${sid}|p:${spanKey(pSpan)}|a:none|pv:${pv ?? "?"}|ap:${ap ?? "?"}`;

        let aSpan = null;
        if (aTag) {
          aSpan = normalizedSpanFromConstruction(aTag);
          pairKey = `${sid}|p:${spanKey(pSpan)}|a:${spanKey(aSpan)}|pv:${pv ?? "?"}|ap:${ap ?? "?"}`;
        }

        const protId = `${pairKey}|protasis|${pSpan[0]}|${pSpan[1]}|${pi}`;
        if (!shouldFilterOutByMastery("conditional_protasis", protId)) {
          out.push({
            id: protId,
            sid,
            type: "conditional_protasis",
            subtype: String(p?.subtype || label || "mixed"),
            role: "protasis",
            pairKey,
            label,
            spans: [pSpan],
            bands: [pSpan],
            tokenSet: tokenSetFromHighlightSpans(p),
            conditional: p?.conditional || null,
          });
        }

        if (aTag) {
          const aSpan2 = aSpan || normalizedSpanFromConstruction(aTag);
          const apoId = `${pairKey}|apodosis|${aSpan2[0]}|${aSpan2[1]}|${pi}`;
          if (!shouldFilterOutByMastery("conditional_apodosis", apoId)) {
            out.push({
              id: apoId,
              sid,
              type: "conditional_apodosis",
              subtype: String(aTag?.subtype || label || "mixed"),
              role: "apodosis",
              pairKey,
              label,
              spans: [aSpan2],
              bands: [aSpan2],
              tokenSet: tokenSetFromHighlightSpans(aTag),
              conditional: aTag?.conditional || null,
            });
          }
        }
      }


      for (let ai = 0; ai < apodoses.length; ai++) {
        if (usedAp.has(ai)) continue;
        const a = apodoses[ai];
        const pv = a?.conditional?.protasis?.verb_index ?? null;
        const ap = a?.conditional?.apodosis?.verb_index ?? null;
        const label = a?.conditional?.label || a?.subtype || "mixed";
        const pairKey = `${sid}|${String(pv)}|${String(ap)}`;
        const aSpan = normalizedSpanFromConstruction(a);
        const apoId = `${pairKey}|apodosis_unpaired|${aSpan[0]}|${aSpan[1]}|${ai}`;

        if (!shouldFilterOutByMastery("conditional_apodosis", apoId)) {
          out.push({
            id: apoId,
            sid,
            type: "conditional_apodosis",
            subtype: String(a?.subtype || label || "mixed"),
            role: "apodosis",
            pairKey,
            label,
            spans: [aSpan],
            bands: [aSpan],
            tokenSet: tokenSetFromHighlightSpans(a),
            conditional: a?.conditional || null,
          });
        }
      }
    }

    if (mode === "all") return out;
    if (mode === "conditionals") return out.filter((x) => x.type === "conditional_protasis" || x.type === "conditional_apodosis");
    return out.filter((x) => x.type === mode);
  }, [chunk, allSentences, mode, masteredForType, corpusCounts, progress, foundIds]);


  const targetsById = useMemo(() => {
    const m = new Map();
    for (const it of targets) m.set(it.id, it);
    return m;
  }, [targets]);

  // keep a ref so cleanup can finalize with the latest map
  useEffect(() => {
    finalizeRef.current = () => finalizeSessionMastery(targetsById);
    return () => {
      try {
        finalizeSessionMastery(targetsById);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsById]);

  const totalsByTypeInChunk = useMemo(() => {
    const t = {};
    for (const it of targets) t[it.type] = (t[it.type] || 0) + 1;
    return t;
  }, [targets]);

  const foundCountsByType = useMemo(() => {
    const c = {};
    for (const it of targets) {
      if (!foundIds.has(it.id)) continue;
      c[it.type] = (c[it.type] || 0) + 1;
    }
    return c;
  }, [targets, foundIds]);

  const conditionalPairs = useMemo(() => {
    if (mode !== "conditionals") return [];
    const map = new Map();

    for (const it of targets) {
      if (!it.pairKey) continue;
      if (!map.has(it.pairKey)) {
        map.set(it.pairKey, {
          pairKey: it.pairKey,
          sid: it.sid,
          correctLabel: it.label || "mixed",
          foundProtasis: false,
          foundApodosis: false,
        });
      }
      const obj = map.get(it.pairKey);
      if (it.role === "protasis" && foundIds.has(it.id)) obj.foundProtasis = true;
      if (it.role === "apodosis" && foundIds.has(it.id)) obj.foundApodosis = true;
    }

    return Array.from(map.values());
  }, [targets, foundIds, mode]);

  // on-screen badges: Protasis/Apodosis label above first token of found spans
  const condRoleBadgeMap = useMemo(() => {
    const bags = new Map(); // key -> Map(text -> count)
    if (mode !== "conditionals") return bags;
  
    // pairKey -> whether this excerpt has both parts
    const pairMeta = new Map();
    for (const it of targets) {
      if (!it.pairKey) continue;
      if (!pairMeta.has(it.pairKey)) pairMeta.set(it.pairKey, { hasProt: false, hasApo: false });
      const pm = pairMeta.get(it.pairKey);
      if (it.role === "protasis") pm.hasProt = true;
      if (it.role === "apodosis") pm.hasApo = true;
    }
  
    function addBadge(key, text) {
      if (!bags.has(key)) bags.set(key, new Map());
      const bag = bags.get(key);
      bag.set(text, (bag.get(text) || 0) + 1);
    }
  
    for (const it of targets) {
      const isVisible = foundIds.has(it.id) || revealAll;
      if (!isVisible) continue;
      if (it.type !== "conditional_protasis" && it.type !== "conditional_apodosis") continue;
  
      const startIdx = it?.spans?.[0]?.[0];
      if (startIdx == null) continue;
  
      const key = `${String(it.sid)}|${String(startIdx)}`;
      const roleText = it.role === "protasis" ? "Protasis" : "Apodosis";
  
      const meta = pairMeta.get(it.pairKey);
      const paired = !!(meta?.hasProt && meta?.hasApo);
      const soloTag = paired ? "" : " (solo)";
  
      let subtypeTag = "";
      if (condAnswers?.[it.pairKey]?.ok) {
        subtypeTag = ` • ${labelForConditionalValue(condAnswers[it.pairKey].chosenLabel)}`;
      } else if (revealAll) {
        subtypeTag = ` • ${labelForConditionalValue(it.label || it.subtype || "mixed")}`;
      }
  
      addBadge(key, `${roleText}${subtypeTag}${soloTag}`);
    }
  
    // Convert the inner count-maps to arrays of strings (with ×N when needed)
    const out = new Map();
    for (const [k, bag] of bags.entries()) {
      const arr = [];
      for (const [text, count] of bag.entries()) {
        arr.push(count > 1 ? `${text} ×${count}` : text);
      }
      out.set(k, arr);
    }
    return out;
  }, [targets, foundIds, mode, condAnswers, revealAll]);
  
  

  // completion detector
  useEffect(() => {
    if (!chunk) return;
    if (revealAll) return;
    if (!targets.length) return;
  
    const spansRemaining = targets.filter((t) => !foundIds.has(t.id)).length;
  
    // Conditionals: do NOT complete until labels are also correctly done.
    if (mode === "conditionals") {
      const needed = new Set(targets.map((t) => t.pairKey).filter(Boolean));
      let labeledOk = 0;
  
      for (const k of needed) {
        if (condAnswers?.[k]?.ok || sessionCorrectLabelPairsRef.current.has(k)) labeledOk++;
      }
  
      const labelsRemaining = needed.size - labeledOk;
  
      if (spansRemaining === 0 && labelsRemaining === 0 && phase !== "complete") {
        setPhase("complete");
        setRunning(false);
        startRef.current = null;
        setPopover(null);
        setDrag({ active: false, sid: null, start: null, end: null });
        setFeedback(null);
        setPickType("");
        setPickSubtype("");
        setCondPairLock(null);
        setCondLabelPrompt(null);
        setCondPickLabel("");
        showToast(true, "Excerpt complete.", 1800);
      }
  
      return;
    }
  
    // All other modes: spans are enough.
    if (spansRemaining === 0 && phase !== "complete") {
      setPhase("complete");
      setRunning(false);
      startRef.current = null;
      setPopover(null);
      setDrag({ active: false, sid: null, start: null, end: null });
      setFeedback(null);
      setPickType("");
      setPickSubtype("");
      showToast(true, "Excerpt complete.", 1800);
    }
  }, [chunk, revealAll, targets, foundIds, phase, mode, condAnswers]);
  

  // Helper to get mastered instance IDs for server-side filtering
  function getMasteredIdsForMode(m) {
    // "all" mode: no instance filtering (per requirements)
    if (m === "all") return "";

    // For conditionals, include both protasis and apodosis mastered IDs
    if (m === "conditionals") {
      const protSet = masteredSet(progress, "conditional_protasis");
      const apoSet = masteredSet(progress, "conditional_apodosis");
      const combined = new Set([...protSet, ...apoSet]);
      return Array.from(combined).join(",");
    }

    // For other types, return the mastered set for that type
    const set = masteredSet(progress, m);
    return Array.from(set).join(",");
  }

  async function generate() {
    // finalize mastery for the current session before wiping state
    try {
      finalizeRef.current?.();
    } catch {}

    // Phase 6: Check for set complete trigger before moving to next excerpt
    if (chunk) {
      coach.checkSetComplete();
      coach.resetSession();
    }

    // reset session tracking for the new excerpt
    sessionCorrectIdsRef.current = new Set();
    sessionCorrectLabelPairsRef.current = new Set();
    sessionFinalizedRef.current = false;

    setErr(null);
    setChunk(null);
    setFoundIds(new Set());
    setRevealAll(false);
    setShowTranslation(false);
    setFeedback(null);
    setPopover(null);
    setPickType("");
    setPickSubtype("");
    setDrag({ active: false, sid: null, start: null, end: null });
    setInspect(null);
    setCondAnswers({});
    setCondPairLock(null);
    setCondLabelPrompt(null);
    setCondPickLabel("");
    setPhase("hunt");

    setElapsed(0);
    startRef.current = Date.now();
    setRunning(true);

    try {
      // Get exclude list of already-seen excerpts (only used for "all" mode)
      const exclude = mode === "all" ? getExcludeString(studentId, mode, mode) : "";
      // Get mastered instance IDs for server-side filtering (prevents seeing already-mastered instances)
      const mastered = getMasteredIdsForMode(mode);
      const raw = await fetchPracticeChunk({ type: mode, exclude, mastered });
      const clipped = truncateChunk(raw, sentenceCap);
      setChunk(clipped);

      // Check if all instances have been mastered (server returns allMastered flag)
      if (raw.allMastered && mode !== "all") {
        setShowMasteryCompleteModal(true);
      }

      // Track the seen excerpt (only for "all" mode)
      if (mode === "all") {
        const excerptId = raw.blocks?.[0]?.excerptId;
        if (excerptId) {
          addSeenExcerpt(studentId, mode, mode, excerptId);

          // Update seen stats
          if (poolSize) {
            const stats = getSeenStats(studentId, mode, mode, poolSize);
            setSeenStats(stats);

            // Check for pool exhaustion
            if (shouldReset(studentId, mode, mode, poolSize)) {
              setShowCycleModal(true);
            }
          }
        }
      }
    } catch (e) {
      setErr(String(e?.message || e));
      startRef.current = null;
      setRunning(false);
    }
  }

  function cancelSelection() {
    setDrag({ active: false, sid: null, start: null, end: null });
    setPopover(null);
    setFeedback(null);
    setPickType("");
    setPickSubtype("");
    setCondLabelPrompt(null);
    setCondPickLabel("");
  }

  function findBestCandidate(
    sel,
    tokensForSentence,
    { includeFound = false, onlyPairKey = null, onlyRole = null } = {}
  ) {
    const sid = sel.sid;
    const candidates = [];
    const trimmed = tokensForSentence
      ? trimSelectionPunct(tokensForSentence, sel.start, sel.end)
      : sel;
  
    for (const it of targets) {
      if (it.sid !== sid) continue;
      if (onlyPairKey && it.pairKey !== onlyPairKey) continue;
      if (onlyRole && it.role !== onlyRole) continue;
      if (!includeFound && foundIds.has(it.id)) continue;

      for (const span of it.spans) {
        const [trueStart, trueEnd] = span;
        const spanLength = trueEnd - trueStart + 1;

        const ds = Math.abs(trimmed.start - trueStart);
        const de = Math.abs(trimmed.end - trueEnd);

        // Calculate overlap
        const overlapStart = Math.max(trimmed.start, trueStart);
        const overlapEnd = Math.min(trimmed.end, trueEnd);
        const overlapLength = Math.max(0, overlapEnd - overlapStart + 1);
        const overlapRatio = overlapLength / spanLength;

        // Stricter: max 2 tokens per boundary AND at least 50% overlap
        if (ds <= 2 && de <= 2 && overlapRatio >= 0.5) {
          candidates.push({ it, score: ds + de });
          break;
        }
      }
    }
  
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].it;
  }
  

  function subtypeOptionsForType(t) {
    if (t === "purpose_clause") return PURPOSE_SUBTYPE_OPTIONS;
    if (t === "relative_clause") return RELATIVE_SUBTYPE_OPTIONS;
    if (t === "gerund_gerundive_flip") return GERUND_FLIP_SUBTYPE_OPTIONS;
    return null;
  }
  

  function requiresSubtype(t) {
    const opts = subtypeOptionsForType(t);
    return Array.isArray(opts) && opts.length >= 2;
  }

  function pairPresence(pairKey) {
    const hasProt = targets.some((t) => t.pairKey === pairKey && t.role === "protasis");
    const hasApo = targets.some((t) => t.pairKey === pairKey && t.role === "apodosis");
    return { hasProt, hasApo, paired: hasProt && hasApo };
  }

  function roleFound(pairKey, role, newlyFoundId = null) {
    const it = targets.find((t) => t.pairKey === pairKey && t.role === role);
    if (!it) return false;
    if (newlyFoundId && it.id === newlyFoundId) return true;
    return foundIds.has(it.id);
  }
  function isConditionalType(t) {
    return t === "conditional_protasis" || t === "conditional_apodosis";
  }
  
  function gradeSelection() {
    if (!selection) return;
    if (!chunk) return;

    const sentence = allSentences.find((s) => String(s.sid) === String(selection.sid)) || null;
    const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens : [];

    const selTrimmed = trimSelectionPunct(tokens, selection.start, selection.end);
    const conditionalLike =
    (mode === "conditionals") || (mode === "all" && isConditionalType(pickType));
  
    // CONDITIONALS: if we’re locked onto a specific pair/role, try to grade ONLY that target first.
    // This is what fixes “shared apodosis” (same span used by multiple protases).
    const forced =
    conditionalLike && condPairLock
      ? findBestCandidate(
          { ...selection, ...selTrimmed },
          tokens,
          {
            includeFound: false,
            onlyPairKey: condPairLock.pairKey,
            onlyRole: condPairLock.needRole,
          }
        )
      : null;

    // If user re-selects something already confirmed, never mark wrong.
    // BUT: don’t short-circuit if there’s an unfound “forced” target under the same span.
    const already = !forced
    ? findBestCandidate({ ...selection, ...selTrimmed }, tokens, { includeFound: true })
    : null;

    if (already && foundIds.has(already.id)) {
    // If conditionals and label still not done, re-open the label prompt instead of trapping the user.
    if (mode === "conditionals" && already.pairKey) {
      const pairKey = already.pairKey;
      const alreadyOk =
        !!condAnswers?.[pairKey]?.ok || sessionCorrectLabelPairsRef.current.has(pairKey);
      if (!alreadyOk) {
        const { paired } = pairPresence(pairKey);
        setCondLabelPrompt({
          pairKey,
          correctLabel: already.label || "mixed",
          solo: !paired,
          soloRole: already.role,
        });
        setCondPickLabel("");
        setFeedback({ ok: true, text: "Now classify the conditional type below." });
        showToast(true, "Choose the conditional type.", 1400);
        return;
      }
    }
    setFeedback({ ok: true, text: "Already confirmed — locked in." });
    showToast(true, "Already confirmed.", 1200);
    return;
    }

    

    // CONDITIONALS: enforce “finish the pair” lock
    if (conditionalLike) {
      const best =
        forced || findBestCandidate({ ...selection, ...selTrimmed }, tokens, { includeFound: false });
      // In ALL mode, only allow this conditional workflow if the user actually chose a conditional type.
      if (mode === "all" && !isConditionalType(pickType)) {
        // Should never happen because conditionalLike would be false, but keep it safe.
        setFeedback({ ok: false, text: "Choose a conditional type first." });
        return;
      }

      if (!best) {
        updateProgress((p) => recordAttempt(p, "conditional_span_miss", false, { sid: selection.sid }));
        setFeedback({ ok: false, text: "Wrong span: that doesn't match a protasis/apodosis nearby." });
        showToast(false, "Wrong span (conditional).", 1400);

        // Phase 6: Record conditional span miss for Coach
        recordCoachEvent(false, "conditionals", { reason: "wrong_span" });
        return;
      }
      if (mode === "all") {
        // If user picked protasis but actually selected apodosis (or vice versa), reject.
        if (pickType && best.type !== pickType) {
          setFeedback({
            ok: false,
            text: `Right conditional area, wrong role. You chose ${prettyType(pickType)}.`,
          });
          showToast(false, "Wrong conditional role.", 1400);
          return;
        }
      }
      
      if (condPairLock && !forced) {
        const okPair = best.pairKey === condPairLock.pairKey;
        const okRole = best.role === condPairLock.needRole;
        if (!okPair || !okRole) {
          updateProgress((p) =>
            recordAttempt(p, "conditional_span_miss", false, {
              sid: best.sid,
              expectedPairKey: condPairLock.pairKey,
              expectedRole: condPairLock.needRole,
            })
          );
          setFeedback({
            ok: false,
            text: `Finish the current pair first: find the ${condPairLock.needRole}.`,
          });
          showToast(false, `Finish the pair: ${condPairLock.needRole}.`, 1600);
          return;
        }
      }

      // mark found (lock it on screen for the session)
      setFoundIds((prev) => {
        const next = new Set(prev);
        next.add(best.id);
        return next;
      });

      // lock it as "correct this session" BEFORE any progress updates can trigger filtering
      sessionCorrectIdsRef.current.add(best.id);

      // record attempt now; mastery is still deferred to session finalization
      updateProgress((p) => recordAttempt(p, best.type, true, { sid: best.sid, role: best.role }));


      const roleLabel = best.role === "protasis" ? "Protasis" : "Apodosis";
      setFeedback({ ok: true, text: `Correct span: ${roleLabel}` });
      showToast(true, `Correct: ${roleLabel}`, 1200);

      // Phase 6: Record correct conditional span for Coach
      recordCoachEvent(true, best.type, { itemId: best.id, role: best.role });

      const pairKey = best.pairKey;

      if (pairKey) {
        const { paired } = pairPresence(pairKey);

        // SOLO conditional: no partner exists in this excerpt.
        // Still require the user to label the conditional type, and clearly mark it as solo.
        if (!paired) {
          setCondPairLock(null);

          const alreadyOk =
            !!condAnswers?.[pairKey]?.ok || sessionCorrectLabelPairsRef.current.has(pairKey);

          if (!alreadyOk) {
            setCondLabelPrompt({
              pairKey,
              correctLabel: best.label || "mixed",
              solo: true,
              soloRole: best.role, // "protasis" or "apodosis"
            });
            setCondPickLabel("");
            setFeedback({
              ok: true,
              text: `Solo ${roleLabel} found. Now classify the conditional type below.`,
            });
            showToast(true, "Solo conditional: now choose the type.", 1600);
          } else {
            setCondLabelPrompt(null);
            setCondPickLabel("");
          }

          return;
        }


        const protNow = roleFound(pairKey, "protasis", best.id);
        const apoNow = roleFound(pairKey, "apodosis", best.id);

        // If pair not complete, lock user onto the missing role next.
        if (!(protNow && apoNow)) {
          const needRole = protNow ? "apodosis" : "protasis";
          setCondPairLock({ pairKey, needRole });
          setCondLabelPrompt(null);
          setCondPickLabel("");
          setPopover(null); // makes the workflow feel “forced” in a good way
          setDrag({ active: false, sid: null, start: null, end: null });
          showToast(true, `Now find the ${needRole}.`, 1600);
          return;
        }

        // Pair complete -> require label classification now (same logic as before)
        setCondPairLock(null);

        const alreadyOk = !!condAnswers?.[pairKey]?.ok || sessionCorrectLabelPairsRef.current.has(pairKey);
        if (!alreadyOk) {
          setCondLabelPrompt({ pairKey, correctLabel: best.label || "mixed" });
          setCondPickLabel("");
          setFeedback({ ok: true, text: "Pair complete. Now classify the conditional type below." });
        }
      }

      return;
    }

    // NON-CONDITIONAL:
    const best = findBestCandidate({ ...selection, ...selTrimmed }, tokens, { includeFound: false });

    if (!best) {
      const missBucket = mode === "all" ? "span_miss_all" : `span_miss:${mode}`;
      updateProgress((p) => recordAttempt(p, missBucket, false, { sid: selection.sid }));

      // Phase 2: Log incorrect span to universal event store
      logGrammarAttempt({
        constructionType: mode === "all" ? "unknown" : mode,
        itemId: `span_miss:${selection.sid}`,
        correct: false,
        metadata: { reason: "wrong_span", sid: selection.sid },
      });

      setFeedback({ ok: false, text: "Wrong span: no construction matched near that selection." });
      showToast(false, "Wrong span.", 1400);

      // Phase 6: Record wrong span for Coach
      recordCoachEvent(false, mode === "all" ? "unknown" : mode, { reason: "wrong_span" });
      return;
    }

    const correctType = best.type;
    const typeRequired = (mode === "all");
    const typeChosen = typeRequired ? pickType : correctType;

    if (typeRequired && !pickType) {
      setFeedback({ ok: false, text: "Choose the construction type first." });
      return;
    }

    if (typeChosen !== correctType) {
      updateProgress((p) =>
        recordAttempt(p, correctType, false, { sid: best.sid, chosenType: typeChosen, reason: "wrong_type" })
      );

      // Phase 2: Log wrong type to universal event store
      logGrammarAttempt({
        constructionType: correctType,
        itemId: best.id,
        correct: false,
        userAnswer: typeChosen,
        expectedAnswer: correctType,
        metadata: { reason: "wrong_type", sid: best.sid },
      });

      setFeedback({ ok: false, text: `Right span area, wrong type. Try again (it is not ${prettyType(typeChosen)}).` });
      showToast(false, "Wrong type.", 1400);

      // Phase 6: Record wrong type for Coach
      recordCoachEvent(false, correctType, { reason: "wrong_type", chosenType: typeChosen });
      return;
    }

    const needsSubtype = requiresSubtype(correctType) && !!best.subtype;

    if (needsSubtype && !pickSubtype) {
      setFeedback({ ok: false, text: "Now choose the subtype (this construction has a real subtype)." });
      return;
    }

    if (needsSubtype && pickSubtype !== best.subtype) {
      updateProgress((p) =>
        recordAttempt(p, correctType, false, {
          sid: best.sid,
          chosenSubtype: pickSubtype,
          correctSubtype: best.subtype,
          reason: "wrong_subtype",
        })
      );

      // Phase 2: Log wrong subtype to universal event store
      logGrammarAttempt({
        constructionType: correctType,
        itemId: best.id,
        correct: false,
        subskill: SUBSKILLS.CLASSIFY,
        userAnswer: pickSubtype,
        expectedAnswer: best.subtype,
        metadata: { reason: "wrong_subtype", sid: best.sid },
      });

      setFeedback({ ok: false, text: "Right construction, wrong subtype. Keep the span and try another subtype." });
      showToast(false, "Wrong subtype.", 1400);

      // Phase 6: Record wrong subtype for Coach
      recordCoachEvent(false, correctType, { reason: "wrong_subtype", chosenSubtype: pickSubtype });
      return;
    }

    // success: lock it on screen
    setFoundIds((prev) => {
      const next = new Set(prev);
      next.add(best.id);
      return next;
    });

    // IMPORTANT: lock in session BEFORE any progress update can cause re-render + filtering
    sessionCorrectIdsRef.current.add(best.id);

    updateProgress((p) =>
      recordAttempt(p, correctType, true, { sid: best.sid, chosenType: typeChosen, chosenSubtype: pickSubtype || null })
    );

    // Phase 2: Log to universal event store
    logGrammarAttempt({
      constructionType: correctType,
      itemId: best.id,
      correct: true,
      subskill: SUBSKILLS.IDENTIFY,
      userAnswer: typeChosen,
      expectedAnswer: correctType,
      metadata: { sid: best.sid, subtype: pickSubtype || null },
    });

    setFeedback({ ok: true, text: `Correct: ${prettyType(correctType)}${needsSubtype ? ` (${best.subtype})` : ""}` });
    showToast(true, "Correct.", 1300);

    // Phase 6: Record correct answer for Coach
    recordCoachEvent(true, correctType, { itemId: best.id, subtype: pickSubtype || null });
  }

  function submitConditionalLabel() {
    if (!condLabelPrompt) return;
    if (!condPickLabel) {
      setFeedback({ ok: false, text: "Choose a conditional type from the dropdown." });
      return;
    }

    const { pairKey, correctLabel } = condLabelPrompt;
    const ok = condPickLabel === correctLabel;

    updateProgress((p) => recordAttempt(p, `conditional_label:${correctLabel}`, ok, { pairKey, chosen: condPickLabel }));

    // Phase 2: Log conditional attempt to universal event store
    logGrammarAttempt({
      constructionType: "conditionals",
      itemId: pairKey,
      correct: ok,
      subskill: SUBSKILLS.CLASSIFY,
      userAnswer: condPickLabel,
      expectedAnswer: correctLabel,
      metadata: { pairKey },
    });

    if (!ok) {
      setFeedback({ ok: false, text: "Wrong conditional type. Try again." });
      showToast(false, "Wrong conditional type.", 1400);

      // Phase 6: Record wrong conditional type for Coach
      recordCoachEvent(false, "conditionals", { reason: "wrong_conditional_type", chosenLabel: condPickLabel });
      return;
    }

    setCondAnswers((prev) => ({
      ...prev,
      [pairKey]: { chosenLabel: condPickLabel, ok: true },
    }));

    sessionCorrectLabelPairsRef.current.add(pairKey);

    setFeedback({ ok: true, text: "Conditional type correct." });
    showToast(true, "Conditional type locked for this session.", 1400);

    // Phase 6: Record correct conditional type for Coach
    recordCoachEvent(true, "conditionals", { conditionalType: condPickLabel });

    setCondLabelPrompt(null);
    setCondPickLabel("");
  }

  function doRevealAnswers() {
    if (revealAll) return;

    // Record reveal events for all unfound targets (Phase 0 - penalty for mastery)
    updateProgress((p) => {
      let np = p;
      for (const t of targets) {
        if (!foundIds.has(t.id)) {
          np = recordAttempt(np, t.type, false, {
            instanceId: t.id,
            revealed: true,
            sid: t.sid,
          });
        }
      }
      return np;
    });

    // Phase 2: Log reveal events to universal event store
    for (const t of targets) {
      if (!foundIds.has(t.id)) {
        logGrammarAttempt({
          constructionType: t.type,
          itemId: t.id,
          correct: false,
          revealed: true,
          metadata: { sid: t.sid, action: "reveal" },
        });
      }
    }

    // Phase 6: Record reveal event for Coach (triggers intervention)
    const unfoundCount = targets.filter(t => !foundIds.has(t.id)).length;
    if (unfoundCount > 0) {
      recordCoachEvent(false, mode === "all" ? "unknown" : mode, {
        revealed: true,
        unfoundCount,
        action: "reveal",
      });
    }

    setFlash(true);
    setTimeout(() => setFlash(false), 450);

    setTimeout(() => {
      setRevealAll(true);
      setPhase("revealed");
      setPopover(null);
      setDrag({ active: false, sid: null, start: null, end: null });
      setFeedback(null);
      setPickType("");
      setPickSubtype("");
      setCondPairLock(null);
      setCondLabelPrompt(null);
      setCondPickLabel("");
    }, 220);
  }

  function bandStyleForToken(sid, idx) {
    if (!revealAll && selection && selection.sid === sid && idx >= selection.start && idx <= selection.end) {
      return { bg: "#ffe9b5", border: "#caa300", boundaryStart: null, boundaryEnd: null };
    }

    let foundType = null;
    let revealType = null;
    let boundaryStart = null;
    let boundaryEnd = null;

    for (const it of targets) {
      if (it.sid !== sid) continue;

      for (const [a, b] of it.bands || []) {
        if (idx < a || idx > b) continue;

        const isFound = foundIds.has(it.id);
        const isVisible = isFound || revealAll;

        if (isVisible) {
          // Check if this token is at the boundary of the construction
          if (idx === a) {
            boundaryStart = it.type;
          }
          if (idx === b) {
            boundaryEnd = it.type;
          }
        }

        if (isFound) {
          foundType = it.type;
          break;
        }

        if (revealAll) {
          revealType = it.type;
        }
      }

      if (foundType) break;
    }

    const typeToUse = foundType || revealType;
    if (!typeToUse) return { bg: "transparent", border: "transparent", boundaryStart: null, boundaryEnd: null };

    const s = styleForType(typeToUse);
    return {
      bg: foundType ? s.foundBg : s.revealBg,
      border: s.border,
      boundaryStart,
      boundaryEnd,
    };
  }

  function onTokenMouseDown(sid, idx, sentence, e) {
    if (e?.preventDefault) e.preventDefault();
    clearNativeSelection();

    setFeedback(null);

    if (revealAll) {
      openInspectorAtToken(sid, idx, sentence);
      return;
    }

    if (phase === "complete") return;

    setPopover(null);
    setPickType("");
    setPickSubtype("");
    setCondLabelPrompt(null);
    setCondPickLabel("");
    setDrag({ active: true, sid, start: idx, end: idx });
  }

  function onTokenMouseEnter(sid, idx) {
    setDrag((d) => {
      if (!d.active) return d;
      if (d.sid !== sid) return d;
      return { ...d, end: idx };
    });
  }

  const excerptProgressPills = useMemo(() => {
    if (!chunk) return null;

    if (mode === "conditionals") {
      const protTotal = totalsByTypeInChunk.conditional_protasis ?? 0;
      const apoTotal = totalsByTypeInChunk.conditional_apodosis ?? 0;

      const protFound = foundCountsByType.conditional_protasis ?? 0;
      const apoFound = foundCountsByType.conditional_apodosis ?? 0;

      const labelsCorrect = conditionalPairs.filter((p) => condAnswers?.[p.pairKey]?.ok).length;

      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <ClausePill type="conditional_protasis">
            Protasis (excerpt): {protFound}/{protTotal}
          </ClausePill>
          <ClausePill type="conditional_apodosis">
            Apodosis (excerpt): {apoFound}/{apoTotal}
          </ClausePill>
          <ClausePill type="conditional_apodosis">
            Labels correct (excerpt): {labelsCorrect}/{conditionalPairs.length}
          </ClausePill>
          {condPairLock && (
            <ClausePill type="conditional_apodosis">
              Pair in progress: find {condPairLock.needRole}
            </ClausePill>
          )}
        </div>
      );
    }

    const list = mode === "all" ? ALL_TYPES_FOR_ALL_MODE : [mode];

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {list.map((t) => {
          const total = totalsByTypeInChunk[t] ?? 0;
          if (!total) return null;
          const found = foundCountsByType[t] ?? 0;
          return (
            <ClausePill key={t} type={t}>
              {prettyType(t)} (excerpt): {found}/{total}
            </ClausePill>
          );
        })}
      </div>
    );
  }, [chunk, mode, totalsByTypeInChunk, foundCountsByType, conditionalPairs, condAnswers, condPairLock]);

  const header = (
    <div className="sticky top-0 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-md p-4 mb-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="font-bold text-primary text-lg">Grammar Practice</div>

        <div className="text-sm text-gray-600">
          Timer: <span className="font-bold text-primary">{running ? formatTime(elapsed) : "00:00"}</span>
        </div>

        <div className="text-sm text-gray-600">
          Practicing:{" "}
          {lessonHref ? (
            <Link to={lessonHref} className="font-bold text-accent hover:underline">
              {prettyType(mode)}
            </Link>
          ) : (
            <span className="font-bold">{prettyType(mode)}</span>
          )}
        </div>

        {/* Progress indicator: instances remaining for individual modes, excerpts for "all" mode */}
        {mode === "all" && poolSize > 0 && (
          <div className="text-sm text-gray-600">
            Excerpts: <span className="font-bold text-primary">{seenStats.seen}</span> / {seenStats.total}
            {seenStats.cycleCount > 0 && (
              <span className="ml-1 opacity-60">(cycle {seenStats.cycleCount + 1})</span>
            )}
          </div>
        )}
        {mode !== "all" && instanceProgress && instanceProgress.total > 0 && (
          <div className="text-sm text-gray-600">
            <span className="font-bold text-primary">{instanceProgress.remaining}</span> instance{instanceProgress.remaining !== 1 ? "s" : ""} remaining
            <span className="ml-1 opacity-60">
              ({instanceProgress.mastered}/{instanceProgress.total} mastered)
            </span>
          </div>
        )}

        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={() => setShowStats(true)}
            className="px-3 py-2 border-2 border-gray-200 rounded-lg hover:border-accent transition-colors text-sm"
          >
            Stats
          </button>

          <select
            value={mode}
            onChange={(e) => {
              try {
                finalizeRef.current?.();
              } catch {}
              setMode(e.target.value);
              setShowMasteryCompleteModal(false);
            }}
            className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none text-sm"
          >
            {PRACTICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={generate}
            className="px-4 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors text-sm"
          >
            Generate ({sentenceCap})
          </button>

          {!revealAll ? (
            <button
              onClick={doRevealAnswers}
              disabled={!chunk}
              className={`px-3 py-2 border-2 rounded-lg text-sm transition-colors ${
                chunk
                  ? "border-gray-200 hover:border-accent cursor-pointer"
                  : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Reveal answers
            </button>
          ) : (
            <button
              disabled
              className="px-3 py-2 border-2 border-green-300 bg-green-50 rounded-lg text-sm font-bold text-green-700"
            >
              Answers revealed
            </button>
          )}
        </div>
      </div>

      {excerptProgressPills}
      {mode === "conditionals" && chunk && !revealAll && (
        <div className="mt-3 p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm font-bold text-primary">
          {condPairLock
            ? `Now find the matching ${condPairLock.needRole}.`
            : condLabelPrompt
              ? `Now choose the conditional type${condLabelPrompt.solo ? " (solo)" : ""}.`
              : "Drag a protasis or apodosis to begin."}
        </div>
      )}

      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        {!revealAll ? (
          <>
            Drag across the words that mark a construction. Then submit.
            {mode === "all" && (
              <>
                {" "}
                In <span className="font-semibold">All constructions</span>, you must also pick the construction type (and subtype when applicable).
              </>
            )}
            {mode === "conditionals" && (
              <>
                {" "}
                For conditionals: find a <span className="font-semibold">protasis</span> or <span className="font-semibold">apodosis</span>, then you must find its partner before labeling the
                conditional type.
              </>
            )}
            {mode !== "all" && mode !== "conditionals" && (
              <> If a construction has a real subtype (like purpose clause), you'll be asked for it.</>
            )}
          </>
        ) : (
          <>Answers are visible. Click any word to inspect morphology and syntax.</>
        )}
      </p>
    </div>
  );

  function renderSentenceInline(s, showSid = true) {
    const sid = String(s.sid);
    const tokens = Array.isArray(s.tokens) ? s.tokens : [];

    return (
      <span key={`sent-${sid}`} style={{ fontSize: 17, lineHeight: 2.05 }}>
        {showSid && <span style={{ fontSize: 12, opacity: 0.55, marginRight: 6 }}>[{sid}]</span>}

        {tokens.map((_, i) => {
          const band = bandStyleForToken(sid, i);
          const underline = band.bg !== "transparent"
            ? `linear-gradient(transparent 70%, ${band.bg} 70%)`
            : "none";

          const badges = condRoleBadgeMap.get(`${sid}|${i}`) || [];

          // Get boundary indicators for visual markers
          const startBoundary = band.boundaryStart ? getBoundaryIndicator(band.boundaryStart) : null;
          const endBoundary = band.boundaryEnd ? getBoundaryIndicator(band.boundaryEnd) : null;
          const startStyle = band.boundaryStart ? styleForType(band.boundaryStart) : null;
          const endStyle = band.boundaryEnd ? styleForType(band.boundaryEnd) : null;

          return (
            <span
              key={`${sid}-${i}`}
              ref={(el) => registerTokenRef(sid, i, el)}
              onMouseDown={(e) => onTokenMouseDown(sid, i, s, e)}
              onMouseEnter={() => onTokenMouseEnter(sid, i)}
              style={{
                position: "relative",
                display: "inline-block",
                cursor: revealAll ? "pointer" : "grab",
                border: `1px solid ${band.border}`,
                borderRadius: 6,
                padding: "2px 3px",
                background: band.bg,
                backgroundImage: underline,
                userSelect: "none",
                WebkitUserSelect: "none",
                zIndex: badges.length ? 10 : 1,
              }}
            >
              {/* Boundary start marker */}
              {startBoundary && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    left: -2,
                    fontSize: 9,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: startStyle?.border || "#666",
                    opacity: 0.85,
                    pointerEvents: "none",
                  }}
                >
                  {startBoundary.start}
                </span>
              )}

              {badges.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -14,
                    left: 2,
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    pointerEvents: "none",
                    alignItems: "flex-start",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badges.map((txt, bi) => (
                    <span
                      key={`${sid}-${i}-b-${bi}`}
                      style={{
                        fontSize: 10,
                        fontWeight: 950,
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        background: "#fff",
                        boxShadow: "0 6px 14px rgba(0,0,0,0.08)",
                        opacity: 0.98,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {txt}
                    </span>
                  ))}
                </span>
              )}

              {tokenWithSpacing(tokens, i)}

              {/* Boundary end marker */}
              {endBoundary && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    fontSize: 9,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: endStyle?.border || "#666",
                    opacity: 0.85,
                    pointerEvents: "none",
                  }}
                >
                  {endBoundary.end}
                </span>
              )}
            </span>
          );
        })}

        <span>{" "}</span>
      </span>
    );
  }

  function renderExcerptBlock(b, isFirst) {
    const label = String(b?.label || "");
    const sents = Array.isArray(b?.sentences) ? b.sentences : [];

    return (
      <div key={`block-${label}-${isFirst ? "a" : "b"}`}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10, opacity: 0.85 }}>
          {label}
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 14,
            border: "1px solid #eee",
            background: "#fff",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            clearNativeSelection();
          }}
        >
          {sents.map((s) => renderSentenceInline(s, true))}
        </div>
      </div>
    );
  }

  // ----- Stats modal -----
  const statsBody = useMemo(() => {
    const totals = corpusTotals?.instance_counts || {};
  
    // Always show all constructions in the table (plus conditional label as a skill)
    const tableTypes = [
      ...ALL_NON_CONDITIONAL_TYPES,
      "conditional_protasis",
      "conditional_apodosis",
      "conditional_label",
    ];
  
    const spanMissAll = progress.stats?.span_miss_all?.attempts || 0;
    const conditionalSpanMisses = progress.stats?.conditional_span_miss?.attempts || 0;
  
    // Helper: attempt totals for conditional labels live in conditional_label:* buckets
    let condLabelAttempts = 0;
    let condLabelCorrect = 0;
    for (const [bucket, st] of Object.entries(progress.stats || {})) {
      if (!bucket.startsWith("conditional_label:")) continue;
      condLabelAttempts += st?.attempts || 0;
      condLabelCorrect += st?.correct || 0;
    }
  
    const rows = tableTypes.map((t) => {
      // totals only exist for real constructions, not for conditional_label
      const total = t === "conditional_label" ? null : (totals[t] ?? 0);
  
      const done = countMastered(progress, t);
  
      // attempts for the construction itself
      const stat = progress.stats?.[t] || null;
      const attempts = stat?.attempts || 0;
  
      // misses that are attributable to a specific single-type practice mode
      const misses =
        t === "conditional_label" || t === "conditional_protasis" || t === "conditional_apodosis"
          ? 0
          : (progress.stats?.[`span_miss:${t}`]?.attempts || 0);
  
      // conditional label row uses aggregated attempts across conditional_label:* buckets
      const attemptsTotal =
        t === "conditional_label"
          ? condLabelAttempts
          : attempts + misses;
  
      // Accuracy definition per your spec:
      // accuracy = mastered / attemptsTotal (do NOT smear span_miss_all across each row)
      const acc = attemptsTotal ? Math.min(1, done / attemptsTotal) : null;
  
      return {
        t,
        total,
        done,
        attemptsTotal,
        acc,
        // keep these for optional display/debug if you want later
        attempts,
        misses,
      };
    });
  
    // Overall “All constructions” accuracy: mastered across non-conditional constructions / (attempts + span_miss_all)
    let overallAll = null;
    if (true) {
      let masteredSum = 0;
      let attemptsSum = 0;
  
      for (const t of ALL_NON_CONDITIONAL_TYPES) {
        masteredSum += countMastered(progress, t);
  
        const st = progress.stats?.[t] || null;
        attemptsSum += st?.attempts || 0;
  
        // include attributable misses from single-type sessions too (still attempts)
        attemptsSum += progress.stats?.[`span_miss:${t}`]?.attempts || 0;
      }
  
      const denom = attemptsSum + spanMissAll;
      overallAll = denom ? Math.min(1, masteredSum / denom) : null;
    }
  
    // Struggles: only show things that are genuinely weak (<50%) with enough attempts
    const struggles = [];
  
    // per-construction struggles
    for (const r of rows) {
      if (!r.attemptsTotal) continue;
      if (r.attemptsTotal < 8) continue;
      if (r.acc == null) continue;
      if (r.acc >= 0.5) continue;
  
      struggles.push({
        bucket: r.t,
        attempts: r.attemptsTotal,
        acc: r.acc,
      });
    }
  
    // Special miss buckets allowed:
    if (spanMissAll >= 8) {
      struggles.push({
        bucket: "span_miss_all",
        attempts: spanMissAll,
        acc: 0, // not a real accuracy bucket; just to sort it low
      });
    }
  
    if (conditionalSpanMisses >= 8) {
      struggles.push({
        bucket: "conditional_span_miss",
        attempts: conditionalSpanMisses,
        acc: 0,
      });
    }
  
    // sort: lowest accuracy first, then higher attempts
    struggles.sort((a, b) => (a.acc - b.acc) || (b.attempts - a.attempts));
    const topStruggles = struggles.slice(0, 8);
  
    return {
      rows,
      struggles: topStruggles,
      history: (progress.history || []).slice(-25).reverse(),
      overallAll,
      spanMissAll,
      conditionalSpanMisses,
    };
  }, [progress, corpusTotals]);
  

  // Action type labels for banner
  const actionLabels = {
    targeted_drill: { label: "Targeted Drill", desc: "Focus on this skill" },
    review_misses: { label: "Review Mode", desc: "Reviewing missed items" },
    coverage_push: { label: "Coverage Mode", desc: "Exploring new material" },
  };

  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {header}

      {/* Action type banner when launched from Mastery page */}
      {actionType && actionLabels[actionType] && (
        <div className="mb-4 px-5 py-3 bg-primary rounded-xl text-white flex justify-between items-center">
          <div>
            <span className="font-bold">{actionLabels[actionType].label}</span>
            <span className="opacity-90 ml-2">{actionLabels[actionType].desc}</span>
          </div>
          <Link
            to="/mastery"
            className="px-4 py-2 bg-white/20 rounded-lg text-white text-sm hover:bg-white/30 transition-colors"
          >
            Back to Mastery
          </Link>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9000,
            border: `1px solid ${toast.ok ? "#bfe7c8" : "#f0b3b3"}`,
            background: toast.ok ? "#f3fff6" : "#fff3f3",
            borderRadius: 999,
            padding: "8px 12px",
            fontWeight: 900,
            boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
          }}
        >
          {toast.ok ? "✅ " : "❌ "}
          {toast.text}
        </div>
      )}

      {flash && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            background: "rgba(255,255,255,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              border: "1px solid #e7e7e7",
              background: "#fff",
              borderRadius: 16,
              padding: "14px 16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              fontWeight: 950,
            }}
          >
            Answers revealed
          </div>
        </div>
      )}

      {/* Cycle completion modal (Phase 0) */}
      {showCycleModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "28px 32px",
              maxWidth: 420,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Cycle Complete!</h2>
            <p style={{ color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
              You've seen <strong>{seenStats.seen}</strong> of <strong>{seenStats.total}</strong> excerpts
              ({Math.round(seenStats.percentage)}%).
              {seenStats.cycleCount > 0 && (
                <span> This is cycle #{seenStats.cycleCount + 1}.</span>
              )}
            </p>
            <p style={{ color: "#777", fontSize: 14, marginBottom: 20 }}>
              Starting a fresh cycle so you can practice with new excerpts.
            </p>
            <button
              onClick={() => {
                resetSeenExcerpts(studentId, mode, mode);
                setShowCycleModal(false);
                setSeenStats({ seen: 0, total: poolSize || 0, percentage: 0, cycleCount: seenStats.cycleCount + 1 });
              }}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 28px",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Continue Learning
            </button>
          </div>
        </div>
      )}

      {/* Mastery complete modal - shown when all instances of a construction type are mastered */}
      {showMasteryCompleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "28px 32px",
              maxWidth: 420,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>All Instances Mastered!</h2>
            <p style={{ color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
              Congratulations! You've correctly identified all{" "}
              <strong>{instanceProgress?.total || 0}</strong> {prettyType(mode)} instances.
            </p>
            <p style={{ color: "#777", fontSize: 14, marginBottom: 20 }}>
              You can continue practicing to reinforce your knowledge, or try a different construction type.
            </p>
            <button
              onClick={() => {
                setShowMasteryCompleteModal(false);
              }}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 28px",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Continue Practice
            </button>
          </div>
        </div>
      )}

      {/* completion overlay (2 buttons only) */}
      {phase === "complete" && chunk && !revealAll && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 6500,
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onMouseDown={() => {}}
        >
          <div
            style={{
              width: 560,
              maxWidth: "calc(100vw - 24px)",
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 22px 60px rgba(0,0,0,0.22)",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 8 }}>Excerpt complete</div>
            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
              Choose what you want to do next.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={generate}
                style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
              >
                Next excerpt
              </button>
              <button
                onClick={doRevealAnswers}
                style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
              >
                Review answers
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {err && (
          <div style={{ border: "1px solid #f0b3b3", background: "#fff3f3", borderRadius: 14, padding: 12, color: "#b00020" }}>
            {err}
          </div>
        )}

        {!chunk && (
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fff", opacity: 0.85 }}>
            Generate an excerpt to start.
          </div>
        )}

        {chunk && (
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fff" }}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Excerpt</div>

            <div style={{ display: "grid", gap: 14 }}>
              {(chunk.blocks || []).map((b, idx) => renderExcerptBlock(b, idx === 0))
              }
            </div>

            <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 14 }}>
              <button
                onClick={() => setShowTranslation((v) => !v)}
                style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
              >
                {showTranslation ? "Hide translation" : "Show translation"}
              </button>

              {showTranslation && (
                <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.7 }}>
                  {(chunk.blocks || []).map((b, idx) => (
                    <div key={`tr-${b.startSid}-${idx}`} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6, opacity: 0.85 }}>{b.label}</div>

                      {(b.sentences || []).map((s) => {
                        const sid = String(s.sid);
                        const tr = String(s.translation || "").trim();
                        return (
                          <div key={`tr-${sid}`} style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 12, opacity: 0.6, marginRight: 8 }}>[{sid}]</span>
                            {tr || <span style={{ opacity: 0.6 }}>(no translation)</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Grading popover (only before reveal) */}
        {!revealAll && popover && selection && chunk && phase !== "complete" && (
          <div style={{ position: "fixed", inset: 0, zIndex: 1999 }} onMouseDown={cancelSelection}>
            <div
              style={{
                position: "fixed",
                left: popover.x,
                top: popover.y,
                zIndex: 2000,
                width: 330,
                border: "1px solid #ddd",
                borderRadius: 12,
                background: "#fff",
                boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
                padding: 10,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                Selection: <b>{selection.sid}</b> {selection.start}–{selection.end} (punct trimmed for grading)
              </div>

              {(mode === "conditionals" || (mode === "all" && isConditionalType(pickType))) && condPairLock && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 10,
                    border: "1px solid #ffe6a6",
                    background: "#fff9e6",
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  Finish this pair: find the {condPairLock.needRole}.
                </div>
              )}


              {mode === "all" && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Construction type:</div>
                  <select
                    value={pickType}
                    onChange={(e) => {
                      setPickType(e.target.value);
                      setPickSubtype("");
                    }}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
                  >
                    <option value="" disabled>Choose…</option>
                    {ALL_TYPES_FOR_ALL_MODE.map((t) => (
                      <option key={t} value={t}>{prettyType(t)}</option>
                    ))}

                  </select>
                </div>
              )}

              {mode !== "conditionals" && (
                (() => {
                  const effectiveType = mode === "all" ? pickType : mode;
                  const opts = subtypeOptionsForType(effectiveType);
                  if (!opts) return null;

                  return (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Subtype (if applicable):</div>
                      <select
                        value={pickSubtype}
                        onChange={(e) => setPickSubtype(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
                      >
                        <option value="">Choose…</option>
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()
              )}

              {/* conditionals label classification prompt only after pair complete */}
              {(mode === "conditionals" || (mode === "all" && isConditionalType(pickType))) && condLabelPrompt && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Conditional type:</div>
                  <select
                    value={condPickLabel}
                    onChange={(e) => setCondPickLabel(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
                  >
                    <option value="" disabled>Choose…</option>
                    {CONDITIONAL_LABEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}


              {feedback && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 10,
                    border: feedback.ok ? "1px solid #bfe7c8" : "1px solid #f0b3b3",
                    background: feedback.ok ? "#f3fff6" : "#fff3f3",
                    fontSize: 13,
                  }}
                >
                  {feedback.ok ? "✅ " : "❌ "}
                  {feedback.text}
                </div>
              )}

              
              <div style={{ display: "flex", gap: 8 }}>
                {((mode === "conditionals") || (mode === "all" && isConditionalType(pickType))) && condLabelPrompt ? (
                  <>
                    <button
                      onClick={submitConditionalLabel}
                      style={{
                        flex: 1,
                        border: "1px solid #ccc",
                        background: "#fff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Submit conditional type
                    </button>
                    <button
                      onClick={cancelSelection}
                      style={{
                        flex: 1,
                        border: "1px solid #ccc",
                        background: "#fff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={gradeSelection}
                      style={{
                        flex: 1,
                        border: "1px solid #ccc",
                        background: "#fff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Submit
                    </button>
                    <button
                      onClick={cancelSelection}
                      style={{
                        flex: 1,
                        border: "1px solid #ccc",
                        background: "#fff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </>
                )}

              </div>

            </div>
          </div>
        )}

        {/* WordInspector popover (after reveal) */}
        {inspect && (
          <div style={{ position: "fixed", inset: 0, zIndex: 3500 }} onMouseDown={() => setInspect(null)}>
            <div
              style={{
                position: "fixed",
                left: inspect.x,
                top: inspect.y,
                width: 440,
                maxWidth: "calc(100vw - 24px)",
                maxHeight: "calc(100vh - 24px)",
                overflow: "auto",
                border: "1px solid #ddd",
                borderRadius: 14,
                background: "#fff",
                boxShadow: "0 16px 44px rgba(0,0,0,0.18)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <WordInspector
                token={inspect.token}
                tokenIndex={inspect.idx}
                sentence={inspect.sentence}
                constructions={inspect.constructions}
                onClose={() => setInspect(null)}
              />
            </div>
          </div>
        )}

        {/* Stats modal */}
        {showStats && (
          <div style={{ position: "fixed", inset: 0, zIndex: 6000, background: "rgba(0,0,0,0.25)" }} onMouseDown={() => setShowStats(false)}>
            <div
              style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 860,
                maxWidth: "calc(100vw - 24px)",
                maxHeight: "calc(100vh - 24px)",
                overflow: "auto",
                border: "1px solid #ddd",
                borderRadius: 16,
                background: "#fff",
                boxShadow: "0 22px 60px rgba(0,0,0,0.22)",
                padding: 14,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 950, fontSize: 16 }}>Progress & Accuracy</div>
                <button
                  onClick={() => setShowStats(false)}
                  style={{ marginLeft: "auto", border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>

              {mode === "all" && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  Overall accuracy (includes span misses):{" "}
                  <b>{statsBody.overallAll == null ? "—" : `${Math.round(statsBody.overallAll * 100)}%`}</b>
                  {" · "}
                  span misses (all): <b>{statsBody.spanMissAll}</b>
                </div>
              )}

              {mode === "conditionals" && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  Conditional span misses: <b>{statsBody.conditionalSpanMisses}</b>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  By construction {mode === "all" ? "(per-type accuracy; overall shown above)" : "(misses included when attributable)"}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {statsBody.rows.map((r) => (
                    <div
                      key={r.t}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.7fr 0.7fr 0.7fr",
                        gap: 10,
                        alignItems: "center",
                        border: "1px solid #eee",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ClausePill type={r.t}>{prettyType(r.t)}</ClausePill>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Mastered:{" "}
                        <b>
                          {r.total == null ? `${r.done}/—` : `${Math.min(r.done, r.total)}/${r.total}`}
                        </b>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Attempts: <b>{r.attemptsTotal}</b>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Accuracy: <b>{r.acc == null ? "—" : `${Math.round(r.acc * 100)}%`}</b>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Likely struggles (low accuracy, enough attempts)</div>
                {!statsBody.struggles.length ? (
                  <div style={{ opacity: 0.75, border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                    Not enough data yet (keep practicing).
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {statsBody.struggles.map((s) => (
                      <div key={s.bucket} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, fontSize: 13 }}>
                        <b>
                          {s.bucket === "conditional_span_miss"
                            ? "Conditional span misses"
                            : s.bucket.startsWith("conditional_label:")
                              ? `Conditional: ${labelForConditionalValue(s.bucket.split(":")[1])}`
                              : s.bucket === "span_miss_all"
                                ? "Misses in all constructions mode"
                                : prettyType(s.bucket)}
                        </b>
                        {" · "}
                        attempts <b>{s.attempts}</b>, accuracy <b>{Math.round(s.acc * 100)}%</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Recent attempts</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {statsBody.history.map((h, idx) => (
                    <div key={`${h.t}-${idx}`} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, fontSize: 13 }}>
                      <span style={{ opacity: 0.75 }}>{new Date(h.t).toLocaleString()}</span>
                      {" · "}
                      <b>
                        {h.bucket === "conditional_span_miss"
                          ? "Conditional span miss"
                          : h.bucket.startsWith("conditional_label:")
                            ? `Conditional: ${labelForConditionalValue(h.bucket.split(":")[1])}`
                            : prettyType(h.bucket)}
                      </b>
                      {" · "}
                      {h.ok ? "✅ correct" : "❌ wrong"}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
                <button
                  onClick={() => {
                    const resetTypes =
                      mode === "conditionals"
                        ? ["conditional_protasis", "conditional_apodosis", "conditional_label"]
                        : mode === "all"
                          ? ALL_NON_CONDITIONAL_TYPES
                          : [mode];

                    setProgress((p) => saveGrammarProgress(clearMastered(p, resetTypes)));
                    setShowStats(false);
                  }}
                  style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
                >
                  Reset mastery for this mode
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 6: Coach overlay */}
        <CoachOverlay
          intervention={coach.intervention}
          visible={coach.visible}
          onDismiss={coach.dismiss}
          onAction={coach.handleAction}
          position="bottom-right"
        />
        </div>
      </div>
    </>
  );
}
