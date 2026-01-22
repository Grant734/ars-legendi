// src/components/CaesarSentence.jsx
import { useMemo, useState } from "react";
import WordInspector from "./WordInspector";

function isPunctToken(t) {
  if (!t) return false;
  if (t.upos === "PUNCT") return true;
  const s = t.text || "";
  return s.length === 1 && /[.,;:!?]/.test(s);
}

function isOpeningPunct(prev) {
  if (!prev) return false;
  return prev.text === "(" || prev.text === "[" || prev.text === "“" || prev.text === '"';
}

function isClosingPunct(cur) {
  if (!cur) return false;
  return cur.text === ")" || cur.text === "]" || cur.text === "”" || cur.text === '"';
}

// Creates nice spacing: no space before punctuation, normal space between words.
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

function humanizeConditionalLabel(label) {
  if (!label) return "Mixed/Unclassified";
  const map = {
    simple_present: "Simple Present",
    future_more_vivid: "Future More Vivid",
    simple_past: "Simple Past",

    future_less_vivid: "Future Less Vivid",
    present_contrafactual: "Present Contrary-to-Fact",
    past_contrafactual: "Past Contrary-to-Fact",

    mixed_indicative: "Mixed Indicative",
    mixed_subjunctive: "Mixed Subjunctive",
    mixed: "Mixed",

    indicative_equivalent_indirect_primary: "Indicative Equivalent (Indirect, Primary)",
    indicative_equivalent_indirect_secondary: "Indicative Equivalent (Indirect, Secondary)",
  };
  return map[label] || label;
}

function purposeShort(subtype) {
  if (!subtype) return "Purpose";
  if (subtype === "ut_ne") return "Purpose (ut/ne)";
  if (subtype === "ad_gerund") return "Purpose (ad + gerund)";
  if (subtype === "ad_noun_gerundive") return "Purpose (ad + gerundive)";
  if (subtype === "qui_subj") return "Rel. Purpose (qui + subj.)";
  return `Purpose (${subtype})`;
}

function relativeShort(subtype) {
  if (!subtype) return "Relative";
  if (subtype === "indicative") return "Relative (Indic.)";
  if (subtype === "subjunctive") return "Relative (Subj.)";
  return `Relative (${subtype})`;
}

function flipShort(subtype) {
  if (!subtype) return "Gerund↔Gerundive";
  if (subtype === "gerund_form_with_object") return "Gerund↔Gerundive (gerund+obj)";
  if (subtype === "gerundive_form_ad_phrase") return "Gerund↔Gerundive (ad+gerundive)";
  return `Gerund↔Gerundive (${subtype})`;
}

// One consistent palette for BOTH badge + highlight.
// Distinct colors: protasis/apodosis, gerund/gerundive, purpose/result all different
function typeColors(type) {
  if (type === "abl_abs") return { bg: "#fff0f0", border: "#ffb3b3", ink: "#7a1f1f", tokenBg: "#ffe0e0" };
  if (type === "indirect_statement") return { bg: "#eef6ff", border: "#9cc8ff", ink: "#143a66", tokenBg: "#dbeeff" };
  if (type === "cum_clause") return { bg: "#f2fff3", border: "#9fe3a6", ink: "#1f5e2a", tokenBg: "#dcffe0" };

  if (type === "purpose_clause") return { bg: "#fff7ed", border: "#f97316", ink: "#9a3412", tokenBg: "#ffedd5" };
  if (type === "result_clause") return { bg: "#fef2f2", border: "#ef4444", ink: "#991b1b", tokenBg: "#fee2e2" };
  if (type === "relative_clause") return { bg: "#f2f0ff", border: "#b7adff", ink: "#2f2a7a", tokenBg: "#e3deff" };

  if (type === "conditional_protasis") return { bg: "#eff6ff", border: "#60a5fa", ink: "#1e40af", tokenBg: "#dbeafe" };
  if (type === "conditional_apodosis") return { bg: "#eef2ff", border: "#818cf8", ink: "#3730a3", tokenBg: "#e0e7ff" };

  if (type === "gerund") return { bg: "#ecfdf5", border: "#10b981", ink: "#065f46", tokenBg: "#d1fae5" };
  if (type === "gerundive") return { bg: "#fffbeb", border: "#f59e0b", ink: "#92400e", tokenBg: "#fef3c7" };
  if (type === "gerund_gerundive_flip") return { bg: "#fff0fb", border: "#f2a6dd", ink: "#6a1e55", tokenBg: "#ffe1f6" };

  return { bg: "#f7f7f7", border: "#ccc", ink: "#333", tokenBg: "#eee" };
}

function displayForConstruction(c) {
  const type = c?.type || "other";
  const subtype = c?.subtype || null;

  // Badge key decides grouping at top (so subtypes show distinctly)
  let badgeKey = type;
  let badgeText = type;

  if (type === "abl_abs") {
    badgeText = "Abl. Abs.";
  } else if (type === "indirect_statement") {
    badgeText = "Acc + Inf";
  } else if (type === "cum_clause") {
    badgeText = "Cum";
  } else if (type === "purpose_clause") {
    badgeKey = `purpose_clause:${subtype || "default"}`;
    badgeText = purposeShort(subtype);
  } else if (type === "relative_clause") {
    badgeKey = `relative_clause:${subtype || "default"}`;
    badgeText = relativeShort(subtype);
  } else if (type === "conditional_protasis" || type === "conditional_apodosis") {
    const cond = c?.conditional || {};

    const label = cond.label || "mixed";
    const discourse =
      typeof cond.discourse === "string"
        ? cond.discourse
        : (cond.statement || "direct");

    const discoursePretty = String(discourse)
      .replace("indirect_", "indirect ")
      .replaceAll("_", " ");

    const seqStr = cond.sequence ? `, ${cond.sequence} sequence` : "";
    const part = type === "conditional_protasis" ? "Protasis" : "Apodosis";

    badgeKey = `${type}:${label}:${discourse}:${cond.sequence || "none"}`;
    badgeText = `${part}: ${humanizeConditionalLabel(label)} (${discoursePretty}${seqStr})`;
  }

   else if (type === "gerund") {
    badgeText = "Gerund";
  } else if (type === "gerundive") {
    badgeText = "Gerundive";
  } else if (type === "gerund_gerundive_flip") {
    badgeKey = `gerund_gerundive_flip:${subtype || "default"}`;
    badgeText = flipShort(subtype);
  }

  return { type, subtype, badgeKey, badgeText };
}

// If a token is in multiple constructions, choose a stable priority so color doesn’t flicker.
function pickConstruction(displays) {
  const types = displays.map((d) => d.type);
  const order = [
    "conditional_protasis",
    "conditional_apodosis",
    "purpose_clause",
    "relative_clause",
    "indirect_statement",
    "cum_clause",
    "abl_abs",
    "gerund_gerundive_flip",
    "gerundive",
    "gerund",
  ];
  for (const t of order) {
    const idx = types.indexOf(t);
    if (idx !== -1) return displays[idx];
  }
  return displays[0] || null;
}

export default function CaesarSentence({
  sentence, // { sid, tokens, translation, constructions, ... }
  tokens, // optional override
  translation, // optional override
  constructions, // optional override
  onTokenClick, // optional: function(token, context)
  selectedTokenId, // optional: externally selected token id

  // additive
  highlightTokenIndex, // optional: number (0-based token index) to highlight the example form

  // additive (lets you avoid duplicate "keys" later)
  showBadges = true,

  // inline mode: renders as inline span without translation/inspector for continuous text display
  inline = false,
}) {
  const tks = tokens || (sentence && sentence.tokens) || [];
  const eng = translation !== undefined ? (translation ?? "") : ((sentence && sentence.translation) ?? "");

  const cons = constructions || (sentence && sentence.constructions) || [];

  const [selected, setSelected] = useState(null); // { token, tokenIndex }

  // tokenIndex -> array of display objects for constructions it belongs to
  const tokenSpanMeta = useMemo(() => {
    const m = {};

    function addDisplayAt(idx, displayObj) {
      if (!m[idx]) m[idx] = [];
      m[idx].push(displayObj);
    }

    for (const c of cons) {
      const d = displayForConstruction(c);
      const type = c.type || "other";

      // If highlight_spans exist, highlight ONLY those tokens (introducer + verb, etc.)
      if (Array.isArray(c.highlight_spans) && c.highlight_spans.length > 0) {
        for (const pair of c.highlight_spans) {
          if (!Array.isArray(pair) || pair.length !== 2) continue;
          const s = Number(pair[0]);
          const e = Number(pair[1]);
          if (Number.isNaN(s) || Number.isNaN(e)) continue;
          const lo = Math.min(s, e);
          const hi = Math.max(s, e);
          for (let i = lo; i <= hi; i++) addDisplayAt(i, d);
        }
        continue;
      }

      // Fallback: highlight full span start..end
      const start = Number(c.start);
      const end = Number(c.end);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let i = lo; i <= hi; i++) addDisplayAt(i, d);
    }

    return m;
  }, [cons]);

  // Badges: group by badgeKey (so subtypes show distinctly)
  const badges = useMemo(() => {
    const byKey = {};
    for (const c of cons) {
      const d = displayForConstruction(c);
      const k = d.badgeKey;
      if (!byKey[k]) byKey[k] = { display: d, arr: [] };
      byKey[k].arr.push(c);
    }

    return Object.values(byKey).map(({ display, arr }) => {
      const best = arr.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a), arr[0]);
      return { display, count: arr.length, best };
    });
  }, [cons]);

  // Inline mode: render just tokens as inline span for continuous text display
  // Supports click-to-inspect with WordInspector appearing below the inline content
  if (inline) {
    return (
      <>
        <span style={{ display: "inline" }}>
          {tks.map((t, i) => {
            const displaysHere = tokenSpanMeta[i] || [];
            const chosen = displaysHere.length ? pickConstruction(displaysHere) : null;
            const chosenColors = chosen ? typeColors(chosen.type) : null;

            const externalSelected = selectedTokenId != null && String(t.id) === String(selectedTokenId);
            const internalSelected = selected && selected.token && String(selected.token.id) === String(t.id);
            const isSelected = externalSelected || internalSelected;

            const background = isSelected
              ? "#ffe9b5"
              : chosenColors
                ? chosenColors.tokenBg
                : "transparent";
            const border = chosenColors ? `1px solid ${chosenColors.border}` : "1px solid transparent";

            const constructionTitle =
              displaysHere.length > 0
                ? `construction: ${displaysHere.map((d) => d.badgeText).join(", ")}`
                : "";

            return (
              <span
                key={`${sentence?.sid || "sid"}-${t.id}-${i}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTokenClick) {
                    onTokenClick(t, { tokenIndex: i, sentence });
                  } else {
                    setSelected({ token: t, tokenIndex: i });
                  }
                }}
                style={{
                  background,
                  border,
                  borderRadius: 4,
                  padding: "1px 2px",
                  cursor: "pointer",
                }}
                title={[
                  t.lemma ? `lemma: ${t.lemma}` : "",
                  t.upos ? `upos: ${t.upos}` : "",
                  constructionTitle,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              >
                {renderTokenWithSpacing(tks, i)}
              </span>
            );
          })}
          {" "} {/* Trailing space between sentences */}
        </span>
        {/* Word inspector for inline mode when no external handler */}
        {!onTokenClick && selected && selected.token && (
          <div style={{ display: "block", marginTop: 14, marginBottom: 14 }}>
            <WordInspector
              token={selected.token}
              tokenIndex={selected.tokenIndex}
              sentence={sentence}
              constructions={cons}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{ lineHeight: 1.6 }}>
      {/* Per-sentence badges (optional) */}
      {showBadges && badges.length > 0 && (
        <div style={{ marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {badges.map((b) => {
            const colors = typeColors(b.display.type);
            return (
              <span
                key={b.display.badgeKey}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 999,
                  background: colors.bg,
                  color: colors.ink,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title={`count: ${b.count}${b.best?.confidence != null ? ` | best confidence: ${b.best.confidence}` : ""}`}
              >
                {b.display.badgeText}
                {b.count > 1 ? <span style={{ opacity: 0.75 }}>×{b.count}</span> : null}
              </span>
            );
          })}
        </div>
      )}

      {/* Latin tokens */}
      <div style={{ fontSize: 20 }}>
        {tks.map((t, i) => {
          const displaysHere = tokenSpanMeta[i] || [];
          const chosen = displaysHere.length ? pickConstruction(displaysHere) : null;

          const externalSelected = selectedTokenId != null && String(t.id) === String(selectedTokenId);
          const internalSelected = selected && selected.token && String(selected.token.id) === String(t.id);
          const isSelected = externalSelected || internalSelected;

          const isHighlighted = highlightTokenIndex != null && Number(i) === Number(highlightTokenIndex);

          const chosenColors = chosen ? typeColors(chosen.type) : null;

          const background = isSelected
            ? "#ffe9b5"
            : isHighlighted
              ? "#fff2a8"
              : chosenColors
                ? chosenColors.tokenBg
                : "transparent";

          const border = chosenColors ? `1px solid ${chosenColors.border}` : "1px solid transparent";

          const constructionTitle =
            displaysHere.length > 0
              ? `construction: ${displaysHere.map((d) => d.badgeText).join(", ")}`
              : "";

          return (
            <button
              key={`${sentence?.sid || "sid"}-${t.id}-${i}`}
              onClick={() => {
                if (onTokenClick) {
                  onTokenClick(t, { tokenIndex: i, sentence });
                } else {
                  setSelected({ token: t, tokenIndex: i });
                }
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                background,
                border,
                borderRadius: 6,
                padding: "2px 3px",
              }}
              title={[
                t.lemma ? `lemma: ${t.lemma}` : "",
                t.upos ? `upos: ${t.upos}` : "",
                t.feats ? `feats: ${t.feats}` : "",
                constructionTitle,
              ]
                .filter(Boolean)
                .join(" | ")}
            >
              {renderTokenWithSpacing(tks, i)}
            </button>
          );
        })}
      </div>

      {/* English translation */}
      {eng && <div style={{ marginTop: 10, fontSize: 14, color: "#333" }}>{eng}</div>}

      {/* Word inspector (default behavior when parent doesn't override clicks) */}
      {!onTokenClick && selected && selected.token && (
        <div style={{ marginTop: 14 }}>
          <WordInspector
            token={selected.token}
            tokenIndex={selected.tokenIndex}
            sentence={sentence}
            constructions={cons}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
