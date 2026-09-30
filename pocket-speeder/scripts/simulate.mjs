// Plays many games with a simple greedy bot to gauge difficulty per mode.
// Usage: node scripts/simulate.mjs [games=200]
// The bot is weaker than a careful human with undo: treat win rates as a lower bound and compare modes.
const { MODES, canDrop, deal, info, isRun, move, newGame, won } = await import(process.env.RULES ?? '../src/rules.js');

const legalMoves = (s) => {
  const out = [];
  s.cols.forEach((col, c) => {
    for (let i = col.length - 1; i >= 0; i--) {
      if (!col[i].up || !isRun(col.slice(i))) break;
      for (let d = 0; d < s.cols.length; d++) if (canDrop(s, c, i, d)) out.push({ c, i, d });
    }
  });
  return out;
};

function score(s, { c, i, d }) {
  const col = s.cols[c];
  const run = col.slice(i);
  const below = col[i - 1];
  const target = s.cols[d].at(-1);
  const seated = below?.up && isRun([below, ...run]);
  if (!target && (i === 0 || seated)) return -Infinity; // pointless shuffles into empty columns
  let sc = 0;
  if (below && !below.up) sc += 50; // reveals a card
  if (i === 0) sc += 25; // empties a column
  if (target) {
    const joins = isRun([target, ...run]);
    sc += joins ? 20 : 4;
    if (seated) sc -= joins ? 12 : 40; // breaking a good stack needs a reason
    sc -= (info(target).spd - info(run[0]).spd) / 4;
    const combined = [...s.cols[d], ...run];
    if (combined.length >= 13 && isRun(combined.slice(-13))) sc += 1000;
  } else sc -= 8;
  return sc;
}

const key = (s) => s.cols.map((col) => col.map((c) => `${c.uid}${c.up ? '' : 'd'}`).join('.')).join('|');

function play(mode) {
  let s = newGame(mode);
  const seen = new Set([key(s)]);
  let choices = 0;
  let decisions = 0;
  for (let step = 0; step < 3000 && !won(s); step++) {
    const moves = legalMoves(s);
    decisions++;
    choices += moves.length;
    const ranked = moves.map((m) => ({ m, sc: score(s, m) })).filter((x) => x.sc > -Infinity).sort((a, b) => b.sc - a.sc);
    let next = null;
    for (const { m, sc } of ranked) {
      if (sc <= 0 && s.stock.length) break;
      const t = move(s, m.c, m.i, m.d);
      if (!seen.has(key(t))) {
        next = t;
        break;
      }
    }
    if (!next && s.stock.length) next = deal(s);
    if (!next) break;
    s = next;
    seen.add(key(s));
  }
  return { won: won(s), runs: s.done.length, moves: s.moves, deals: 5 - s.stock.length / s.cols.length, choices: choices / decisions };
}

const games = +(process.argv[2] ?? 200);
for (const mode of MODES) {
  const res = Array.from({ length: games }, () => play(mode));
  const avg = (f) => (res.reduce((a, r) => a + f(r), 0) / res.length).toFixed(1);
  const runsHist = Array.from({ length: 9 }, (_, n) => res.filter((r) => r.runs === n).length);
  console.log(
    `${mode.padEnd(6)} win ${((res.filter((r) => r.won).length / games) * 100).toFixed(0)}% | avg runs ${avg((r) => r.runs)} | moves ${avg((r) => r.moves)} | legal moves per turn ${avg((r) => r.choices)} | runs 0..8: ${runsHist.join(' ')}`,
  );
}
