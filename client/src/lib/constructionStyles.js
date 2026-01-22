export const CONSTRUCTION_STYLES = {
    // Classic-ish palette (distinct, readable)
    cum_clause: { label: "Cum clause", color: "#1F5F3B", lessonKey: "cum-clause" },
    purpose_clause: { label: "Purpose clause", color: "#7A1F2B", lessonKey: "purpose-clause" },
    result_clause: { label: "Result clause", color: "#B46A00", lessonKey: "result-clause" },
    indirect_statement: { label: "Indirect statement (Acc+Inf)", color: "#4B2E83", lessonKey: "indirect-statement" },
    abl_abs: { label: "Ablative absolute", color: "#4A5568", lessonKey: "ablative-absolute" },
  
    relative_clause: { label: "Relative clause", color: "#1F4E79", lessonKey: "relative-clauses" },
  
    conditional_protasis: { label: "Conditional protasis", color: "#8B5A2B", lessonKey: "conditionals" },
    conditional_apodosis: { label: "Conditional apodosis", color: "#8B5A2B", lessonKey: "conditionals" },
  
    gerund: { label: "Gerund", color: "#2F855A", lessonKey: "gerunds-gerundives" },
    gerundive: { label: "Gerundive", color: "#145a2a", lessonKey: "gerunds-gerundives" },

    gerund_gerundive_flip: { label: "Gerund ↔ gerundive flip", color: "#C05621", lessonKey: "gerunds-gerundives" },
  };
  





export function getConstructionStyle(type) {
  return CONSTRUCTION_STYLES[type] || { label: type || "construction", color: "#333", lessonKey: null };
}

export function typeLabel(type) {
  return getConstructionStyle(type).label;
}

export function lessonLinkForType(type) {
  const key = getConstructionStyle(type).lessonKey;
  if (!key) return null;
  return `/grammar/${key}`;
}

export const defaultEnabledTypes = Object.fromEntries(
  Object.keys(CONSTRUCTION_STYLES).map((k) => [k, true])
);
