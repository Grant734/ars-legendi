// src/utils/udPretty.js
// Turns UD tags/features into student-friendly English.

const UPOS = {
    NOUN: "Noun",
    PROPN: "Proper noun",
    VERB: "Verb",
    AUX: "Auxiliary verb",
    ADJ: "Adjective",
    ADV: "Adverb",
    PRON: "Pronoun",
    DET: "Determiner",
    ADP: "Preposition",
    NUM: "Number",
    CCONJ: "Coordinating conjunction",
    SCONJ: "Subordinating conjunction",
    PART: "Particle",
    INTJ: "Interjection",
    PUNCT: "Punctuation",
    SYM: "Symbol",
    X: "Other",
  };
  
  const DEPREL = {
    root: "Main verb",
    nsubj: "Subject",
    "nsubj:pass": "Subject (passive)",
    obj: "Direct object",
    iobj: "Indirect object",
    obl: "Oblique / adverbial",
    "obl:arg": "Oblique argument",
    advmod: "Adverbial modifier",
    advcl: "Adverbial clause",
    amod: "Adjective modifier",
    det: "Determiner",
    case: "Case marker (prep.)",
    nmod: "Noun modifier",
    acl: "Clause modifier",
    "acl:relcl": "Relative clause",
    xcomp: "Open clausal complement",
    ccomp: "Clausal complement",
    cop: "Copula",
    aux: "Auxiliary",
    "aux:pass": "Auxiliary (passive)",
    conj: "Conjunct",
    cc: "Coordinating conjunction",
    mark: "Subordinator",
    appos: "Apposition",
    punct: "Punctuation",
  };
  
  
  const FEAT_VALUE = {
    Case: {
      Nom: "nominative",
      Gen: "genitive",
      Dat: "dative",
      Acc: "accusative",
      Abl: "ablative",
      Voc: "vocative",
      Loc: "locative",
    },
    Gender: {
      Masc: "masculine",
      Fem: "feminine",
      Neut: "neuter",
    },
    Number: {
      Sing: "singular",
      Plur: "plural",
    },
    Person: {
      "1": "1st person",
      "2": "2nd person",
      "3": "3rd person",
    },
    Tense: {
      Pres: "present",
      Past: "past",
      Fut: "future",
      Imp: "imperfect",
      Pqp: "pluperfect",
    },
    Aspect: {
      Imp: "imperfective",
      Perf: "perfective",
      Prog: "progressive",
    },
    Mood: {
      Ind: "indicative",
      Sub: "subjunctive",
      Imp: "imperative",
    },
    Voice: {
      Act: "active",
      Pass: "passive",
      Mid: "middle",
    },
    VerbForm: {
      Fin: "finite",
      Inf: "infinitive",
      Part: "participle",
      Ger: "gerund",
      Gdv: "gerundive",
      Sup: "supine",
    },
    Degree: {
      Pos: "positive",
      Cmp: "comparative",
      Sup: "superlative",
    },
    PronType: {
      Prs: "personal",
      Rel: "relative",
      Dem: "demonstrative",
      Int: "interrogative",
      Ind: "indefinite",
      Tot: "total",
      Neg: "negative",
      Rcp: "reciprocal",
      Ref: "reflexive",
    },
  };
  
  export function prettyUpos(upos) {
    return UPOS[upos] || upos || "";
  }
  
  export function prettyDeprel(deprel) {
    return DEPREL[deprel] || deprel || "";
  }
  
  export function parseFeats(feats) {
    // feats may be null or already an object; your data uses a string.
    if (!feats) return {};
    if (typeof feats === "object") return feats;
  
    const out = {};
    const parts = String(feats).split("|").filter(Boolean);
    for (const p of parts) {
      const [k, v] = p.split("=");
      if (!k || v == null) continue;
      out[k] = v;
    }
    return out;
  }
  
  export function prettyFeats(feats, opts = {}) {
    const {
      // If false, hide noisy pipeline-y keys (InflClass, NumForm, etc.)
      showAll = false,
    } = opts;
  
    const obj = parseFeats(feats);
  
    const preferredOrder = [
      "Case",
      "Gender",
      "Number",
      "Person",
      "Tense",
      "Mood",
      "Voice",
      "VerbForm",
      "Degree",
      "PronType",
      "NumType",
    ];
  
    const hiddenByDefault = new Set([
      "InflClass",
      "InflClass[nominal]",
      "NumForm",
      "Form",
      "NumValue",
      "Poss",
      "Number[psor]",
      "Person[psor]",
    ]);
  
    const keys = Object.keys(obj);
    keys.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  
    const parts = [];
    for (const k of keys) {
      if (!showAll && hiddenByDefault.has(k)) continue;
  
      const v = obj[k];
      const mapped = (FEAT_VALUE[k] && FEAT_VALUE[k][v]) ? FEAT_VALUE[k][v] : null;
  
      // For common morph categories, we want the “mapped” lowercase string.
      // For unknown categories, show "Key=Value".
      if (mapped) {
        parts.push(mapped);
      } else {
        parts.push(`${k}=${v}`);
      }
    }
  
    return parts.join(" · ");
  }
  