// src/components/WordInspector.jsx
import { useEffect, useMemo, useState } from "react";
import { prettyUpos, prettyDeprel, prettyFeats } from "../utils/udPretty";

function humanizeConditionalLabel(label) {
  if (!label) return "Conditional (Mixed/Unclassified)";

  const map = {
    simple_present: "Simple Present (Indicative)",
    future_more_vivid: "Future More Vivid (Indicative)",
    simple_past: "Simple Past (Indicative)",

    future_less_vivid: "Future Less Vivid (Subjunctive)",
    present_contrafactual: "Present Contrary-to-Fact (Subjunctive)",
    past_contrafactual: "Past Contrary-to-Fact (Subjunctive)",

    mixed_indicative: "Mixed Indicative",
    mixed_subjunctive: "Mixed Subjunctive",
    mixed: "Mixed",

    indicative_equivalent_indirect_primary: "Indicative Equivalent (Indirect Discourse, Primary Sequence)",
    indicative_equivalent_indirect_secondary: "Indicative Equivalent (Indirect Discourse, Secondary Sequence)",
  };

  return map[label] || `Conditional (${label})`;
}

function humanizePurposeSubtype(subtype) {
  if (!subtype) return "Purpose Clause";
  if (subtype === "ut_ne") return "Purpose Clause (ut/ne/neve + subj.)";
  if (subtype === "ad_gerund") return "Purpose Phrase (ad + gerund)";
  if (subtype === "ad_noun_gerundive") return "Purpose Phrase (ad + noun + gerundive)";
  if (subtype === "qui_subj") return "Relative Purpose / Characteristic (qui + subj.)";
  return `Purpose Clause (${subtype})`;
}

function humanizeRelativeSubtype(subtype) {
  if (!subtype) return "Relative Clause";
  if (subtype === "indicative") return "Relative Clause (Indicative)";
  if (subtype === "subjunctive") return "Relative Clause (Subjunctive)";
  return `Relative Clause (${subtype})`;
}

function humanizeFlipSubtype(subtype) {
  if (!subtype) return "Gerund–Gerundive Flip (Flag)";
  if (subtype === "gerund_form_with_object") return "Gerund–Gerundive Flip (Gerund + object)";
  if (subtype === "gerundive_form_ad_phrase") return "Gerund–Gerundive Flip (ad + noun + gerundive)";
  return `Gerund–Gerundive Flip (${subtype})`;
}

function constructionLabel(c) {
  const type = c?.type;

  if (type === "abl_abs") return "Ablative Absolute";
  if (type === "indirect_statement") return "Indirect Statement (Acc + Inf)";
  if (type === "cum_clause") return "Cum Clause";

  if (type === "purpose_clause") return humanizePurposeSubtype(c?.subtype);
  if (type === "relative_clause") return humanizeRelativeSubtype(c?.subtype);

  if (type === "conditional_protasis" || type === "conditional_apodosis") {
    const condLabel = humanizeConditionalLabel(c?.conditional?.label);
    const role = type === "conditional_protasis" ? "Protasis" : "Apodosis";
    return `Conditional (${role}): ${condLabel}`;
  }

  if (type === "gerund") return "Gerund";
  if (type === "gerundive") return "Gerundive";
  if (type === "gerund_gerundive_flip") return humanizeFlipSubtype(c?.subtype);

  return type || "construction";
}

function typeColors(type) {
  // One consistent color per TYPE.
  // Distinct colors: protasis/apodosis, gerund/gerundive, purpose/result all different
  if (type === "abl_abs") return { bg: "#fff0f0", border: "#ffb3b3", ink: "#7a1f1f" };
  if (type === "indirect_statement") return { bg: "#eef6ff", border: "#9cc8ff", ink: "#143a66" };
  if (type === "cum_clause") return { bg: "#f2fff3", border: "#9fe3a6", ink: "#1f5e2a" };

  if (type === "purpose_clause") return { bg: "#fff7ed", border: "#f97316", ink: "#9a3412" };
  if (type === "result_clause") return { bg: "#fef2f2", border: "#ef4444", ink: "#991b1b" };
  if (type === "relative_clause") return { bg: "#f2f0ff", border: "#b7adff", ink: "#2f2a7a" };

  if (type === "conditional_protasis") return { bg: "#eff6ff", border: "#60a5fa", ink: "#1e40af" };
  if (type === "conditional_apodosis") return { bg: "#eef2ff", border: "#818cf8", ink: "#3730a3" };

  if (type === "gerund") return { bg: "#ecfdf5", border: "#10b981", ink: "#065f46" };
  if (type === "gerundive") return { bg: "#fffbeb", border: "#f59e0b", ink: "#92400e" };
  if (type === "gerund_gerundive_flip") return { bg: "#fff0fb", border: "#f2a6dd", ink: "#6a1e55" };

  return { bg: "#f7f7f7", border: "#ccc", ink: "#333" };
}

export default function WordInspector({ token, tokenIndex, sentence, constructions, onClose }) {
  const [showRaw, setShowRaw] = useState(false);

  // glossary-backed fields (kept exactly as-is)
  const [glossShort, setGlossShort] = useState("");
  const [dictEntry, setDictEntry] = useState("");
  const [glossLoading, setGlossLoading] = useState(false);

  const constructionsHere = useMemo(() => {
    if (!constructions || tokenIndex == null) return [];
    const idx = Number(tokenIndex);
    if (Number.isNaN(idx)) return [];
    return constructions.filter((c) => {
      const s = Number(c.start);
      const e = Number(c.end);
      if (Number.isNaN(s) || Number.isNaN(e)) return false;
      return s <= idx && idx <= e;
    });
  }, [constructions, tokenIndex]);

  useEffect(() => {
    let alive = true;

    async function loadGloss() {
      setGlossShort("");
      setDictEntry("");

      const lemma = String(token?.lemma || "").trim();
      if (!lemma) return;

      try {
        setGlossLoading(true);
        const res = await fetch(`/api/caesar/glossary?lemma=${encodeURIComponent(lemma)}`);
        if (!res.ok) return;

        const data = await res.json();
        const entry = data?.entry || data || {};

        const short =
          String(entry?.gloss_short || "").trim() ||
          (Array.isArray(entry?.glosses) ? String(entry.glosses[0] || "").trim() : "") ||
          String(entry?.gloss || "").trim();

        const de = String(entry?.dictionary_entry || "").trim();

        if (!alive) return;
        setGlossShort(short);
        setDictEntry(de);
      } catch (e) {
        // silent fail
      } finally {
        if (alive) setGlossLoading(false);
      }
    }

    loadGloss();
    return () => {
      alive = false;
    };
  }, [token?.lemma]);

  if (!token) return null;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{token.text}</div>
          {token.lemma && (
            <div style={{ fontSize: 14, color: "#333" }}>
              <span style={{ opacity: 0.7 }}>lemma:</span> {token.lemma}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: "4px 8px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 6, columnGap: 10 }}>
        <div style={{ color: "#666" }}>Definition</div>
        <div>{glossLoading ? <span style={{ opacity: 0.75 }}>(loading…)</span> : glossShort || "(definition pending)"}</div>

        <div style={{ color: "#666" }}>Dictionary entry</div>
        <div>{dictEntry || "(none)"}</div>

        <div style={{ color: "#666" }}>Part of speech</div>
        <div>{prettyUpos(token.upos)}</div>

        <div style={{ color: "#666" }}>Morphology</div>
        <div>{prettyFeats(token.feats, { showAll: showRaw }) || "(none)"}</div>

        <div style={{ color: "#666" }}>Syntax role</div>
        <div>{prettyDeprel(token.deprel) || "(none)"}</div>

        <div style={{ color: "#666" }}>Head token</div>
        <div>{token.head != null ? String(token.head) : "(none)"}</div>
      </div>

      {constructionsHere.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Constructions in this span</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {constructionsHere.map((c, i) => {
              const colors = typeColors(c?.type);
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 999,
                    background: colors.bg,
                    color: colors.ink,
                  }}
                  title={[
                    c?.confidence != null ? `confidence: ${c.confidence}` : "",
                    c?.subtype ? `subtype: ${c.subtype}` : "",
                    c?.conditional?.label ? `conditional: ${c.conditional.label}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                >
                  {constructionLabel(c)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {sentence?.sid && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Sentence: {sentence.sid} (ch. {sentence.chapter})
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => setShowRaw((v) => !v)}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {showRaw ? "Hide raw UD tags" : "Show raw UD tags"}
        </button>

        {showRaw && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#333" }}>
            <div>
              <b>upos:</b> {token.upos || "(none)"}
            </div>
            <div>
              <b>feats:</b> {token.feats || "(none)"}
            </div>
            <div>
              <b>deprel:</b> {token.deprel || "(none)"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
