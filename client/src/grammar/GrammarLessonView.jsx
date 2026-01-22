import { useEffect, useMemo, useState } from "react";
import { GRAMMAR_LESSONS } from "../data/grammarLessons";
import { fetchExamples, fetchSentenceBundle } from "../lib/caesarApi";
import CaesarSentence from "../components/CaesarSentence";
import GrammarQuiz from "./GrammarQuiz";
import { getQuizConfig } from "../data/grammarQuizConfigs";

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ExampleBrowser({ lessonTypes }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [activeBundle, setActiveBundle] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);

  useEffect(() => {
    let alive = true;
    setErr(null);
    setData(null);
    setActiveIndex(0);
    setActiveBundle(null);

    fetchExamples(lessonTypes)
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
      });

    return () => {
      alive = false;
    };
  }, [lessonTypes?.join(",")]);

  const items = data?.items || [];
  const activeSid = items[activeIndex]?.sid;

  useEffect(() => {
    let alive = true;
    setActiveBundle(null);
    setShowTranslation(false);
    if (!activeSid) return;

    fetchSentenceBundle(activeSid)
      .then((b) => {
        if (!alive) return;
        setActiveBundle(b?.sentence || b);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [activeSid]);

  const filteredConstructions = useMemo(() => {
    if (!activeBundle) return [];
    const cons = Array.isArray(activeBundle.constructions) ? activeBundle.constructions : [];
    const allow = new Set(lessonTypes || []);
    return cons.filter((c) => allow.has(c?.type));
  }, [activeBundle, lessonTypes]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
      <div style={{ border: "1px solid #eee", borderRadius: 14, background: "#fafafa", overflow: "hidden" }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12, opacity: 0.8 }}>
          Instances (DBG1 order): {items.length}
        </div>
        <div style={{ maxHeight: 420, overflow: "auto" }}>
          {items.map((it, idx) => {
            const on = idx === activeIndex;
            return (
              <button
                key={it.sid}
                onClick={() => setActiveIndex(idx)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid #eee",
                  background: on ? "#fff" : "transparent",
                  padding: "10px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: on ? 900 : 600 }}>DBG1 {it.sid}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>ch {it.chapter}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>{activeSid ? `DBG1 ${activeSid}` : "Select an example"}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={activeIndex <= 0}
              style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontSize: 12, opacity: activeIndex <= 0 ? 0.5 : 1 }}
            >
              Prev
            </button>
            <button
              onClick={() => setActiveIndex((i) => Math.min(items.length - 1, i + 1))}
              disabled={activeIndex >= items.length - 1}
              style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontSize: 12, opacity: activeIndex >= items.length - 1 ? 0.5 : 1 }}
            >
              Next
            </button>
            <button
              onClick={() => setShowTranslation((v) => !v)}
              style={{ border: "1px solid #ccc", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
            >
              {showTranslation ? "Hide translation" : "Show translation"}
            </button>
          </div>
        </div>

        {err && <div style={{ color: "#b00020", fontSize: 13 }}>{err}</div>}
        {!activeBundle && !err && activeSid && <div style={{ fontSize: 13, opacity: 0.7 }}>Loading sentence…</div>}

        {activeBundle && (
          <CaesarSentence
            sentence={activeBundle}
            constructions={filteredConstructions}
            translation={showTranslation ? (activeBundle.translation || "") : ""}
            showBadges={false}
          />
        )}
      </div>
    </div>
  );
}

export default function GrammarLessonView({ lessonKey, variant = "page" }) {
  const lesson = GRAMMAR_LESSONS[String(lessonKey || "")];

  if (!lesson) return <div style={{ color: "#b00020" }}>Unknown lesson: {String(lessonKey || "")}</div>;

  const reverseSearchEnabled = Boolean(
    (lesson.enableReverseSearch ?? lesson.reverseSearchEnabled ?? false) &&
    Array.isArray(lesson.constructionTypes) &&
    lesson.constructionTypes.length > 0
  );

  const contentStyles = `
    .grammar-content section { margin-bottom: 24px; }
    .grammar-content h2 { font-size: 18px; font-weight: 800; margin: 0 0 12px 0; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .grammar-content h3 { font-size: 15px; font-weight: 700; margin: 16px 0 8px 0; }
    .grammar-content p { font-size: 14px; line-height: 1.7; margin: 0 0 10px 0; color: #222; }
    .grammar-content ul, .grammar-content ol { margin: 8px 0 12px 20px; padding: 0; }
    .grammar-content li { font-size: 14px; line-height: 1.7; margin-bottom: 6px; color: #222; }
    .grammar-content em { font-style: italic; color: #1a5f7a; }
    .grammar-content strong { font-weight: 700; }
    .grammar-content u { text-decoration: underline; }
  `;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{contentStyles}</style>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
        <div style={{ fontSize: variant === "panel" ? 18 : 24, fontWeight: 950 }}>{lesson.title}</div>
      </div>

      {lesson.content && (
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 16, background: "#fff" }}>
          <div
            className="grammar-content"
            dangerouslySetInnerHTML={{ __html: lesson.content }}
          />
        </div>
      )}

      {getQuizConfig(lessonKey) && (
        <Card title="Quiz">
          <GrammarQuiz lessonKey={lessonKey} />
        </Card>
      )}

      {reverseSearchEnabled && (
        <Card title="Caesar Examples (Reverse Search)">
          <div style={{ fontSize: 13, color: "#444", marginBottom: 10 }}>
            All tagged instances in DBG1, in Caesar order.
          </div>
          <ExampleBrowser lessonTypes={lesson.constructionTypes} />
        </Card>
      )}
    </div>
  );
}
