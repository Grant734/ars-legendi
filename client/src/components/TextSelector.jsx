// TextSelector.jsx
// Context + dropdown for selecting active text corpus.
// Fetches available texts from /api/texts on mount.

import { createContext, useContext, useState, useEffect } from "react";
import { API_BASE_URL } from "../lib/api";

// Fallback text list (used before API responds)
const DEFAULT_TEXTS = [
  {
    id: "caesar",
    displayName: "Caesar: De Bello Gallico, Book 1",
    shortName: "Caesar: DBG 1",
  },
];

// Context for sharing selected text across the app
const TextContext = createContext({
  currentTextId: "caesar",
  setCurrentTextId: () => {},
  texts: DEFAULT_TEXTS,
  currentText: DEFAULT_TEXTS[0],
});

export function useText() {
  return useContext(TextContext);
}

// Legacy compat alias
export function useSelectedText() {
  const ctx = useText();
  return {
    selectedText: ctx.currentText ? { ...ctx.currentText, id: ctx.currentTextId, name: ctx.currentText.displayName, author: "" } : null,
    setSelectedText: (t) => ctx.setCurrentTextId(t?.id || t),
  };
}

export function TextProvider({ children }) {
  const [currentTextId, setCurrentTextIdState] = useState(() => {
    return localStorage.getItem("ars_legendi_selected_text") || "caesar";
  });
  const [texts, setTexts] = useState(DEFAULT_TEXTS);

  function setCurrentTextId(id) {
    setCurrentTextIdState(id);
    localStorage.setItem("ars_legendi_selected_text", id);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadTexts() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/texts`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.texts) && data.texts.length) {
          setTexts(data.texts);
          // Validate current selection still exists in loaded list
          const valid = data.texts.find((t) => t.id === currentTextId);
          if (!valid) setCurrentTextId(data.texts[0].id);
        }
      } catch {
        // Use defaults
      }
    }
    loadTexts();
    return () => { cancelled = true; };
  }, []);

  const currentText = texts.find((t) => t.id === currentTextId) || texts[0];

  return (
    <TextContext.Provider value={{ currentTextId, setCurrentTextId, texts, currentText }}>
      {children}
    </TextContext.Provider>
  );
}

// Dropdown for navbar
// Display-only text indicator for the navbar
export function TextSelectorDropdown({ className = "" }) {
  const { currentText } = useText();
  return (
    <span className={`text-xs text-accent/70 font-medium ${className}`}>
      {currentText?.shortName || currentText?.displayName || ""}
    </span>
  );
}

// Full-width selector for page headers (legacy export name)
export default function TextSelector({ className = "" }) {
  const { currentTextId, setCurrentTextId, texts, currentText } = useText();
  const hasMultiple = texts.length > 1;

  return (
    <div className={`bg-primary/5 border-b border-primary/10 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Current Text:</span>
          {hasMultiple ? (
            <select
              value={currentTextId}
              onChange={(e) => setCurrentTextId(e.target.value)}
              className="px-3 py-1.5 border-2 border-gray-200 rounded-lg bg-white text-primary font-semibold focus:border-accent focus:outline-none"
            >
              {texts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.shortName || t.displayName}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-3 py-1.5 bg-white border-2 border-gray-200 rounded-lg text-primary font-semibold">
              {currentText?.shortName || currentText?.displayName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
