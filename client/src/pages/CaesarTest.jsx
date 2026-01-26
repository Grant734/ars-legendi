import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import CaesarSentence from "../components/CaesarSentence";
import WordInspector from "../components/WordInspector";

export default function CaesarTest() {
  const [sid, setSid] = useState("1.0");
  const [bundle, setBundle] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setBundle(null);
      setSelected(null);

      const res = await fetch(`${API_BASE_URL}/api/caesar/sentence/${sid}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      const data = await res.json();
      if (!cancelled) setBundle(data);
    }
    run().catch((e) => {
      console.error(e);
      if (!cancelled) setBundle({ error: String(e.message || e) });
    });

    return () => { cancelled = true; };
  }, [sid]);

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h2>Caesar Sentence Test</h2>

      <div style={{ marginBottom: 12 }}>
        <label>
          SID:&nbsp;
          <input
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            style={{ padding: 6, width: 120 }}
          />
        </label>
        <span style={{ marginLeft: 12, fontSize: 12, color: "#555" }}>
          Try 1.0, 2.1, 4.2 (for constructions)
        </span>
      </div>

      {!bundle && <div>Loading…</div>}

      {bundle && bundle.error && (
        <pre style={{ background: "#fee", padding: 12 }}>{bundle.error}</pre>
      )}

      {bundle && !bundle.error && (
        <>
          <CaesarSentence
            sentence={bundle}
            selectedTokenId={selected?.id}
            onTokenClick={(token) => setSelected(token)}
          />

          {selected && (
             <div style={{ marginTop: 16 }}>
                <WordInspector
                    token={selected}
                    // CaesarTest currently doesn't track tokenIndex, so we omit it here.
                    // We'll add tokenIndex later when we want construction-span matching at click-time.
                    sentence={bundle}
                    constructions={bundle?.constructions || []}
                />
            </div>
            )}



        </>
      )}
    </div>
  );
}
