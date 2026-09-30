// Strong bot: beam search over whole-game states, like a player who explores many lines with undo.
// It sees face-down cards and the stock order, so its win rate is an upper bound on what is winnable.
// Usage: node scripts/solve.mjs [deals=30] [beam=300] [mode]
const R = await import(process.env.RULES ?? '../src/rules.js');
const { MODES, MAX_GAP, RUN, TYPES, info, newGame } = R;

const deals = +(process.argv[2] ?? 30);
const BEAM = +(process.argv[3] ?? 300);
const only = process.argv[4];
const MAX_DEPTH = 1500;

// Fast state: columns of card indices with a face-down count, stock as index list.
function encode(g) {
  const cards = [...g.cols.flat(), ...g.stock].map((c) => info(c));
  const idx = new Map();
  [...g.cols.flat(), ...g.stock].forEach((c, i) => idx.set(c.uid, i));
  const spd = cards.map((c) => c.spd);
  const mask = cards.map((c) => TYPES.reduce((m, t, k) => (c.types.includes(t) ? m | (1 << k) : m), 0));
  const state = {
    cols: g.cols.map((col) => col.map((c) => idx.get(c.uid))),
    down: g.cols.map((col) => col.filter((c) => !c.up).length),
    stock: g.stock.map((c) => idx.get(c.uid)),
    done: 0,
  };
  return { spd, mask, state, goal: g.goal };
}

function solve({ spd, mask, state, goal }) {
  const stack = (a, b) => {
    const gap = spd[a] - spd[b];
    return gap > 0 && gap <= MAX_GAP;
  };
  // Length of the movable run at the top of a column (face-up, stacking, one shared type).
  const topRun = (col, down) => {
    let n = 1;
    let m = mask[col.at(-1)];
    for (let i = col.length - 2; i >= down; i--) {
      if (!stack(col[i], col[i + 1]) || !(m & mask[col[i]])) break;
      m &= mask[col[i]];
      n++;
    }
    return n;
  };
  const collect = (s, c) => {
    const col = s.cols[c];
    while (col.length - s.down[c] >= RUN && topRun(col, s.down[c]) >= RUN) {
      col.splice(-RUN);
      s.done++;
      if (s.down[c] && s.down[c] === col.length) s.down[c]--;
    }
  };
  const key = (s) => s.cols.map((col, c) => `${s.down[c]}:${col.join(',')}`).join('|') + `#${s.stock.length}`;
  const score = (s) => {
    let v = s.done * 1000 - s.down.reduce((a, b) => a + b, 0) * 25 - s.stock.length * 2;
    s.cols.forEach((col, c) => {
      if (!col.length) return (v += 30);
      const run = topRun(col, s.down[c]);
      v += run * run * 0.6;
      for (let i = s.down[c] + 1; i < col.length; i++) v += stack(col[i - 1], col[i]) && mask[col[i - 1]] & mask[col[i]] ? 3 : -5;
    });
    return v;
  };
  const children = (s) => {
    const out = [];
    s.cols.forEach((col, c) => {
      if (!col.length) return;
      const len = topRun(col, s.down[c]);
      for (let k = 1; k <= len; k++) {
        const i = col.length - k;
        const head = col[i];
        const seated = i > s.down[c] && stack(col[i - 1], head) && mask[col[i - 1]] & mask[head];
        s.cols.forEach((dst, d) => {
          if (d === c) return;
          const top = dst.at(-1);
          if (top === undefined) {
            if (i === 0 || seated) return;
          } else if (!stack(top, head)) return;
          const n = { cols: s.cols.slice(), down: s.down.slice(), stock: s.stock, done: s.done };
          n.cols[c] = col.slice(0, i);
          n.cols[d] = dst.concat(col.slice(i));
          if (n.down[c] && n.down[c] === n.cols[c].length) n.down[c]--;
          collect(n, d);
          out.push(n);
        });
      }
    });
    if (s.stock.length) {
      const k = s.cols.length;
      const n = { cols: s.cols.map((col, c) => col.concat(s.stock[c])), down: s.down.slice(), stock: s.stock.slice(k), done: s.done };
      n.cols.forEach((_, c) => collect(n, c));
      out.push(n);
    }
    return out;
  };

  const seen = new Set([key(state)]);
  let beam = [state];
  let best = 0;
  let bestScore = -Infinity;
  let stale = 0;
  const STALE = 12; // layers without a better score before the bot deals from the stock
  for (let depth = 0; depth < MAX_DEPTH && beam.length; depth++) {
    const forceDeal = stale >= STALE && beam[0].stock.length;
    const next = [];
    for (const s of beam) {
      const kids = forceDeal ? children(s).slice(-1).filter((n) => n.stock.length < s.stock.length) : children(s);
      for (const n of kids) {
        if (n.done === goal) return { won: true, runs: goal, depth: depth + 1 };
        const k = key(n);
        if (seen.has(k)) continue;
        seen.add(k);
        n.sc = score(n);
        next.push(n);
      }
    }
    next.sort((a, b) => b.sc - a.sc);
    beam = next.slice(0, BEAM);
    if (!beam.length) break;
    for (const s of beam) best = Math.max(best, s.done);
    if (beam[0].sc > bestScore) {
      bestScore = beam[0].sc;
      stale = 0;
    } else stale++;
    if (forceDeal) {
      bestScore = beam[0].sc;
      stale = 0;
    }
    if (seen.size > 3e6) seen.clear();
    if (process.env.TRACE && depth % 25 === 0) console.log(depth, beam.length, best, seen.size, beam[0].stock.length, beam[0].down.reduce((a, b) => a + b, 0));
  }
  return { won: false, runs: best };
}

for (const mode of only ? [only] : MODES) {
  const t0 = Date.now();
  const res = Array.from({ length: deals }, () => solve(encode(newGame(mode))));
  const wins = res.filter((r) => r.won).length;
  const avgRuns = (res.reduce((a, r) => a + r.runs, 0) / deals).toFixed(1);
  console.log(`${mode.padEnd(6)} winnable ${Math.round((wins / deals) * 100)}% (${wins}/${deals}) | avg best runs ${avgRuns} | ${((Date.now() - t0) / deals / 1000).toFixed(1)}s/deal`);
}
