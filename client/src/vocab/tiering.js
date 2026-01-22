// client/src/vocab/tiering.js
// Tiering v3 — Easier early game, growing requirements later.
// Also keeps 2.5 pts / correct via pointsFromRaw().

export function pointsFromRaw(correctCount) {
  const n = Number(correctCount) || 0;
  return Math.max(0, Math.round(n * 2.5)); // ≈2.5 per correct
}

/**
 * describeRankByPoints(totalPoints)
 * Returns a descriptor for the UI: current tier/level and progress to next.
 */
export function describeRankByPoints(totalPoints) {
  const pts = Math.max(0, Math.floor(Number(totalPoints) || 0));
  const plan = BUILD_STEPS();

  let stepIndex = 0;
  for (let i = 0; i < plan.length; i++) {
    if (pts >= plan[i].threshold) stepIndex = i;
    else break;
  }
  const cur   = plan[stepIndex];
  const atCap = stepIndex === plan.length - 1;
  const next  = atCap ? cur : plan[stepIndex + 1];

  const intoNext = pts - cur.threshold;
  const nextNeed = atCap ? 0 : (next.threshold - cur.threshold);
  const toNext   = atCap ? 0 : (next.threshold - pts);

  return {
    tierId: cur.tier.id,
    tierName: cur.tier.name,
    levelIndex: cur.levelIndex, // 1..3 for multi-level tiers; 0 for 'deus'
    icon: cur.tier.icon,
    mastery: cur.tier.mastery,
    atCap, intoNext, nextNeed, toNext,
    nextTierName: next.tier.name,
    nextLevelName: next.levelLabel,
    stepIndex,
  };
}

// === Internal: rank curve ====================================================
//
// Each step has a cumulative threshold. Moving to next step requires the delta
// between thresholds. Targets (approximate):
//  - Early tiers ~90 points per level
//  - "Rex" levels ~300 each
//  - Final jump to "Deus": +500
//
// Points come from pointsFromRaw(), i.e. ~2.5 per correct.
//
// Latin tier names:
//  - Lapis (stone)        🪨
//  - Aes (bronze)         🥉
//  - Argentum (silver)    🥈
//  - Aurum (gold)         🥇
//  - Platina (platinum)   🛡️
//  - Adamas (diamond)     💎
//  - Magister (master)    🧠
//  - Archimagister        🧙‍♂️
//  - Rex (king)           👑
//  - Deus (god)           ⚡️ (single cap step after +500)

function BUILD_STEPS() {
  const TIERS = [
    //            name            icon   mastery blurb                per-level requirements
    { id: "lapis",         name: "Lapis",         icon: "🪨", mastery: "Novicius (Beginner)",        reqs: [ 90,  90,  90] },
    { id: "aes",           name: "Aes",           icon: "🥉", mastery: "Fundamenta (Basics)",        reqs: [ 90,  90,  90] },
    { id: "argentum",      name: "Argentum",      icon: "🥈", mastery: "Progressus (Rising)",        reqs: [110, 110, 110] },
    { id: "aurum",         name: "Aurum",         icon: "🥇", mastery: "Firmus (Solid)",             reqs: [140, 140, 140] },
    { id: "platina",       name: "Platina",       icon: "🛡️", mastery: "Praestans (Excellent)",     reqs: [170, 170, 170] },
    { id: "adamas",        name: "Adamas",        icon: "💎", mastery: "Praeclarus (Elite)",         reqs: [200, 200, 200] },
    { id: "magister",      name: "Magister",      icon: "🧠", mastery: "Peritus (Master)",           reqs: [230, 230, 230] },
    { id: "archimagister", name: "Archimagister", icon: "🧙‍♂️", mastery: "Praeceptor (Grandmaster)", reqs: [260, 260, 260] },
    { id: "rex",           name: "Rex",           icon: "👑", mastery: "Princeps (Sovereign)",       reqs: [300, 300, 300] },
    // Deus is a single cap after an extra +500 beyond Rex III
  ];

  const steps = [];
  let cumulative = 0;

  for (const tier of TIERS) {
    for (let i = 0; i < tier.reqs.length; i++) {
      steps.push({
        tier,
        levelIndex: i + 1,
        levelLabel: roman(i + 1),
        threshold: cumulative,
      });
      cumulative += tier.reqs[i];
    }
  }

  // Final jump to Deus (+500 beyond Rex III)
  const deus = { id: "deus", name: "Deus", icon: "⚡️", mastery: "Summum (Legend)" };
  cumulative += 500; // last climb
  steps.push({
    tier: deus,
    levelIndex: 0,
    levelLabel: "—",
    threshold: cumulative,
  });

  return steps;
}

function roman(n) { return ["", "I", "II", "III"][n] || ""; }
