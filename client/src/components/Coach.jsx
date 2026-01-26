// client/src/components/Coach.jsx
// Phase 6: Coach overlay UI - controlled feedback without a chatbot

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCoachIntervention,
  shouldShowCoach,
  resetCoachCooldown,
  TRIGGER_TYPES,
} from "../lib/coachTriggers";
import { ACTION_CONFIG } from "../lib/adaptiveFeedback";

// ============================================================================
// COACH HOOK
// ============================================================================

/**
 * Hook to manage Coach state and trigger detection.
 */
export function useCoach(studentId, options = {}) {
  const {
    skillId,
    subskillId,
    enabled = true,
    onAction,
  } = options;

  const [intervention, setIntervention] = useState(null);
  const [visible, setVisible] = useState(false);
  const [sessionEvents, setSessionEvents] = useState([]);
  const [sessionStats, setSessionStats] = useState({ attempts: 0, correct: 0 });

  // Track events in session
  const recordEvent = useCallback((event) => {
    setSessionEvents((prev) => [event, ...prev].slice(0, 50));
    setSessionStats((prev) => ({
      attempts: prev.attempts + 1,
      correct: prev.correct + (event.correct ? 1 : 0),
    }));
  }, []);

  // Check for intervention after each event
  const checkIntervention = useCallback(
    (lastEvent, context = {}) => {
      if (!enabled || !studentId) return;

      const intervention = getCoachIntervention(studentId, {
        lastEvent,
        recentEvents: sessionEvents.slice(0, 5),
        sessionEvents,
        skillId,
        subskillId,
        attemptsThisSession: sessionStats.attempts,
        correctThisSession: sessionStats.correct,
        ...context,
      });

      if (intervention && shouldShowCoach(intervention)) {
        setIntervention(intervention);
        setVisible(true);
      }
    },
    [enabled, studentId, sessionEvents, skillId, subskillId, sessionStats]
  );

  // Dismiss coach
  const dismiss = useCallback(() => {
    setVisible(false);
    resetCoachCooldown();
    // Clear intervention after animation
    setTimeout(() => setIntervention(null), 300);
  }, []);

  // Handle action click
  const handleAction = useCallback(() => {
    if (intervention?.action && onAction) {
      onAction(intervention.action);
    }
    dismiss();
  }, [intervention, onAction, dismiss]);

  // Check for set complete
  const checkSetComplete = useCallback(() => {
    checkIntervention(null, { setComplete: true });
  }, [checkIntervention]);

  // Check for session end
  const checkSessionEnd = useCallback(() => {
    checkIntervention(null, { sessionEnding: true });
  }, [checkIntervention]);

  // Reset session
  const resetSession = useCallback(() => {
    setSessionEvents([]);
    setSessionStats({ attempts: 0, correct: 0 });
  }, []);

  return {
    intervention,
    visible,
    recordEvent,
    checkIntervention,
    checkSetComplete,
    checkSessionEnd,
    dismiss,
    handleAction,
    resetSession,
    sessionStats,
  };
}

// ============================================================================
// COACH OVERLAY COMPONENT
// ============================================================================

/**
 * Coach overlay - appears as a subtle card, not a modal.
 */
export function CoachOverlay({
  intervention,
  visible,
  onDismiss,
  onAction,
  position = "bottom-right",
}) {
  const navigate = useNavigate();

  if (!intervention || !visible) return null;

  // Determine styling based on trigger type
  const isPositive = [
    TRIGGER_TYPES.MOMENTUM,
    TRIGGER_TYPES.MASTERY_ACHIEVED,
    TRIGGER_TYPES.SET_COMPLETE,
  ].includes(intervention.type);

  const isWarning = [
    TRIGGER_TYPES.REPEATED_ERROR,
    TRIGGER_TYPES.HINT_DEPENDENCY,
    TRIGGER_TYPES.GUESSING_DETECTED,
    TRIGGER_TYPES.MISCONCEPTION,
  ].includes(intervention.type);

  const bgColor = isPositive
    ? "from-green-500 to-emerald-600"
    : isWarning
    ? "from-amber-500 to-orange-600"
    : "from-indigo-500 to-purple-600";

  const positionClasses = {
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-right": "top-20 right-4",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  };

  // Handle action with navigation
  const handleActionClick = () => {
    if (intervention.action) {
      const { type, skillId, subskillId, setSize } = intervention.action;

      // Build practice URL
      const params = new URLSearchParams();
      if (skillId) {
        const mode = skillId.replace("grammar:", "").replace("vocab:", "");
        params.set("mode", mode);
      }
      params.set("action", type);
      if (subskillId) params.set("subskill", subskillId);
      if (setSize) params.set("setSize", String(setSize));

      // Navigate to practice page
      if (skillId?.startsWith("grammar:")) {
        navigate(`/grammar-practice?${params.toString()}`);
      } else if (skillId?.startsWith("vocab:")) {
        navigate(`/CaesarDBG1?${params.toString()}`);
      }
    }

    if (onAction) onAction();
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 max-w-sm animate-slide-up`}
      role="dialog"
      aria-label="Coach suggestion"
    >
      <div
        className={`bg-gradient-to-r ${bgColor} text-white rounded-xl shadow-2xl overflow-hidden`}
      >
        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-4">
          {/* Coach icon and message */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <CoachIcon type={intervention.type} />
            </div>
            <div className="flex-1 pr-6">
              <p className="font-semibold text-lg leading-tight">
                {intervention.message}
              </p>
            </div>
          </div>

          {/* Reason (the "why") */}
          <p className="text-white/80 text-sm mb-4 pl-11">
            {intervention.reason}
          </p>

          {/* Action button */}
          {intervention.action && (
            <button
              onClick={handleActionClick}
              className="w-full py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
            >
              {intervention.action.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COACH ICON
// ============================================================================

function CoachIcon({ type }) {
  // Different icons for different trigger types
  const icons = {
    [TRIGGER_TYPES.REPEATED_ERROR]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
    [TRIGGER_TYPES.MOMENTUM]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    ),
    [TRIGGER_TYPES.MASTERY_ACHIEVED]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    ),
    [TRIGGER_TYPES.SET_COMPLETE]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    ),
    [TRIGGER_TYPES.HINT_DEPENDENCY]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    ),
    [TRIGGER_TYPES.GUESSING_DETECTED]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    [TRIGGER_TYPES.STAGNATING]: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    ),
    default: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
  };

  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icons[type] || icons.default}
    </svg>
  );
}

// ============================================================================
// INLINE COACH TIP
// ============================================================================

/**
 * Smaller inline tip for embedding in practice UI.
 */
export function CoachTip({ message, reason, onDismiss }) {
  if (!message) return null;

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-start gap-3">
      <div className="p-1.5 bg-indigo-100 rounded">
        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="font-medium text-indigo-900 text-sm">{message}</p>
        {reason && <p className="text-indigo-600 text-xs mt-0.5">{reason}</p>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-indigo-400 hover:text-indigo-600"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default CoachOverlay;
