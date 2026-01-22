// TextSelector.jsx
// A dropdown/banner at the top of practice pages to select which text to work with.
// Currently only DBG 1 is available, but structure supports future texts.

import { createContext, useContext, useState, useEffect } from "react";

// Available texts - expand this list as new texts are added
export const AVAILABLE_TEXTS = [
  {
    id: "dbg1",
    name: "De Bello Gallico, Book 1",
    shortName: "DBG 1",
    author: "Caesar",
    description: "Caesar's account of the Gallic War, Book 1",
  },
  // Future texts can be added here:
  // { id: "dbg2", name: "De Bello Gallico, Book 2", shortName: "DBG 2", author: "Caesar", ... },
  // { id: "aeneid1", name: "Aeneid, Book 1", shortName: "Aeneid 1", author: "Virgil", ... },
];

// Context for sharing selected text across the app
const TextContext = createContext({
  selectedText: AVAILABLE_TEXTS[0],
  setSelectedText: () => {},
});

export function useSelectedText() {
  return useContext(TextContext);
}

export function TextProvider({ children }) {
  const [selectedText, setSelectedText] = useState(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem("ars_legendi_selected_text");
    if (saved) {
      const found = AVAILABLE_TEXTS.find((t) => t.id === saved);
      if (found) return found;
    }
    return AVAILABLE_TEXTS[0];
  });

  useEffect(() => {
    localStorage.setItem("ars_legendi_selected_text", selectedText.id);
  }, [selectedText]);

  return (
    <TextContext.Provider value={{ selectedText, setSelectedText }}>
      {children}
    </TextContext.Provider>
  );
}

// The visual selector component to be placed at the top of pages
export default function TextSelector({ className = "" }) {
  const { selectedText, setSelectedText } = useSelectedText();
  const hasMultipleTexts = AVAILABLE_TEXTS.length > 1;

  return (
    <div className={`bg-primary/5 border-b border-primary/10 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Current Text:</span>

          {hasMultipleTexts ? (
            <select
              value={selectedText.id}
              onChange={(e) => {
                const newText = AVAILABLE_TEXTS.find((t) => t.id === e.target.value);
                if (newText) setSelectedText(newText);
              }}
              className="px-3 py-1.5 border-2 border-gray-200 rounded-lg bg-white text-primary font-semibold focus:border-accent focus:outline-none"
            >
              {AVAILABLE_TEXTS.map((text) => (
                <option key={text.id} value={text.id}>
                  {text.author}: {text.shortName}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-3 py-1.5 bg-white border-2 border-gray-200 rounded-lg text-primary font-semibold">
              {selectedText.author}: {selectedText.shortName}
            </span>
          )}
        </div>

        <span className="text-xs text-gray-500 hidden sm:block">
          {selectedText.description}
        </span>
      </div>
    </div>
  );
}

// Compact inline version for headers
export function TextSelectorInline() {
  const { selectedText, setSelectedText } = useSelectedText();
  const hasMultipleTexts = AVAILABLE_TEXTS.length > 1;

  if (hasMultipleTexts) {
    return (
      <select
        value={selectedText.id}
        onChange={(e) => {
          const newText = AVAILABLE_TEXTS.find((t) => t.id === e.target.value);
          if (newText) setSelectedText(newText);
        }}
        className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
      >
        {AVAILABLE_TEXTS.map((text) => (
          <option key={text.id} value={text.id}>
            {text.shortName}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="text-xs text-gray-500 font-medium">
      ({selectedText.shortName})
    </span>
  );
}
