// Vocab Trainer v0.2 (Phase 1 Nodes 2–7)
// Random helpers

export function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  
  export function sampleWithoutReplacement(items, n) {
    if (n <= 0) return [];
    const pool = items.slice();
    const out = [];
    while (pool.length && out.length < n) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }
  