// src/pages/ReadingGuide.jsx
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import CaesarSentence from "../components/CaesarSentence.jsx";
import TextSelector from "../components/TextSelector";
import ClauseLegend from "../components/ClauseLegend.jsx";
import { CONSTRUCTION_STYLES } from "../lib/constructionStyles";
import { defaultEnabledTypes } from "../lib/constructionStyles";

// Reserved space for your manual commentary (hardcode here for now).
// You can later move this to its own file (e.g. src/data/caesarCommentary.js).
const CHAPTER_COMMENTARY = {
  // 1: {
  //   tag: "syntactic", // syntactic | stylistic | historical | rhetorical
  //   text: `Your notes here...\nSecond line...`,
  // },
};

function entryToDisplay(entry) {
  // Goal: show a friendly "dictionary entry + glosses" view without assuming a strict schema.
  // Returns: { entryLine: string|null, glosses: string[], rawText: string|null }
  if (entry == null) return { entryLine: null, glosses: [], rawText: null };

  // If backend gives a plain string (most common), try to pull glosses out.
  if (typeof entry === "string") {
    const s = entry.trim();
    if (!s) return { entryLine: null, glosses: [], rawText: null };

    // Try to extract glosses from after ":" if present, else after "—" / "-" if present.
    let glossPart = "";
    const colon = s.indexOf(":");
    if (colon !== -1) glossPart = s.slice(colon + 1).trim();
    else {
      const dash = s.indexOf("—") !== -1 ? s.indexOf("—") : s.indexOf(" - ");
      if (dash !== -1) glossPart = s.slice(dash + 1).trim();
    }

    let glosses = [];
    if (glossPart) {
      glosses = glossPart
        .split(/[;•]/g)
        .map((x) => x.trim())
        .filter(Boolean);
      // If still just one long chunk, try commas.
      if (glosses.length <= 1) {
        const alt = glossPart
          .split(/,/g)
          .map((x) => x.trim())
          .filter(Boolean);
        if (alt.length > 1) glosses = alt;
      }
    }

    return {
      entryLine: s,
      glosses,
      rawText: glosses.length ? null : s,
    };
  }

  // If backend gives an object, try common fields.
  if (typeof entry === "object") {
    const e = entry;

    const maybeEntryLine =
      (typeof e.dictionary_entry === "string" && e.dictionary_entry.trim()) ||
      (typeof e.dictionaryEntry === "string" && e.dictionaryEntry.trim()) ||
      (typeof e.entry === "string" && e.entry.trim()) ||
      (typeof e.head === "string" && e.head.trim()) ||
      (typeof e.headword === "string" && e.headword.trim()) ||
      null;

    const arr =
      (Array.isArray(e.glosses) && e.glosses) ||
      (Array.isArray(e.definitions) && e.definitions) ||
      (Array.isArray(e.senses) && e.senses) ||
      null;

    const glossesFromArr = Array.isArray(arr)
      ? arr
          .map((x) => {
            if (typeof x === "string") return x.trim();
            if (x && typeof x === "object") {
              return String(x.gloss || x.definition || x.text || "").trim();
            }
            return "";
          })
          .filter(Boolean)
      : [];

    // If backend provides a short gloss, include it (but don’t duplicate).
    const glossShort =
      (typeof e.gloss_short === "string" && e.gloss_short.trim()) ||
      (typeof e.glossShort === "string" && e.glossShort.trim()) ||
      (typeof e.gloss === "string" && e.gloss.trim()) ||
      "";

    const glosses = [...glossesFromArr];
    if (glossShort && !glosses.some((g) => g.toLowerCase() === glossShort.toLowerCase())) {
      glosses.unshift(glossShort);
    }

    return {
      entryLine: maybeEntryLine,
      glosses,
      rawText: glosses.length || maybeEntryLine ? null : JSON.stringify(entry, null, 2),
    };
  }

  return { entryLine: String(entry), glosses: [], rawText: null };
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

export default function ReadingGuide() {
  const [chaptersMeta, setChaptersMeta] = useState([]); // [{chapter, sentence_count}]
  const [chapters, setChapters] = useState([]); // [1,2,3...]
  const [chapter, setChapter] = useState(1);

  const [bundles, setBundles] = useState([]); // normalized sentence objects
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // View toggles (ONLY keep what you still want)
  const [showTranslation, setShowTranslation] = useState(false);
  const [clausesEnabled, setClausesEnabled] = useState(true);

  // Legend filter (unchanged behavior)
  const [enabledTypes, setEnabledTypes] = useState(defaultEnabledTypes);

  // Glossary search
  const [glossaryQ, setGlossaryQ] = useState("");
  const [glossaryErr, setGlossaryErr] = useState("");
  const [glossaryHits, setGlossaryHits] = useState([]); // [{lemma, entry, _fromForm?:string}]
  const [selectedLemma, setSelectedLemma] = useState("");

  function normalizeChapterList(payload) {
    // backend returns { chapters: [{chapter, sentence_count}] }
    const meta = Array.isArray(payload?.chapters) ? payload.chapters : [];
    const nums = meta
      .map((x) => Number(x?.chapter))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    setChaptersMeta(meta);
    setChapters(nums);

    if (nums.length) {
      setChapter((prev) => (nums.includes(prev) ? prev : nums[0]));
    }
  }

  function normalizeBundles(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((b) => {
        const sent = b?.sentence && typeof b.sentence === "object" ? b.sentence : b;
        if (!sent || typeof sent !== "object") return null;

        const sid = String(b?.sid ?? sent?.sid ?? "");
        const tokensRaw = Array.isArray(sent?.tokens) ? sent.tokens : [];
        const tokens = tokensRaw.map((t, i) => {
          const text = t?.text ?? t?.form ?? t?.word ?? "";
          return {
            ...t,
            id: t?.id ?? i + 1,
            text,
            form: t?.form ?? text,
          };
        });

        const constructions =
          Array.isArray(b?.constructions) ? b.constructions : Array.isArray(sent?.constructions) ? sent.constructions : [];

        const translation = b?.translation ?? sent?.translation ?? null;

        return {
          ...sent,
          sid,
          tokens,
          constructions,
          translation,
        };
      })
      .filter(Boolean);
  }

  async function loadChapters() {
    setErr("");
    const r = await fetch(`${API_BASE_URL}/api/caesar/chapters`);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      throw new Error(j?.error || `chapters failed (HTTP ${r.status})`);
    }
    const j = await r.json();
    normalizeChapterList(j);
  }

  async function loadChapter(ch) {
    if (ch == null) return;
    setErr("");
    setLoading(true);

    try {
      const r = await fetch(`${API_BASE_URL}/api/caesar/chapterBundle?chapter=${encodeURIComponent(ch)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error || `chapterBundle failed (HTTP ${r.status})`);
      }
      const j = await r.json();

      // backend returns { chapter, sentences: [...] }
      const next = normalizeBundles(j?.sentences ?? j?.bundles ?? []);
      setBundles(next);

      // If we encounter new types, auto-enable them (don’t clobber existing user toggles)
      const seen = {};
      next.forEach((s) => {
        (s?.constructions || []).forEach((c) => {
          if (c?.type) seen[c.type] = true;
        });
      });

      setEnabledTypes((prev) => {
        const out = { ...prev };
        Object.keys(seen).forEach((k) => {
          if (!(k in out)) out[k] = true;
        });
        return out;
      });
    } catch (e) {
      setErr(String(e?.message || e));
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGlossaryLemma(lemma) {
    const r = await fetch(`${API_BASE_URL}/api/caesar/glossary?lemma=${encodeURIComponent(lemma)}`);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (j?.entry) {
      return { lemma: String(j.lemma || lemma), entry: j.entry };
    }
    return null;
  }

  // Local, chapter-based form→lemma index (best-effort, preserves current backend).
  const formToLemmas = useMemo(() => {
    const m = new Map(); // normForm -> Set<lemma>
    function add(formNorm, lemmaRaw) {
      const k = String(formNorm || "").trim();
      const v = String(lemmaRaw || "").trim();
      if (!k || !v) return;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    }

    for (const s of bundles) {
      const tks = Array.isArray(s?.tokens) ? s.tokens : [];
      for (const t of tks) {
        const form = t?.form ?? t?.text ?? "";
        const lemma = t?.lemma ?? "";
        const formNorm = normalizeLatinForm(form);
        const lemmaNorm = normalizeLatinForm(lemma);
        if (formNorm && lemma) add(formNorm, lemma);
        if (lemmaNorm && lemma) add(lemmaNorm, lemma); // so lemma queries normalize too
      }
    }

    return m;
  }, [bundles]);

  async function searchGlossary(term) {
    setGlossaryErr("");
    setGlossaryHits([]);
    setSelectedLemma("");

    const qRaw = String(term || "").trim();
    if (!qRaw) return;

    const qNorm = normalizeLatinForm(qRaw);

    // 1) Prefer backend normalizer if it exists (if you add it later).
    // If missing/404, we fall back to the chapter-based index below.
    try {
      const rn = await fetch(`${API_BASE_URL}/api/caesar/glossaryByForm?form=${encodeURIComponent(qRaw)}`);
      if (rn.ok) {
        const jn = await rn.json().catch(() => null);
        const rawHits = Array.isArray(jn?.hits) ? jn.hits : [];

        // Case A: backend returns [{lemma, entry}, ...]
        if (rawHits.length && rawHits.some((h) => h && typeof h === "object" && h.entry != null)) {
          const hits = rawHits
            .map((h) => ({
              lemma: String(h.lemma || ""),
              entry: h.entry,
              _fromForm: qRaw,
            }))
            .filter((h) => h.lemma);

          if (hits.length) {
            setGlossaryHits(hits);
            setSelectedLemma(hits[0].lemma);
            return;
          }
        }

        // Case B: backend returns lemmas only (or [{lemma}, ...])
        const lemmas = rawHits
          .map((h) => (typeof h === "string" ? h : h?.lemma))
          .map((x) => String(x || "").trim())
          .filter(Boolean);

        const uniq = Array.from(new Set(lemmas)).slice(0, 10);
        if (uniq.length) {
          const out = [];
          for (const lem of uniq) {
            const hit = await fetchGlossaryLemma(lem);
            if (hit) out.push({ ...hit, _fromForm: qRaw });
          }
          if (out.length) {
            setGlossaryHits(out);
            setSelectedLemma(out[0].lemma);
            return;
          }
        }
      }
    } catch {
      // ignore
    }

    // 2) Chapter-based best-effort: map form→lemma using the currently loaded chapter tokens.
    const candidates = [];
    if (qNorm && formToLemmas.has(qNorm)) {
      const arr = Array.from(formToLemmas.get(qNorm));
      for (const a of arr) candidates.push(a);
    }

    // 3) Fall back: treat query as lemma.
    if (!candidates.length) candidates.push(qRaw);

    // Resolve candidates to glossary entries.
    const uniq = Array.from(new Set(candidates)).slice(0, 10);
    const out = [];
    for (const lem of uniq) {
      const hit = await fetchGlossaryLemma(lem);
      if (hit) {
        out.push({
          ...hit,
          _fromForm: normalizeLatinForm(lem) === qNorm ? "" : qRaw,
        });
      }
    }

    if (out.length) {
      setGlossaryHits(out);
      setSelectedLemma(out[0].lemma);
      return;
    }

    setGlossaryErr(`No glossary entry found for "${qRaw}".`);
  }

  useEffect(() => {
    loadChapters().catch((e) => setErr(String(e?.message || e)));
  }, []);

  useEffect(() => {
    if (!chapters.length) return;
    if (!chapters.includes(chapter)) return;
    loadChapter(chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, chapters]);

  const counts = useMemo(() => {
    const out = {};
    bundles.forEach((s) => {
      (s?.constructions || []).forEach((c) => {
        const t = c?.type;
        if (!t) return;
        out[t] = (out[t] || 0) + 1;
      });
    });
    return out;
  }, [bundles]);

  const filteredBundles = useMemo(() => {
    return bundles.map((s) => {
      // When clauses are disabled globally, return empty constructions
      if (!clausesEnabled) {
        return { ...s, constructions: [] };
      }
      const cs = Array.isArray(s?.constructions) ? s.constructions : [];
      const filtered = cs.filter((c) => {
        const t = c?.type;
        if (!t) return false;
        return enabledTypes?.[t] !== false;
      });
      return { ...s, constructions: filtered };
    });
  }, [bundles, enabledTypes, clausesEnabled]);

  const commentary = CHAPTER_COMMENTARY?.[chapter] || null;

  return (
    <>
      <TextSelector className="-mx-6 -mt-6 mb-6" />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-primary mb-2">Reading Guide</h1>
        <p className="text-gray-600 mb-6">
          Chapter-based reading with optional clause layers, vocab lookup, and notes.
        </p>

      {/* Controls + Vocab Search (permanent) */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex gap-4 flex-wrap items-center">
          <label className="flex gap-2 items-center">
            <span className="font-semibold text-gray-700">Chapter</span>
            <select
              value={chapter}
              onChange={(e) => setChapter(Number(e.target.value))}
              aria-label="Select chapter"
              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none"
            >
              {chaptersMeta.map((m) => {
                const ch = Number(m?.chapter);
                if (!Number.isFinite(ch)) return null;
                const count = Number(m?.sentence_count);
                return (
                  <option key={ch} value={ch}>
                    {Number.isFinite(count) ? `Chapter ${ch} (${count} sentences)` : `Chapter ${ch}`}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex gap-2 items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => setShowTranslation(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-gray-700">Show translation</span>
          </label>

          <label className="flex gap-2 items-center cursor-pointer">
            <input
              type="checkbox"
              checked={clausesEnabled}
              onChange={(e) => setClausesEnabled(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-gray-700">Highlight clauses</span>
          </label>
        </div>

        <div className="mt-4">
          <div className="font-bold text-primary mb-2">Caesar vocab search</div>
          <p className="text-sm text-gray-600 mb-3">
            Enter a word exactly as it appears in the text (e.g., "miserunt", "castris").
            The system will find the dictionary entry for you.
          </p>

          <div className="flex gap-3">
            <input
              value={glossaryQ}
              onChange={(e) => setGlossaryQ(e.target.value)}
              placeholder="e.g., miserunt, castris, hostium…"
              aria-label="Search Caesar glossary"
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") searchGlossary(glossaryQ);
              }}
            />
            <button
              onClick={() => searchGlossary(glossaryQ)}
              className="px-5 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Search
            </button>
          </div>

          {glossaryErr ? <div className="mt-3 text-red-600 text-sm">{glossaryErr}</div> : null}

          {glossaryHits.length ? (
            <div className="mt-4">
              {glossaryHits.length > 1 ? (
                <label className="flex gap-2 items-center mb-3">
                  <span className="font-semibold text-gray-700">Matches</span>
                  <select
                    value={selectedLemma}
                    onChange={(e) => setSelectedLemma(e.target.value)}
                    className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-accent focus:outline-none"
                    aria-label="Select glossary lemma"
                  >
                    {glossaryHits.map((h) => (
                      <option key={String(h.lemma)} value={String(h.lemma)}>
                        {String(h.lemma)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="space-y-3">
                {glossaryHits
                  .filter((h) => !selectedLemma || String(h.lemma) === String(selectedLemma))
                  .map((h) => {
                    const d = entryToDisplay(h.entry);
                    return (
                      <div
                        key={String(h.lemma)}
                        className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                      >
                        <div className="font-bold text-primary text-lg">{String(h.lemma)}</div>
                        {h._fromForm ? (
                          <div className="mt-1 text-xs text-gray-500">
                            normalized from:{" "}
                            <span className="font-mono">{h._fromForm}</span>
                          </div>
                        ) : null}

                        {d.entryLine ? (
                          <div className="mt-3">
                            <div className="font-semibold text-sm text-gray-700">Dictionary entry</div>
                            <div className="mt-1 whitespace-pre-wrap text-gray-600">{d.entryLine}</div>
                          </div>
                        ) : null}

                        {d.glosses.length ? (
                          <div className="mt-3">
                            <div className="font-semibold text-sm text-gray-700">Glosses</div>
                            <ul className="mt-2 list-disc list-inside text-gray-600 space-y-1">
                              {d.glosses.map((g, i) => (
                                <li key={`${h.lemma}_g_${i}`}>{g}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {d.rawText ? <div className="mt-3 whitespace-pre-wrap text-gray-600">{d.rawText}</div> : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>

        {err ? <div className="mt-4 text-red-600">{err}</div> : null}
      </div>

      {/* Main content + Sticky legend */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div>
          {loading ? <div className="text-gray-500 mt-3">Loading chapter…</div> : null}

          {!loading && !bundles.length ? (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mt-3">
              <div className="font-bold text-primary">No sentences loaded.</div>
              <div className="mt-2 text-gray-600 text-sm">
                If you see this with no error, your frontend is working but the backend returned an empty list. If you see
                an error above, fix the backend route first.
              </div>
            </div>
          ) : null}

          {/* Continuous text mode (no translation) */}
          {!showTranslation && filteredBundles.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mt-3">
              <div className="font-bold text-primary mb-4 flex justify-between items-center">
                <span>Chapter {chapter}</span>
                <span className="text-xs font-normal text-gray-500">{filteredBundles.length} sentences</span>
              </div>
              <div className="text-lg leading-loose">
                {filteredBundles.map((s, idx) => (
                  <CaesarSentence
                    key={s.sid || `ch${chapter}_i${idx + 1}`}
                    sentence={s}
                    constructions={s.constructions}
                    showBadges={false}
                    inline={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Separated sentences mode (with translation) */}
          {showTranslation && filteredBundles.map((s, idx) => {
            const sid = String(s.sid || `ch${chapter}_i${idx + 1}`);
            return (
              <div key={sid} id={`sid_${sid}`} className="bg-white border-2 border-gray-200 rounded-xl p-5 mt-3">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div className="font-bold text-primary">{sid}</div>
                  <div className="text-sm text-gray-500">{s.index != null ? `Sentence ${s.index}` : `Sentence ${idx + 1}`}</div>
                </div>

                <div className="mt-3">
                  <CaesarSentence
                    sentence={s}
                    constructions={s.constructions}
                    translation={s.translation}
                    showBadges={clausesEnabled}
                  />
                </div>
              </div>
            );
          })}

          {/* Chapter Navigation */}
          {!loading && bundles.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-4 mt-6 flex justify-between items-center">
              <button
                onClick={() => setChapter((prev) => {
                  const currentIdx = chapters.indexOf(prev);
                  return currentIdx > 0 ? chapters[currentIdx - 1] : prev;
                })}
                disabled={chapters.indexOf(chapter) <= 0}
                className={`px-5 py-2 border-2 rounded-lg font-semibold transition-colors ${
                  chapters.indexOf(chapter) <= 0
                    ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "border-gray-200 bg-white text-primary hover:border-accent"
                }`}
              >
                ← Previous
              </button>

              <span className="font-bold text-primary">Chapter {chapter}</span>

              <button
                onClick={() => setChapter((prev) => {
                  const currentIdx = chapters.indexOf(prev);
                  return currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : prev;
                })}
                disabled={chapters.indexOf(chapter) >= chapters.length - 1}
                className={`px-5 py-2 border-2 rounded-lg font-semibold transition-colors ${
                  chapters.indexOf(chapter) >= chapters.length - 1
                    ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "border-gray-200 bg-white text-primary hover:border-accent"
                }`}
              >
                Next →
              </button>
            </div>
          )}

        </div>

        <aside className="sticky top-4 self-start max-h-[calc(100vh-32px)] overflow-y-auto">
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
            <div className="font-bold text-primary mb-3">Clause legend</div>
            <ClauseLegend counts={counts} enabledTypes={enabledTypes} setEnabledTypes={setEnabledTypes} />
            <p className="mt-3 text-xs text-gray-500">Tip: click a clause type in the legend to jump to its grammar lesson.</p>
          </div>
        </aside>
      </div>
      </div>
    </>
  );
}
