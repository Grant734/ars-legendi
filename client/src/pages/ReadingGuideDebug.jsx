import { useEffect, useMemo, useState } from "react";
import CaesarSentence from "../components/CaesarSentence";

function typeLabel(type) {
  if (type === "abl_abs") return "Ablative Absolute";
  if (type === "indirect_statement") return "Indirect Statement (Acc+Inf)";
  if (type === "cum_clause") return "Cum Clause";
  if (type === "purpose_clause") return "Purpose Clause";
  if (type === "relative_clause") return "Relative Clause";
  if (type === "conditional_protasis") return "Conditional Protasis (si-clause)";
  if (type === "conditional_apodosis") return "Conditional Apodosis";
  if (type === "gerund") return "Gerund";
  if (type === "gerundive") return "Gerundive";
  if (type === "gerund_gerundive_flip") return "Gerund ↔ Gerundive Flip";
  return type;
}

function countByType(constructions) {
  const out = {};
  (constructions || []).forEach((c) => {
    const t = c?.type || "other";
    out[t] = (out[t] || 0) + 1;
  });
  return out;
}

export default function ReadingGuideDebug() {
  const [sid, setSid] = useState("1.0");
  const [bundle, setBundle] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [showTranslation, setShowTranslation] = useState(true);
  const [showConstructions, setShowConstructions] = useState(true);
  const [showRawJson, setShowRawJson] = useState(false);

  async function load() {
    setErr("");
    setLoading(true);
    setBundle(null);

    try {
      const res = await fetch(`/api/caesar/sentenceBundle?sid=${encodeURIComponent(sid)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Request failed (${res.status})`);
      }
      const j = await res.json();
      setBundle(j);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const constructions = bundle?.constructions || bundle?.sentence?.constructions || [];
  const counts = useMemo(() => countByType(constructions), [constructions]);
  const types = useMemo(() => Object.keys(counts).sort(), [counts]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
      <div>
        <h2 style={{ marginTop: 0 }}>Reading Guide Debug</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 14 }}>
            SID:&nbsp;
            <input
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 8, width: 140 }}
            />
          </label>

          <button
            onClick={load}
            style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            Load
          </button>

          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => setShowTranslation(e.target.checked)}
            />{" "}
            Show translation
          </label>

          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={showConstructions}
              onChange={(e) => setShowConstructions(e.target.checked)}
            />{" "}
            Highlight constructions
          </label>

          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={showRawJson}
              onChange={(e) => setShowRawJson(e.target.checked)}
            />{" "}
            Show raw JSON
          </label>
        </div>

        {loading && <div style={{ marginTop: 12 }}>(loading…)</div>}
        {err && <div style={{ marginTop: 12, color: "#a00" }}>{err}</div>}

        {bundle && (
          <div style={{ marginTop: 16 }}>
            <CaesarSentence
              sentence={bundle.sentence || bundle}
              constructions={showConstructions ? constructions : []}
              translation={showTranslation ? (bundle.translation || bundle.sentence?.translation || "") : ""}
            />

            {showRawJson && (
              <pre style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#f6f6f6", overflowX: "auto" }}>
                {JSON.stringify(bundle, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <aside style={{ position: "sticky", top: 12, alignSelf: "start" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fafafa" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Clause/Construction Key (debug)</div>

          {types.length === 0 ? (
            <div style={{ fontSize: 13, color: "#666" }}>(no constructions on this SID)</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {types.map((t) => (
                <a
                  key={t}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    // Later: deep-link to your Grammar Lessons section for this construction type
                    alert(`Later: link ${t} → grammar section`);
                  }}
                  style={{
                    textDecoration: "none",
                    color: "#222",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "#fff",
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                  title={t}
                >
                  <span>{typeLabel(t)}</span>
                  <span style={{ opacity: 0.7 }}>×{counts[t]}</span>
                </a>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            This panel will eventually become your always-on key with colors + grammar links.
          </div>
        </div>
      </aside>
    </div>
  );
}
