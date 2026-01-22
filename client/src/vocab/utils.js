// src/vocab/utils.js
// Small utilities used by VocabTrainer.jsx.
// This file exists because VocabTrainer imports "./utils".

export function shuffle(arr) {
    const a = Array.isArray(arr) ? [...arr] : [];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }
  
  export function sampleWithoutReplacement(arr, n) {
    const a = shuffle(arr);
    return a.slice(0, Math.max(0, Math.min(n ?? 0, a.length)));
  }
  
  export function slugify(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  
  export function formatTime(ms) {
    const m = Math.max(0, Math.floor((ms ?? 0) / 1000));
    const minutes = Math.floor(m / 60);
    const seconds = m % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  