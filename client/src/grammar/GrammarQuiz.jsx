// GrammarQuiz.jsx - Main quiz component for grammar lessons
// Uses selection + popover pattern like GrammarPractice

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchExamples, fetchSentenceBundle } from "../lib/caesarApi";
import { getQuizConfig } from "../data/grammarQuizConfigs";
import {
  logAttemptEvent,
  EVENT_TYPES,
  getSkillForConstructionType,
  SUBSKILLS,
} from "../lib/attemptEvents";
import QuizSentence from "./QuizSentence";

// Shuffle array using Fisher-Yates
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isPunctToken(t) {
  if (!t) return false;
  if (t.upos === "PUNCT") return true;
  const s = t.text || "";
  return s.length === 1 && /[.,;:!?]/.test(s);
}

// Trim punctuation from selection boundaries
function trimSelectionPunct(tokens, start, end) {
  let a = start;
  let b = end;
  while (a <= b && isPunctToken(tokens[a])) a++;
  while (b >= a && isPunctToken(tokens[b])) b--;
  if (a > b) return { start, end };
  return { start: a, end: b };
}

// Get normalized span from construction
function normalizedSpanFromConstruction(c) {
  const hs = Array.isArray(c?.highlight_spans) ? c.highlight_spans : [];
  if (hs.length) {
    let minStart = Infinity, maxEnd = -Infinity;
    for (const [a, b] of hs) {
      minStart = Math.min(minStart, a);
      maxEnd = Math.max(maxEnd, b);
    }
    return [minStart, maxEnd];
  }
  const s = c?.start ?? 0;
  const e = c?.end ?? s;
  return [s, e];
}

function spanKey(span) {
  if (!span || span.length < 2) return "0-0";
  return `${span[0]}-${span[1]}`;
}

// Match apodosis to protasis using verb_index (from GrammarPractice)
function apodosisMatchesProtasis(aConstruction, protasisVerbIndex, apodosisVerbIndex) {
  const aTag = aConstruction;
  const ap2 = aTag?.conditional?.apodosis?.verb_index ?? null;
  if (apodosisVerbIndex != null && ap2 != null && ap2 !== apodosisVerbIndex) return false;

  const pv2 = aTag?.conditional?.protasis?.verb_index ?? null;
  const pvs = aTag?.conditional?.protasis_verb_indexes;

  if (Array.isArray(pvs)) {
    // backend-style: one apodosis shared by many protases
    return protasisVerbIndex != null ? pvs.includes(protasisVerbIndex) : true;
  }

  // normal case: one-to-one pairing
  if (protasisVerbIndex != null && pv2 != null) return pv2 === protasisVerbIndex;

  // If neither has verb_index, allow matching (best effort for incomplete tagging)
  if (protasisVerbIndex == null && pv2 == null) {
    return true;
  }

  // If only one has verb_index, don't match - data is inconsistent
  return false;
}

export default function GrammarQuiz({ lessonKey }) {
  const config = getQuizConfig(lessonKey);

  const [sentences, setSentences] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading | identify | classify | feedback | complete
  const [error, setError] = useState(null);

  // Selection state (drag selection)
  const [drag, setDrag] = useState({ active: false, start: null, end: null });
  const selection = useMemo(() => {
    if (drag.start == null || drag.end == null) return null;
    return { start: Math.min(drag.start, drag.end), end: Math.max(drag.start, drag.end) };
  }, [drag]);

  // Multi-instance tracking: which targets have been found
  const [foundIds, setFoundIds] = useState(new Set());

  // Conditional pair lock: when user finds a protasis, they must find the matching apodosis
  const [condPairLock, setCondPairLock] = useState(null); // { pairKey, needRole }

  // Popover for feedback/classification
  const [popover, setPopover] = useState(null); // { x, y }
  const [feedback, setFeedback] = useState(null); // { ok, text }

  // Currently matched target (for classification)
  const [matchedTarget, setMatchedTarget] = useState(null);

  // Classification state
  const [classifyAnswer, setClassifyAnswer] = useState(null);

  // Results tracking
  const [results, setResults] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Token refs for popover positioning
  const tokenRefs = useRef(new Map());

  // Timing
  const [stepStartTime, setStepStartTime] = useState(null);

  // Load sentences on mount
  useEffect(() => {
    if (!config) return;

    let cancelled = false;
    setPhase("loading");
    setError(null);
    setSentences([]);
    setResults([]);
    setCurrentIndex(0);

    async function loadSentences() {
      try {
        const data = await fetchExamples(config.constructionTypes);
        if (cancelled) return;

        if (!data?.items?.length) {
          setError("No examples found for this construction type.");
          return;
        }

        const shuffled = shuffle(data.items);
        const selected = shuffled.slice(0, config.sentenceCount);

        const bundles = await Promise.all(
          selected.map((item) => fetchSentenceBundle(item.sid))
        );
        if (cancelled) return;

        const sentenceData = bundles.map((b) => b?.sentence || b);
        setSentences(sentenceData);
        setPhase("identify");
        setStepStartTime(Date.now());
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load sentences");
        }
      }
    }

    loadSentences();
    return () => {
      cancelled = true;
    };
  }, [lessonKey, config]);

  const currentSentence = sentences[currentIndex];
  const tokens = currentSentence?.tokens || [];
  const isConditional = config?.steps?.[0]?.type === "identify_pair";

  // Build targets from current sentence constructions
  // Uses GrammarPractice's approach for proper conditional pair matching
  const targets = useMemo(() => {
    if (!currentSentence?.constructions || !config) return [];
    const out = [];
    const cons = currentSentence.constructions;
    const sid = currentSentence.sid;

    // Non-conditional targets
    for (let i = 0; i < cons.length; i++) {
      const c = cons[i];
      const t = c?.type;
      if (!t || !config.constructionTypes.includes(t)) continue;
      if (t === "conditional_protasis" || t === "conditional_apodosis") continue;

      const span = normalizedSpanFromConstruction(c);
      const subtype = c?.subtype || "";
      const id = `${sid}|${t}|${subtype}|${span[0]}|${span[1]}|${i}`;

      out.push({
        id,
        sid,
        type: t,
        subtype,
        role: null,
        pairKey: null,
        label: null,
        span,
        construction: c,
      });
    }

    // Skip conditional pair processing if this quiz doesn't need them
    if (!config.constructionTypes.includes("conditional_protasis") &&
        !config.constructionTypes.includes("conditional_apodosis")) {
      return out;
    }

    // Conditional targets - match pairs like GrammarPractice does
    const protases = cons.map((c, i) => ({ c, i })).filter(x => x.c?.type === "conditional_protasis");
    const apodoses = cons.map((c, i) => ({ c, i })).filter(x => x.c?.type === "conditional_apodosis");
    const usedAp = new Set();

    for (let pi = 0; pi < protases.length; pi++) {
      const { c: p, i: pIdx } = protases[pi];

      const pv = p?.conditional?.protasis?.verb_index ?? null;
      const ap = p?.conditional?.apodosis?.verb_index ?? null;
      const label = p?.conditional?.label || p?.subtype || "mixed";
      const pSpan = normalizedSpanFromConstruction(p);

      // Find a matching apodosis for this protasis
      let aTag = null;
      let aIdx = -1;
      let aSpan = null;

      for (let ai = 0; ai < apodoses.length; ai++) {
        if (usedAp.has(ai)) continue;
        const { c: a } = apodoses[ai];
        if (apodosisMatchesProtasis(a, pv, ap)) {
          aTag = a;
          aIdx = ai;
          aSpan = normalizedSpanFromConstruction(a);
          usedAp.add(ai);
          break;
        }
      }

      // Create unique pairKey using both spans (like GrammarPractice)
      const pairKey = aTag
        ? `${sid}|p:${spanKey(pSpan)}|a:${spanKey(aSpan)}|pv:${pv ?? "?"}|ap:${ap ?? "?"}`
        : `${sid}|p:${spanKey(pSpan)}|a:none|pv:${pv ?? "?"}|ap:${ap ?? "?"}`;

      // Add protasis target
      const protId = `${pairKey}|protasis|${pSpan[0]}|${pSpan[1]}|${pIdx}`;
      out.push({
        id: protId,
        sid,
        type: "conditional_protasis",
        subtype: String(p?.subtype || label || "mixed"),
        role: "protasis",
        pairKey,
        label,
        span: pSpan,
        construction: p,
      });

      // Add apodosis target if found
      if (aTag && aSpan) {
        const apoId = `${pairKey}|apodosis|${aSpan[0]}|${aSpan[1]}|${apodoses[aIdx].i}`;
        out.push({
          id: apoId,
          sid,
          type: "conditional_apodosis",
          subtype: String(aTag?.subtype || label || "mixed"),
          role: "apodosis",
          pairKey,
          label,
          span: aSpan,
          construction: aTag,
        });
      }
    }

    // Handle any unpaired apodoses
    for (let ai = 0; ai < apodoses.length; ai++) {
      if (usedAp.has(ai)) continue;
      const { c: a, i: aIdx } = apodoses[ai];
      const aSpan = normalizedSpanFromConstruction(a);
      const label = a?.conditional?.label || a?.subtype || "mixed";
      const pairKey = `${sid}|p:none|a:${spanKey(aSpan)}|unpaired|${ai}`;
      const apoId = `${pairKey}|apodosis|${aSpan[0]}|${aSpan[1]}|${aIdx}`;

      out.push({
        id: apoId,
        sid,
        type: "conditional_apodosis",
        subtype: String(a?.subtype || label || "mixed"),
        role: "apodosis",
        pairKey,
        label,
        span: aSpan,
        construction: a,
      });
    }

    // Deduplicate by span to avoid double-counting
    const seen = new Set();
    const deduped = [];
    for (const t of out) {
      const key = `${t.type}|${t.span[0]}-${t.span[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(t);
      }
    }
    return deduped;
  }, [currentSentence, config]);

  // For conditionals: group by pair (only complete pairs)
  const conditionalPairs = useMemo(() => {
    if (!isConditional) return [];
    const map = new Map();
    for (const t of targets) {
      if (!t.pairKey) continue;
      if (!map.has(t.pairKey)) {
        map.set(t.pairKey, { pairKey: t.pairKey, protasis: null, apodosis: null, label: t.label });
      }
      const pair = map.get(t.pairKey);
      if (t.role === "protasis") pair.protasis = t;
      if (t.role === "apodosis") pair.apodosis = t;
    }
    // Only return complete pairs (both protasis and apodosis)
    return Array.from(map.values()).filter(p => p.protasis && p.apodosis);
  }, [isConditional, targets]);

  // Count how many pairs are fully complete (both parts found)
  const completedPairCount = useMemo(() => {
    return conditionalPairs.filter(p =>
      foundIds.has(p.protasis?.id) && foundIds.has(p.apodosis?.id)
    ).length;
  }, [conditionalPairs, foundIds]);

  // Check if all targets/pairs are found
  const allFound = useMemo(() => {
    if (isConditional) {
      return conditionalPairs.length > 0 && conditionalPairs.every(p =>
        foundIds.has(p.protasis?.id) && foundIds.has(p.apodosis?.id)
      );
    }
    return targets.length > 0 && targets.every(t => foundIds.has(t.id));
  }, [isConditional, conditionalPairs, targets, foundIds]);

  // Get spans for highlighting
  const correctSpans = useMemo(() => {
    return targets.filter(t => !foundIds.has(t.id)).map(t => t.span);
  }, [targets, foundIds]);

  const foundSpans = useMemo(() => {
    return targets.filter(t => foundIds.has(t.id)).map(t => t.span);
  }, [targets, foundIds]);

  // Register token refs for popover positioning
  const registerTokenRef = useCallback((idx, el) => {
    if (el) {
      tokenRefs.current.set(idx, el);
    }
  }, []);

  // Find best matching target for a selection
  const findBestMatch = useCallback((sel, roleFilter = null, pairKeyFilter = null) => {
    if (!sel || !tokens.length) return null;

    const trimmed = trimSelectionPunct(tokens, sel.start, sel.end);
    const candidates = [];

    for (const target of targets) {
      if (foundIds.has(target.id)) continue;
      if (roleFilter && target.role !== roleFilter) continue;
      if (pairKeyFilter && target.pairKey !== pairKeyFilter) continue;

      const [trueStart, trueEnd] = target.span;
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
        candidates.push({ target, score: ds + de });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].target;
  }, [targets, foundIds, tokens]);

  // Compute popover position from selection
  const computePopoverPosition = useCallback(() => {
    if (!selection) return null;

    const rects = [];
    for (let i = selection.start; i <= selection.end; i++) {
      const el = tokenRefs.current.get(i);
      if (el) rects.push(el.getBoundingClientRect());
    }
    if (!rects.length) return null;

    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const r of rects) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }

    const popW = 320;
    const popH = 200;
    let x = left + (right - left) / 2 - popW / 2;
    let y = bottom + 10;

    if (y + popH > window.innerHeight - 10) {
      y = top - popH - 10;
    }
    x = Math.max(10, Math.min(window.innerWidth - popW - 10, x));
    y = Math.max(10, y);

    return { x, y };
  }, [selection]);

  // Handle token mouse events
  const handleTokenMouseDown = useCallback((idx) => {
    if (phase !== "identify") return;
    setDrag({ active: true, start: idx, end: idx });
    setPopover(null);
    setFeedback(null);
  }, [phase]);

  const handleTokenMouseEnter = useCallback((idx) => {
    if (!drag.active) return;
    setDrag(d => ({ ...d, end: idx }));
  }, [drag.active]);

  // Handle mouseup globally to open popover
  useEffect(() => {
    function onGlobalMouseUp() {
      if (!drag.active) return;
      setDrag(d => ({ ...d, active: false }));

      if (selection && phase === "identify") {
        const pos = computePopoverPosition();
        if (pos) {
          setPopover(pos);
          setFeedback(null);
        }
      }
    }

    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, [drag.active, selection, phase, computePopoverPosition]);

  // Cancel selection
  const cancelSelection = useCallback(() => {
    setDrag({ active: false, start: null, end: null });
    setPopover(null);
    setFeedback(null);
    setMatchedTarget(null);
    setClassifyAnswer(null);
  }, []);

  // Get current step config
  const currentStep = useMemo(() => {
    if (phase === "identify") return config?.steps?.[0];
    if (phase === "classify") return config?.steps?.find(s => s.type === "classify" || s.type === "self_check");
    return null;
  }, [phase, config]);

  // Handle submit button in popover
  const handleSubmit = useCallback(() => {
    if (!selection) return;

    const latencyMs = stepStartTime ? Date.now() - stepStartTime : null;

    if (isConditional) {
      // For conditionals: check if we're locked to a specific pair/role
      let match;
      if (condPairLock) {
        match = findBestMatch(selection, condPairLock.needRole, condPairLock.pairKey);
        if (!match) {
          // Wrong - they need to find the matching apodosis/protasis
          setFeedback({ ok: false, text: `Find the matching ${condPairLock.needRole} for this pair.` });
          logAttemptEvent({
            eventType: EVENT_TYPES.ANSWER_SUBMIT,
            mode: "grammar_quiz",
            skillId: getSkillForConstructionType(config.skillId),
            subskillId: SUBSKILLS.IDENTIFY,
            itemId: `${currentSentence.sid}|${config.quizId}|miss`,
            correct: false,
            latencyMs,
            revealed: showTranslation,
          });
          return;
        }
      } else {
        // Not locked - user can select any unfound protasis or apodosis
        match = findBestMatch(selection);
        if (!match) {
          setFeedback({ ok: false, text: "That doesn't match a protasis or apodosis." });
          logAttemptEvent({
            eventType: EVENT_TYPES.ANSWER_SUBMIT,
            mode: "grammar_quiz",
            skillId: getSkillForConstructionType(config.skillId),
            subskillId: SUBSKILLS.IDENTIFY,
            itemId: `${currentSentence.sid}|${config.quizId}|miss`,
            correct: false,
            latencyMs,
            revealed: showTranslation,
          });
          return;
        }
      }

      // Correct match!
      logAttemptEvent({
        eventType: EVENT_TYPES.ANSWER_SUBMIT,
        mode: "grammar_quiz",
        skillId: getSkillForConstructionType(match.type),
        subskillId: SUBSKILLS.IDENTIFY,
        itemId: `${currentSentence.sid}|${config.quizId}|${match.id}`,
        correct: true,
        latencyMs,
        revealed: showTranslation,
      });

      // Mark as found
      const newFoundIds = new Set([...foundIds, match.id]);
      setFoundIds(newFoundIds);

      const roleLabel = match.role === "protasis" ? "Protasis" : "Apodosis";

      // Check if this pair is now complete
      const pair = conditionalPairs.find(p => p.pairKey === match.pairKey);
      const protFound = pair?.protasis && newFoundIds.has(pair.protasis.id);
      const apoFound = pair?.apodosis && newFoundIds.has(pair.apodosis.id);

      if (protFound && apoFound) {
        // This pair is complete - go to classification
        setCondPairLock(null);

        // Check if there's a classify step
        const classifyStep = config?.steps?.find(s => s.type === "classify" || s.type === "self_check");
        if (classifyStep) {
          setMatchedTarget(match);
          setPhase("classify");
          setStepStartTime(Date.now());
          setPopover(null);
          setDrag({ active: false, start: null, end: null });
          setFeedback({ ok: true, text: `${roleLabel} correct! Pair complete. Now classify.` });
        } else {
          // No classify step - check if all pairs done
          const allPairsDone = conditionalPairs.every(p => {
            const pFound = p.protasis && newFoundIds.has(p.protasis.id);
            const aFound = p.apodosis && newFoundIds.has(p.apodosis.id);
            return pFound && aFound;
          });

          if (allPairsDone) {
            setLastResult({ identifyCorrect: true, classifyCorrect: null });
            setResults(prev => [...prev, { identifyCorrect: true, classifyCorrect: null }]);
            setPhase("feedback");
            setPopover(null);
            setDrag({ active: false, start: null, end: null });
          } else {
            // More pairs to find - continue identify phase
            setFeedback({ ok: true, text: `${roleLabel} correct! Pair complete. Now find the next pair.` });
            setPopover(null);
            setDrag({ active: false, start: null, end: null });
            setStepStartTime(Date.now());
          }
        }
      } else {
        // Pair not complete - lock user to find the other part
        const needRole = match.role === "protasis" ? "apodosis" : "protasis";
        setCondPairLock({ pairKey: match.pairKey, needRole });
        setFeedback({ ok: true, text: `${roleLabel} correct! Now find the matching ${needRole}.` });
        setPopover(null);
        setDrag({ active: false, start: null, end: null });
        setStepStartTime(Date.now());
      }
    } else {
      // Non-conditional
      const match = findBestMatch(selection);
      if (!match) {
        setFeedback({ ok: false, text: "That doesn't match the construction." });
        logAttemptEvent({
          eventType: EVENT_TYPES.ANSWER_SUBMIT,
          mode: "grammar_quiz",
          skillId: getSkillForConstructionType(config.skillId),
          subskillId: SUBSKILLS.IDENTIFY,
          itemId: `${currentSentence.sid}|${config.quizId}|miss`,
          correct: false,
          latencyMs,
          revealed: showTranslation,
        });
        return;
      }

      // Correct!
      logAttemptEvent({
        eventType: EVENT_TYPES.ANSWER_SUBMIT,
        mode: "grammar_quiz",
        skillId: getSkillForConstructionType(match.type),
        subskillId: SUBSKILLS.IDENTIFY,
        itemId: `${currentSentence.sid}|${config.quizId}|${match.id}`,
        correct: true,
        latencyMs,
        revealed: showTranslation,
      });

      const newFoundIds = new Set([...foundIds, match.id]);
      setFoundIds(newFoundIds);

      // Check for classify step
      const classifyStep = config?.steps?.find(s => s.type === "classify" || s.type === "self_check");
      if (classifyStep) {
        setMatchedTarget(match);
        setPhase("classify");
        setStepStartTime(Date.now());
        setPopover(null);
        setDrag({ active: false, start: null, end: null });
        setFeedback({ ok: true, text: "Correct! Now classify." });
      } else {
        // Check if all found
        if (newFoundIds.size >= targets.length) {
          setLastResult({ identifyCorrect: true, classifyCorrect: null });
          setResults(prev => [...prev, { identifyCorrect: true, classifyCorrect: null }]);
          setPhase("feedback");
          setPopover(null);
          setDrag({ active: false, start: null, end: null });
        } else {
          setFeedback({ ok: true, text: "Correct! Find the next one." });
          setPopover(null);
          setDrag({ active: false, start: null, end: null });
          setStepStartTime(Date.now());
        }
      }
    }
  }, [selection, isConditional, condPairLock, findBestMatch, foundIds, conditionalPairs, config, currentSentence, stepStartTime, showTranslation, targets.length]);

  // Handle reveal answer button
  const handleReveal = useCallback(() => {
    const latencyMs = stepStartTime ? Date.now() - stepStartTime : null;

    logAttemptEvent({
      eventType: EVENT_TYPES.ANSWER_SUBMIT,
      mode: "grammar_quiz",
      skillId: getSkillForConstructionType(config.skillId),
      subskillId: SUBSKILLS.IDENTIFY,
      itemId: `${currentSentence.sid}|${config.quizId}|revealed`,
      correct: false,
      latencyMs,
      revealed: true,
    });

    const allTargetIds = new Set(targets.map(t => t.id));
    setFoundIds(allTargetIds);
    setRevealed(true);
    setLastResult({ identifyCorrect: false, classifyCorrect: null, revealed: true });
    setResults(prev => [...prev, { identifyCorrect: false, classifyCorrect: null }]);
    setPhase("feedback");
    setPopover(null);
    setDrag({ active: false, start: null, end: null });
    setCondPairLock(null);
  }, [targets, config, currentSentence, stepStartTime]);

  // Handle classification submit
  const handleClassifySubmit = useCallback(() => {
    if (!classifyAnswer || !matchedTarget) return;

    const latencyMs = stepStartTime ? Date.now() - stepStartTime : null;

    let correctAnswer = null;
    if (currentStep?.getCorrectAnswer) {
      correctAnswer = currentStep.getCorrectAnswer(matchedTarget.construction, tokens);
    }

    const classifyCorrect = classifyAnswer === correctAnswer;
    const isSelfCheck = currentStep?.type === "self_check";

    if (!isSelfCheck) {
      logAttemptEvent({
        eventType: EVENT_TYPES.ANSWER_SUBMIT,
        mode: "grammar_quiz",
        skillId: getSkillForConstructionType(matchedTarget.type),
        subskillId: SUBSKILLS.CLASSIFY,
        itemId: `${currentSentence.sid}|${config.quizId}|${matchedTarget.id}|classify`,
        correct: classifyCorrect,
        latencyMs,
        revealed: showTranslation,
        expectedAnswer: correctAnswer,
        userAnswer: classifyAnswer,
      });
    }

    // Check if all targets/pairs found
    const allDone = isConditional
      ? conditionalPairs.every(p => foundIds.has(p.protasis?.id) && foundIds.has(p.apodosis?.id))
      : foundIds.size >= targets.length;

    if (allDone) {
      setLastResult({
        identifyCorrect: true,
        classifyCorrect: isSelfCheck ? null : classifyCorrect,
        selfCheck: isSelfCheck,
        correctAnswer,
      });
      setResults(prev => [...prev, {
        identifyCorrect: true,
        classifyCorrect: isSelfCheck ? null : classifyCorrect,
      }]);
      setPhase("feedback");
    } else {
      // More to find - go back to identify phase
      setMatchedTarget(null);
      setClassifyAnswer(null);
      setPopover(null);
      setDrag({ active: false, start: null, end: null });
      setPhase("identify");
      setStepStartTime(Date.now());

      if (!isSelfCheck && !classifyCorrect) {
        setFeedback({ ok: false, text: `Classification incorrect (was: ${correctAnswer}). Now find the next pair.` });
      } else {
        setFeedback({ ok: true, text: "Correct! Now find the next pair." });
      }
    }
  }, [classifyAnswer, matchedTarget, currentStep, config, currentSentence, tokens, stepStartTime, showTranslation, isConditional, conditionalPairs, foundIds, targets.length]);

  // Handle next button
  const handleNext = useCallback(() => {
    if (currentIndex >= sentences.length - 1) {
      setPhase("complete");
    } else {
      setCurrentIndex(prev => prev + 1);
      setDrag({ active: false, start: null, end: null });
      setFoundIds(new Set());
      setCondPairLock(null);
      setMatchedTarget(null);
      setClassifyAnswer(null);
      setShowTranslation(false);
      setRevealed(false);
      setLastResult(null);
      setFeedback(null);
      setPopover(null);
      setPhase("identify");
      setStepStartTime(Date.now());
    }
  }, [currentIndex, sentences.length]);

  // Reset quiz
  const handleRetry = useCallback(() => {
    setCurrentIndex(0);
    setDrag({ active: false, start: null, end: null });
    setFoundIds(new Set());
    setCondPairLock(null);
    setMatchedTarget(null);
    setClassifyAnswer(null);
    setResults([]);
    setLastResult(null);
    setShowTranslation(false);
    setRevealed(false);
    setFeedback(null);
    setPopover(null);
    setPhase("loading");
  }, []);

  // Calculate final score
  const finalScore = useMemo(() => {
    if (!results.length) return null;

    let totalPoints = 0;
    let maxPoints = 0;

    for (const r of results) {
      maxPoints += 1;
      if (r.identifyCorrect) totalPoints += 1;

      if (r.classifyCorrect !== null && r.classifyCorrect !== undefined) {
        maxPoints += 1;
        if (r.classifyCorrect) totalPoints += 1;
      }
    }

    const score = maxPoints > 0 ? totalPoints / maxPoints : 0;
    const passed = score >= (config?.passingThreshold || 0.6);

    return { score, totalPoints, maxPoints, passed };
  }, [results, config]);

  // Prompt text for identification phase
  const promptText = useMemo(() => {
    if (phase !== "identify") return "";

    if (isConditional) {
      if (condPairLock) {
        return `Now find the matching ${condPairLock.needRole === "protasis" ? "protasis (if-clause)" : "apodosis (then-clause)"}.`;
      }
      return "Select a protasis (if-clause) or apodosis (then-clause).";
    }

    return currentStep?.prompt || "Select the construction in the sentence.";
  }, [phase, isConditional, condPairLock, currentStep]);

  // Instance info (only show when > 1)
  const instanceInfo = useMemo(() => {
    if (phase !== "identify") return null;

    if (isConditional) {
      if (conditionalPairs.length > 1) {
        return {
          text: `This sentence has ${conditionalPairs.length} conditional pairs.`,
          progress: completedPairCount > 0 ? `(${completedPairCount} of ${conditionalPairs.length} complete)` : null,
        };
      }
      return null;
    }

    if (targets.length > 1) {
      const foundCount = foundIds.size;
      return {
        text: `This sentence has ${targets.length} ${config?.constructionLabel || "instance"}${targets.length > 1 ? "s" : ""} to find.`,
        progress: foundCount > 0 ? `(${foundCount} of ${targets.length} found)` : null,
      };
    }

    return null;
  }, [phase, isConditional, conditionalPairs, completedPairCount, targets.length, foundIds.size, config]);

  if (!config) {
    return <div style={{ color: "#666", fontSize: 14 }}>No quiz configured for this lesson.</div>;
  }

  if (error) {
    return <div style={{ color: "#d32f2f", fontSize: 14 }}>{error}</div>;
  }

  if (phase === "loading") {
    return <div style={{ color: "#666", fontSize: 14 }}>Loading quiz...</div>;
  }

  if (phase === "complete") {
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {finalScore?.passed ? "Pass" : "Try Again"}
        </div>
        <div style={{ fontSize: 18, color: "#555", marginBottom: 8 }}>
          Score: {Math.round((finalScore?.score || 0) * 100)}%
        </div>
        <div style={{ fontSize: 14, color: "#777", marginBottom: 20 }}>
          {finalScore?.totalPoints} / {finalScore?.maxPoints} points
          {!finalScore?.passed && " (60% needed to pass)"}
        </div>
        <button
          onClick={handleRetry}
          style={{
            padding: "10px 24px",
            fontSize: 14,
            background: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Instruction */}
      {config.instruction && (
        <div style={{
          fontSize: 14,
          color: "#555",
          marginBottom: 16,
          padding: "12px 14px",
          background: "#f0f7ff",
          borderRadius: 8,
          borderLeft: "4px solid #1976d2",
          lineHeight: 1.5,
        }}>
          {config.instruction}
        </div>
      )}

      {/* Progress */}
      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        Question {currentIndex + 1} of {config.sentenceCount}
      </div>

      {/* Instance info (only when > 1) */}
      {phase === "identify" && instanceInfo && (
        <div style={{
          fontSize: 13,
          color: "#1976d2",
          fontWeight: 600,
          marginBottom: 12,
          padding: "8px 12px",
          background: "#e3f2fd",
          borderRadius: 6,
        }}>
          {instanceInfo.text}
          {instanceInfo.progress && (
            <span style={{ marginLeft: 8, color: "#2e7d32" }}>
              {instanceInfo.progress}
            </span>
          )}
        </div>
      )}

      {/* Pair lock indicator */}
      {phase === "identify" && condPairLock && (
        <div style={{
          fontSize: 13,
          color: "#e65100",
          fontWeight: 600,
          marginBottom: 12,
          padding: "8px 12px",
          background: "#fff3e0",
          borderRadius: 6,
        }}>
          Find the matching {condPairLock.needRole} to complete this pair.
        </div>
      )}

      {/* Feedback message (persistent) */}
      {phase === "identify" && feedback && !popover && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 12,
          borderRadius: 8,
          background: feedback.ok ? "#e8f5e9" : "#fff3e0",
          border: `1px solid ${feedback.ok ? "#81c784" : "#ffb74d"}`,
          fontSize: 14,
          fontWeight: 500,
          color: feedback.ok ? "#2e7d32" : "#e65100",
        }}>
          {feedback.text}
        </div>
      )}

      {/* Sentence display */}
      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          background: "#fafafa",
          position: "relative",
        }}
      >
        <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
          DBG1 {currentSentence?.sid}
        </div>

        <QuizSentence
          sentence={currentSentence}
          selectedSpan={selection}
          onTokenMouseDown={handleTokenMouseDown}
          onTokenMouseEnter={handleTokenMouseEnter}
          registerTokenRef={registerTokenRef}
          showCorrect={phase === "feedback"}
          correctSpans={correctSpans}
          foundSpans={foundSpans}
          disabled={phase === "feedback" || phase === "classify"}
          isConditional={isConditional}
        />

        {/* Translation toggle */}
        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {showTranslation ? "Hide Translation" : "Reveal Translation"}
          </button>
          {showTranslation && (
            <div style={{ marginTop: 10, fontSize: 14, color: "#444", fontStyle: "italic" }}>
              {currentSentence?.translation || "No translation available"}
            </div>
          )}
        </div>
      </div>

      {/* Popover for identification */}
      {phase === "identify" && popover && selection && (
        <div
          style={{
            position: "fixed",
            left: popover.x,
            top: popover.y,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: 16,
            zIndex: 1000,
            minWidth: 280,
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            {promptText}
          </div>

          {feedback && (
            <div style={{
              padding: "8px 12px",
              marginBottom: 12,
              borderRadius: 6,
              background: feedback.ok ? "#e8f5e9" : "#ffebee",
              fontSize: 13,
              color: feedback.ok ? "#2e7d32" : "#c62828",
            }}>
              {feedback.text}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSubmit}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                background: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Submit
            </button>
            <button
              onClick={cancelSelection}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleReveal}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                background: "#fff3e0",
                color: "#e65100",
                border: "1px solid #ffb74d",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Reveal Answer
            </button>
          </div>
        </div>
      )}

      {/* Classification phase UI */}
      {phase === "classify" && currentStep && (
        <div>
          <p style={{ fontSize: 14, color: "#333", marginBottom: 12 }}>
            {currentStep.prompt}
          </p>
          {currentStep.options && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {currentStep.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setClassifyAnswer(opt.value)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    background: classifyAnswer === opt.value ? "#1976d2" : "#fff",
                    color: classifyAnswer === opt.value ? "#fff" : "#333",
                    border: classifyAnswer === opt.value ? "1px solid #1976d2" : "1px solid #ccc",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {config.classifyNote && (
            <p style={{ fontSize: 12, color: "#666", marginBottom: 12, fontStyle: "italic" }}>
              {config.classifyNote}
            </p>
          )}
          <button
            onClick={handleClassifySubmit}
            disabled={!classifyAnswer}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              background: classifyAnswer ? "#1976d2" : "#ccc",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: classifyAnswer ? "pointer" : "not-allowed",
            }}
          >
            Check
          </button>
        </div>
      )}

      {/* Feedback phase */}
      {phase === "feedback" && lastResult && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: (lastResult.identifyCorrect && (lastResult.classifyCorrect === null || lastResult.classifyCorrect === true || lastResult.selfCheck)) ? "#e8f5e9" : "#ffebee",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {lastResult.revealed
              ? "Answer revealed."
              : !lastResult.identifyCorrect
                ? "Not quite right."
                : lastResult.classifyCorrect === false && !lastResult.selfCheck
                  ? "Incorrect"
                  : "All constructions found!"}
          </div>

          {lastResult.classifyCorrect !== null && !lastResult.selfCheck && (
            <div style={{ fontSize: 14, color: "#555" }}>
              Classification: {lastResult.classifyCorrect ? "Correct" : `Incorrect (was: ${lastResult.correctAnswer})`}
              {!lastResult.classifyCorrect && (
                <div style={{ marginTop: 4, fontSize: 13, fontStyle: "italic" }}>
                  You identified the construction correctly, but misclassified the type.
                </div>
              )}
            </div>
          )}

          {lastResult.selfCheck && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 8,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#0369a1" }}>
                Check your understanding:
              </div>
              <p style={{ fontSize: 14, color: "#075985", margin: 0 }}>
                Compare your answer with the translation above.
                {lastResult.correctAnswer && (
                  <span> The most likely type is: <strong>{lastResult.correctAnswer}</strong></span>
                )}
              </p>
            </div>
          )}

          <button
            onClick={handleNext}
            style={{
              marginTop: 12,
              padding: "8px 20px",
              fontSize: 14,
              background: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {currentIndex >= sentences.length - 1 ? "See Results" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
