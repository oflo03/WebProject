import CARDS from './cards.json' with { type: 'json' };
import MODE_SETS from './modes.json' with { type: 'json' };

export const TYPES = ['dragon', 'ghost', 'water', 'steel'];
export const RUN = 13;
export const MODES = ['easy', 'normal', 'hard'];

const byId = new Map(CARDS.map((c) => [c.id, c]));
// Full jokers (every type).
export const WILD = ['arceus', 'silvally'];
export const info = (card) => byId.get(card.key);

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Each mode is one fixed set of cards that splits exactly into runs of 13 (checked in build-data):
// easy 26 cards on 3 columns, normal 52 on 6, hard 104 on 10. Five deals from the stock in every mode.
export const BOARD = {
  easy: { cols: 3, deal: [4, 4, 3] },
  normal: { cols: 6, deal: [4, 4, 4, 4, 3, 3] },
  hard: { cols: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5] },
};

export function buildDeck(mode, rnd = Math.random) {
  let active = TYPES;
  let keys;
  if (mode === 'easy') {
    active = shuffle(['dragon', 'ghost'], rnd).slice(0, 1);
    keys = [...MODE_SETS.easy[active[0]], 'arceus'];
  } else if (mode === 'normal') {
    active = ['dragon', 'ghost'];
    keys = [...MODE_SETS.normal, 'arceus', 'silvally'];
  } else {
    keys = [...CARDS.filter((c) => !WILD.includes(c.id)).map((c) => c.id), ...WILD, ...WILD];
  }
  return { active, deck: shuffle(keys, rnd).map((key, uid) => ({ uid, key, up: false })) };
}

export function newGame(mode, rnd = Math.random) {
  const { active, deck } = buildDeck(mode, rnd);
  const cols = BOARD[mode].deal.map(() => []);
  let k = 0;
  cols.forEach((col, c) => {
    for (let i = 0; i < BOARD[mode].deal[c]; i++) col.push(deck[k++]);
    col[col.length - 1].up = true;
  });
  return { mode, active, cols, stock: deck.slice(k), done: [], goal: deck.length / RUN, moves: 0, last: [], dealt: false };
}

export const MAX_GAP = 20;

// Two real cards: strictly slower, by at most MAX_GAP. Equal speed counts as the same rank, so it never stacks.
export function canStack(below, above) {
  const gap = info(below).spd - info(above).spd;
  return gap > 0 && gap <= MAX_GAP;
}

const commonTypes = (cards) => cards.reduce((acc, c) => acc.filter((t) => info(c).types.includes(t)), TYPES);

const isWild = (c) => WILD.includes(c.key);

// Full jokers: a wild card goes under anything, and the next real card under it only has to be slower
// than the last real card above it (no gap limit across a wild).
function follows(ref, afterWild, c) {
  if (isWild(c) || ref == null) return true;
  const gap = ref - info(c).spd;
  return gap > 0 && (afterWild || gap <= MAX_GAP);
}

function chainOk(cards, ref = null, afterWild = false) {
  for (const c of cards) {
    if (!follows(ref, afterWild, c)) return false;
    if (isWild(c)) afterWild = true;
    else [ref, afterWild] = [info(c).spd, false];
  }
  return true;
}

// Speed context at the bottom of a column: last real card's speed, and whether wilds sit after it.
function tail(col) {
  let afterWild = false;
  for (let i = col.length - 1; i >= 0 && col[i].up; i--) {
    if (isWild(col[i])) afterWild = true;
    else return [info(col[i]).spd, afterWild];
  }
  return [null, afterWild];
}

export function isRun(cards) {
  if (!cards.length || cards.some((c) => !c.up)) return false;
  return chainOk(cards) && commonTypes(cards).length > 0;
}

export function canDrop(state, from, i, to) {
  if (from === to) return false;
  const run = state.cols[from].slice(i);
  if (!isRun(run)) return false;
  const dst = state.cols[to];
  if (!dst.length) return true;
  const [ref, afterWild] = tail(dst);
  return chainOk(run, ref, afterWild);
}

const flipTop = (col) => col.length && (col[col.length - 1].up = true);

function collect(s, c) {
  const col = s.cols[c];
  while (col.length >= RUN && isRun(col.slice(-RUN))) {
    const run = col.splice(-RUN);
    s.done.push(run);
    s.last.push(...run.map((x) => x.uid));
    flipTop(col);
  }
}

export function move(state, from, i, to) {
  const s = structuredClone(state);
  const run = s.cols[from].splice(i);
  s.cols[to].push(...run);
  s.last = run.map((c) => c.uid);
  s.dealt = false;
  flipTop(s.cols[from]);
  s.moves++;
  collect(s, to);
  return s;
}

export function deal(state) {
  const s = structuredClone(state);
  const cards = s.stock.splice(0, s.cols.length);
  cards.forEach((c, i) => {
    c.up = true;
    s.cols[i].push(c);
  });
  s.last = cards.map((c) => c.uid);
  s.dealt = true;
  s.moves++;
  for (let c = 0; c < s.cols.length; c++) collect(s, c);
  return s;
}

export const won = (s) => s.done.length === s.goal;

// Where a tap sends a run: same-type continuation first, then any legal card, then an empty column.
export function bestTarget(state, from, i) {
  const run = state.cols[from].slice(i);
  if (!isRun(run)) return -1;
  let best = -1;
  let bestScore = -Infinity;
  state.cols.forEach((col, c) => {
    if (c === from) return;
    const top = col.at(-1);
    let score;
    if (!canDrop(state, from, i, c)) return;
    if (!top) score = i === 0 ? -Infinity : 1000;
    else score = (isRun([top, ...run]) ? 3000 : 2000) - Math.abs(info(top).spd - info(run[0]).spd) / 10;
    if (score > bestScore) [best, bestScore] = [c, score];
  });
  return best;
}
