// Can a deck be split into 8 runs of 13 (one shared type, each step slower by 1..MAX_GAP)?
// If not, that deck can never be fully cleared no matter how it is played.
// Approach: decide which type each flexible card (dual-type joker, Arceus) plays for, then check
// each type's pile separately: can it be cut into m descending chains of 13?
const { buildDeck, info, MAX_GAP, MODES, RUN, TYPES } = await import(process.env.RULES ?? '../src/rules.js');

// Randomised greedy with restarts: a run that cannot reach the next slower speed must take this card now.
// Finding one split proves the pile works; failing proves nothing (the exact search runs next).
function greedyChains(sorted, tries = 3000) {
  const m = sorted.length / RUN;
  const nextLower = sorted.map((s, k) => sorted.slice(k).find((x) => x < s) ?? -Infinity);
  for (let t = 0; t < tries; t++) {
    const runs = [];
    let ok = true;
    for (let k = 0; k < sorted.length && ok; k++) {
      const s = sorted[k];
      const open = runs.filter((r) => r.n < RUN && r.last - s > 0 && r.last - s <= MAX_GAP);
      const urgent = open.filter((r) => r.last - nextLower[k] > MAX_GAP);
      let r;
      if (urgent.length) r = urgent[Math.floor(Math.random() * urgent.length)];
      else {
        const canOpen = runs.length < m;
        const pick = Math.floor(Math.random() * (open.length + (canOpen ? 1 : 0)));
        r = open[pick];
        if (!r && canOpen) runs.push((r = { last: 0, n: 0 }));
      }
      if (!r) ok = false;
      else Object.assign(r, { last: s, n: r.n + 1 });
      // A run that can never grow again but is short is dead.
      if (ok && runs.some((x) => x.n < RUN && x.last - nextLower[k] > MAX_GAP && x !== r)) ok = false;
    }
    if (ok && runs.length === m && runs.every((r) => r.n === RUN)) return true;
  }
  return false;
}

const chainMemo = new Map();
function canChains(speeds) {
  if (speeds.length % RUN) return false;
  const sorted = [...speeds].sort((a, b) => b - a);
  const memoKey = sorted.join(',');
  if (chainMemo.has(memoKey)) return chainMemo.get(memoKey);
  if (greedyChains(sorted)) {
    chainMemo.set(memoKey, true);
    return true;
  }
  const runs = Array.from({ length: sorted.length / RUN }, () => ({ last: 0, n: 0 }));
  const failed = new Set();
  let steps = 0;
  function go(k) {
    if (++steps > 300000) throw new Error('budget');
    if (k === sorted.length) return true;
    const s = sorted[k];
    if (runs.some((r) => r.n > 0 && r.n < RUN && r.last - s > MAX_GAP)) return false;
    const key = `${k}|${runs.map((r) => `${r.last}.${r.n}`).sort().join(',')}`;
    if (failed.has(key)) return false;
    const seen = new Set();
    // Try extending the tightest open run first, then opening a new run.
    const opts = runs
      .filter((r) => r.n < RUN && (!r.n || (r.last - s > 0 && r.last - s <= MAX_GAP)))
      .sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || a.last - b.last);
    for (const r of opts) {
      const sig = `${r.last}.${r.n}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const saved = { ...r };
      Object.assign(r, { last: s, n: r.n + 1 });
      if (go(k + 1)) return true;
      Object.assign(r, saved);
    }
    failed.add(key);
    return false;
  }
  let ok;
  try {
    ok = go(0);
  } catch {
    ok = null; // search budget ran out: unknown
  }
  chainMemo.set(memoKey, ok);
  return ok;
}

// Every way to hand each flexible card to one of its types, then check each type's pile.
export function partition(deck) {
  const cards = deck.map((c) => info(c));
  const fixed = Object.fromEntries(TYPES.map((t) => [t, []]));
  const flex = [];
  for (const c of cards) {
    const live = c.types;
    if (live.length === 1) fixed[live[0]].push(c.spd);
    else flex.push(c);
  }
  const piles = Object.fromEntries(TYPES.map((t) => [t, [...fixed[t]]]));
  const used = TYPES.filter((t) => fixed[t].length || flex.some((f) => f.types.includes(t)));
  function go(i) {
    if (i === flex.length) return used.every((t) => canChains(piles[t]));
    // Prune: a pile that already has too many cards for a whole number of runs within what is left.
    for (const t of flex[i].types) {
      if (!used.includes(t)) continue;
      piles[t].push(flex[i].spd);
      if (go(i + 1)) return true;
      piles[t].pop();
    }
    return false;
  }
  // Group identical flexible cards so the search does not repeat symmetric choices.
  flex.sort((a, b) => a.id.localeCompare(b.id));
  return goGrouped(flex, piles, used);
}

function goGrouped(flex, piles, used) {
  const groups = [];
  for (const f of flex) {
    const g = groups.at(-1);
    if (g && g.card.id === f.id) g.n++;
    else groups.push({ card: f, n: 1 });
  }
  function go(gi) {
    if (gi === groups.length) return used.every((t) => canChains(piles[t]) !== false) && used.every((t) => canChains(piles[t]));
    const { card, n } = groups[gi];
    const ts = card.types.filter((t) => used.includes(t));
    // Distribute n identical copies over the allowed types.
    function split(ti, left) {
      if (ti === ts.length - 1) {
        for (let k = 0; k < left; k++) piles[ts[ti]].push(card.spd);
        const ok = go(gi + 1);
        for (let k = 0; k < left; k++) piles[ts[ti]].pop();
        return ok;
      }
      for (let k = 0; k <= left; k++) {
        for (let j = 0; j < k; j++) piles[ts[ti]].push(card.spd);
        const ok = split(ti + 1, left - k);
        for (let j = 0; j < k; j++) piles[ts[ti]].pop();
        if (ok) return true;
      }
      return false;
    }
    return split(0, n);
  }
  return go(0);
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
if (process.argv[1].endsWith("check-solvable.mjs")) for (const mode of process.argv[2] ? [process.argv[2]] : MODES) {
  const trials = mode === 'hard' ? 1 : 20;
  let ok = 0;
  const t0 = Date.now();
  for (let i = 0; i < trials; i++) ok += partition(buildDeck(mode, rnd).deck) ? 1 : 0;
  console.log(`${mode}: ${ok}/${trials} decks can be fully cleared in theory (${Date.now() - t0}ms)`);
}
