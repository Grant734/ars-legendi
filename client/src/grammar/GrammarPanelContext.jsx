import { createContext, useContext, useEffect, useMemo, useState } from "react";
import GrammarLessonView from "./GrammarLessonView";

const Ctx = createContext(null);

export function GrammarPanelProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [lessonKey, setLessonKey] = useState(null);

  const api = useMemo(() => {
    return {
      openLesson: (key) => {
        if (!key) return;
        setLessonKey(key);
        setOpen(true);
      },
      close: () => setOpen(false),
      isOpen: open,
      lessonKey,
    };
  }, [open, lessonKey]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Ctx.Provider value={api}>
      {children}

      {open && (
        <div
          role="dialog"
          aria-label="Grammar lesson panel"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 9999,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: "min(520px, 92vw)",
              height: "100%",
              background: "#fff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              borderLeft: "1px solid #eee",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 14,
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 900 }}>Grammar Lesson</div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #ccc",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
                aria-label="Close lesson panel"
              >
                Close
              </button>
            </div>

            <div style={{ padding: 14 }}>
              <GrammarLessonView lessonKey={lessonKey} variant="panel" />
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useGrammarPanel() {
  return useContext(Ctx);
}
