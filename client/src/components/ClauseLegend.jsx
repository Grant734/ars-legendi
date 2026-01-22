// client/src/components/ClauseLegend.jsx
// Phase 9: Enhanced with boundary indicators and structured tooltips

import React from "react";
import { BOUNDARY_INDICATORS, getConstructionTooltip } from "../lib/constructionTooltips";

// One palette for:
// - progress pills
// - token highlights (reveal + found)
// Colors now matched to CaesarSentence.jsx typeColors() for consistency
export const CLAUSE_STYLES = {
  cum_clause: {
    label: "Cum clause",
    border: "#9fe3a6",
    revealBg: "#dcffe0",
    foundBg: "#c8f0c8",
  },
  abl_abs: {
    label: "Ablative absolute",
    border: "#ffb3b3",
    revealBg: "#ffe0e0",
    foundBg: "#ffcaca",
  },
  indirect_statement: {
    label: "Indirect statement",
    border: "#9cc8ff",
    revealBg: "#dbeeff",
    foundBg: "#c8dfff",
  },
  purpose_clause: {
    label: "Purpose clause",
    border: "#f97316",
    revealBg: "#ffedd5",
    foundBg: "#fed7aa",
  },
  result_clause: {
    label: "Result clause",
    border: "#ef4444",
    revealBg: "#fee2e2",
    foundBg: "#fecaca",
  },
  relative_clause: {
    label: "Relative clause",
    border: "#b7adff",
    revealBg: "#e3deff",
    foundBg: "#d0c8ff",
  },
  gerund: {
    label: "Gerund",
    border: "#10b981",
    revealBg: "#d1fae5",
    foundBg: "#a7f3d0",
  },
  gerundive: {
    label: "Gerundive",
    border: "#f59e0b",
    revealBg: "#fef3c7",
    foundBg: "#fde68a",
  },
  gerund_gerundive_flip: {
    label: "Gerund ↔ Gerundive flip",
    border: "#f2a6dd",
    revealBg: "#ffe1f6",
    foundBg: "#ffd0ee",
  },

  // conditionals are internal types; used for highlights + top progress
  conditional_protasis: {
    label: "Protasis",
    border: "#60a5fa",
    revealBg: "#dbeafe",
    foundBg: "#bfdbfe",
  },
  conditional_apodosis: {
    label: "Apodosis",
    border: "#818cf8",
    revealBg: "#e0e7ff",
    foundBg: "#c7d2fe",
  },
};

export function styleForType(type) {
  const base = CLAUSE_STYLES[type] || {
    label: type,
    border: "#999",
    revealBg: "#f3f4f6",
    foundBg: "#e5e7eb",
  };
  // Merge boundary indicators if available
  const boundary = BOUNDARY_INDICATORS[type] || { start: "[", end: "]" };
  return { ...base, boundary };
}

/**
 * Get boundary indicator for a construction type.
 * Used to show visual start/end markers.
 */
export function getBoundaryIndicator(type) {
  return BOUNDARY_INDICATORS[type] || { start: "[", end: "]", color: "gray" };
}

export function ClausePill({ type, children }) {
  const s = styleForType(type);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${s.border}`,
        background: s.revealBg,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
      title={s.label}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: s.border,
          display: "inline-block",
        }}
      />
      {children || s.label}
    </span>
  );
}

export default function ClauseLegend({ types }) {
  const list = Array.isArray(types) ? types : Object.keys(CLAUSE_STYLES);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((t) => (
        <ClausePill key={t} type={t} />
      ))}
    </div>
  );
}

/**
 * ConstructionTooltip: Shows structured help for a construction type.
 * Includes misconception-aware clarifications when available.
 */
export function ConstructionTooltip({ type, studentId }) {
  const tooltip = getConstructionTooltip(type, { studentId });

  if (!tooltip.name) return null;

  const style = styleForType(type);
  const boundary = getBoundaryIndicator(type);

  return (
    <div
      style={{
        background: "#fff",
        border: `2px solid ${style.border}`,
        borderRadius: 12,
        padding: 16,
        maxWidth: 400,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header with name and boundary indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            background: style.revealBg,
            border: `1px solid ${style.border}`,
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {boundary.start}...{boundary.end}
        </span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{tooltip.name}</span>
      </div>

      {/* Brief description */}
      <p style={{ fontSize: 13, marginBottom: 10, color: "#333" }}>{tooltip.brief}</p>

      {/* Identification tips */}
      {tooltip.identification?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>
            HOW TO IDENTIFY:
          </div>
          <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18, color: "#444" }}>
            {tooltip.identification.map((tip, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Signal words */}
      {tooltip.signals?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>
            SIGNALS:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tooltip.signals.map((sig, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  background: "#f0f0f0",
                  borderRadius: 4,
                  padding: "2px 6px",
                }}
              >
                {sig}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Example */}
      {tooltip.example && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>
            EXAMPLE:
          </div>
          <div
            style={{
              fontSize: 12,
              fontStyle: "italic",
              background: style.revealBg,
              borderRadius: 6,
              padding: 8,
              borderLeft: `3px solid ${style.border}`,
            }}
          >
            {tooltip.example}
          </div>
        </div>
      )}

      {/* Misconception note (if student has relevant confusion) */}
      {tooltip.misconceptionNote && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            padding: 10,
            marginTop: 10,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
            WATCH OUT:
          </div>
          <p style={{ fontSize: 12, margin: 0, color: "#78350f" }}>
            {tooltip.misconceptionNote.clarification}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * BoundaryMarker: Visual indicator for construction boundaries.
 * Use at start or end of a construction span.
 */
export function BoundaryMarker({ type, position = "start" }) {
  const boundary = getBoundaryIndicator(type);
  const style = styleForType(type);

  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "monospace",
        fontWeight: 700,
        color: style.border,
        opacity: 0.8,
        verticalAlign: "super",
        marginLeft: position === "end" ? 1 : 0,
        marginRight: position === "start" ? 1 : 0,
      }}
    >
      {position === "start" ? boundary.start : boundary.end}
    </span>
  );
}
