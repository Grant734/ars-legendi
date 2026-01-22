// QuizSentence.jsx - Interactive sentence component for grammar quizzes
// Supports drag-to-select with token refs for popover positioning

import { useState, useCallback, useEffect } from "react";

function isPunctToken(t) {
  if (!t) return false;
  if (t.upos === "PUNCT") return true;
  const s = t.text || "";
  return s.length === 1 && /[.,;:!?]/.test(s);
}

function isOpeningPunct(prev) {
  if (!prev) return false;
  return prev.text === "(" || prev.text === "[" || prev.text === "\u201C" || prev.text === '"';
}

function isClosingPunct(cur) {
  if (!cur) return false;
  return cur.text === ")" || cur.text === "]" || cur.text === "\u201D" || cur.text === '"';
}

function renderTokenWithSpacing(tokens, i) {
  const t = tokens[i];
  const prev = i > 0 ? tokens[i - 1] : null;

  const curIsPunct = isPunctToken(t);
  const prevIsOpening = isOpeningPunct(prev);
  const curIsClosing = isClosingPunct(t);

  let leadingSpace = i === 0 ? "" : " ";
  if (curIsPunct || curIsClosing) leadingSpace = "";
  if (prevIsOpening) leadingSpace = "";

  return leadingSpace + (t.text || "");
}

// Check if a token index is within a span
function isInSpan(idx, span) {
  if (!span) return false;
  return idx >= span.start && idx <= span.end;
}

// Check if a token index is within any of the spans (array of [start, end])
function isInAnySpan(idx, spans) {
  if (!spans || !spans.length) return false;
  return spans.some((span) => idx >= span[0] && idx <= span[1]);
}

// Colors
const SELECTION_COLOR = { bg: "#bbdefb", border: "#2196f3" }; // Blue for current selection
const FOUND_COLOR = { bg: "#c8e6c9", border: "#4caf50" }; // Green for found
const CORRECT_COLOR = { bg: "#dcffe0", border: "#4caf50" }; // Light green for correct (in feedback)

export default function QuizSentence({
  sentence,
  selectedSpan,        // { start, end } for current selection
  onTokenMouseDown,
  onTokenMouseEnter,
  registerTokenRef,    // Callback to register token element refs
  showCorrect,         // Show correct answer highlighting (feedback phase)
  correctSpans,        // Array of [start, end] for correct answers (unfound)
  foundSpans,          // Array of [start, end] for found targets
  disabled,            // Disable interaction
  isConditional = false,
}) {
  const tokens = sentence?.tokens || [];
  const [isDragging, setIsDragging] = useState(false);

  // Use document-level mouseup to handle multi-line selection
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleMouseDown = useCallback(
    (idx) => {
      if (disabled) return;
      setIsDragging(true);
      onTokenMouseDown?.(idx);
    },
    [disabled, onTokenMouseDown]
  );

  const handleMouseEnter = useCallback(
    (idx) => {
      if (disabled || !isDragging) return;
      onTokenMouseEnter?.(idx);
    },
    [disabled, isDragging, onTokenMouseEnter]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      style={{
        fontSize: 17,
        lineHeight: 1.8,
        userSelect: "none",
        padding: "12px 0",
      }}
      onMouseUp={handleMouseUp}
    >
      {tokens.map((token, idx) => {
        const isSelected = isInSpan(idx, selectedSpan);
        const isFound = isInAnySpan(idx, foundSpans);
        const isCorrect = showCorrect && isInAnySpan(idx, correctSpans);

        // Determine styling
        let backgroundColor = "transparent";
        let borderBottom = "none";
        let color = "#222";

        // Priority: found > selected > correct (in feedback)
        if (isFound) {
          backgroundColor = FOUND_COLOR.bg;
          borderBottom = `2px solid ${FOUND_COLOR.border}`;
        } else if (isSelected) {
          backgroundColor = SELECTION_COLOR.bg;
          borderBottom = `2px solid ${SELECTION_COLOR.border}`;
        } else if (isCorrect) {
          // Show unfound correct spans in feedback phase
          backgroundColor = CORRECT_COLOR.bg;
          borderBottom = `2px solid ${CORRECT_COLOR.border}`;
        }

        const isPunct = isPunctToken(token);

        return (
          <span
            key={idx}
            ref={(el) => registerTokenRef?.(idx, el)}
            onMouseDown={() => handleMouseDown(idx)}
            onMouseEnter={() => handleMouseEnter(idx)}
            style={{
              backgroundColor,
              borderBottom,
              color,
              padding: isPunct ? "0" : "2px 0",
              borderRadius: 3,
              cursor: disabled ? "default" : "pointer",
              transition: "background-color 0.15s",
              position: "relative",
            }}
          >
            {renderTokenWithSpacing(tokens, idx)}
          </span>
        );
      })}
    </div>
  );
}
