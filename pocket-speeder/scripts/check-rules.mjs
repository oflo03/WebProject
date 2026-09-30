import assert from 'node:assert/strict';
import { buildDeck, newGame, canStack, isRun, canDrop, move, deal, info, MODES } from '../src/rules.js';

const card = (key, up = true) => ({ uid: Math.random(), key, up });
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const SIZE = { easy: [26, 1, 0, 3], normal: [52, 1, 1, 6], hard: [104, 2, 2, 10] }; // cards, arceus, silvally, columns
for (const mode of MODES) {
  const [size, arceus, silvally, cols] = SIZE[mode];
  const { deck } = buildDeck(mode, rnd);
  assert.equal(deck.length, size, mode);
  assert.equal(deck.filter((c) => c.key === 'arceus').length, arceus, mode);
  assert.equal(deck.filter((c) => c.key === 'silvally').length, silvally, mode);
  const counts = Object.values(Object.groupBy(deck, (c) => c.key)).map((g) => g.length);
  assert.ok(counts.every((n) => n === 1 || (mode === 'hard' && n === 2)), mode); // no repeats except hard's jokers
  const g = newGame(mode, rnd);
  assert.equal(g.cols.length, cols);
  assert.equal(g.stock.length, cols * 5, mode); // five deals in every mode
  assert.equal(g.goal, size / 13);
}

for (let k = 0; k < 20; k++) {
  const easy = buildDeck('easy', rnd).active;
  assert.ok(easy.length === 1 && ['dragon', 'ghost'].includes(easy[0]));
  assert.deepEqual(buildDeck('normal', rnd).active, ['dragon', 'ghost']);
}

const g = newGame('hard', rnd);
assert.equal(g.cols.flat().length, 54);
assert.equal(g.stock.length, 50);
assert.ok(g.cols.every((col) => col.at(-1).up && col.slice(0, -1).every((c) => !c.up)));

// Strictly slower by 1..20; equal speed never stacks.
assert.ok(canStack(card('dragapult'), card('koraidon'))); // 142 -> 135
assert.ok(!canStack(card('koraidon'), card('dragapult')));
assert.ok(!canStack(card('dragapult'), card('giratina'))); // gap 52
assert.ok(canStack(card('garchomp'), card('eternatus')) === false); // faster on slower
assert.ok(canStack(card('latios'), card('garchomp'))); // 110 -> 102
assert.ok(!canStack(card('giratina'), card('dialga')) && !canStack(card('giratina'), card('giratina')));
assert.ok(canStack(card('palkia'), card('dialga')) && !canStack(card('palkia'), card('dracovish'))); // gap 10, gap 25

// Arceus/Silvally are full jokers: any gap across them, but the real cards around them still go down.
assert.ok(isRun([card('gholdengo'), card('arceus'), card('jellicent')])); // 84 > * > 60
assert.ok(!isRun([card('jellicent'), card('arceus'), card('gholdengo')])); // 60 > * > 84
assert.ok(isRun([card('koraidon'), card('silvally'), card('arceus'), card('dracovish')])); // two jokers in a row
assert.ok(!isRun([card('gholdengo'), card('jellicent')])); // gap 24 without a joker
{
  const w = { ...newGame('hard', rnd), cols: Array.from({ length: 10 }, () => []) };
  w.cols[0] = [card('koraidon'), card('arceus')];
  w.cols[1] = [card('dracovish')]; // 75 under Arceus: must only be slower than 135
  w.cols[2] = [card('dragapult')]; // 142 under Arceus: faster than 135, not allowed
  w.cols[3] = [card('silvally')];
  assert.ok(canDrop(w, 1, 0, 0) && !canDrop(w, 2, 0, 0));
  assert.ok(canDrop(w, 3, 0, 1) && canDrop(w, 3, 0, 2)); // a joker goes under anything
}

// Bundles need a shared type; Arceus and dual-type jokers bridge.
assert.ok(isRun([card('koraidon'), card('eternatus')]));
assert.ok(isRun([card('basculegion'), card('jellicent')])); // share ghost+water, 78 -> 60
assert.ok(!isRun([card('dialga'), card('dragonite'), card('jellicent')])); // 90 -> 80 dragon, jellicent shares none
assert.ok(isRun([card('arceus'), card('palkia')]) && isRun([card('arceus'), card('dialga')])); // no gap limit under a joker
assert.ok(!isRun([card('dragapult', false), card('koraidon')]));

// A column finishing with 13 same-type cards in order is cleared and the card under it flips.
const dragons = ['dragapult', 'koraidon', 'eternatus', 'noivern', 'latios', 'garchomp', 'hydreigon', 'giratina', 'archaludon', 'dragonite', 'dracovish', 'tyrantrum', 'fraxure'];
assert.equal(new Set(dragons.map((k) => info({ key: k })?.types.includes('dragon'))).has(false), false);
const s = { ...newGame('hard', rnd), cols: Array.from({ length: 10 }, () => []) };
s.cols[0] = [card('palkia', false), ...dragons.slice(0, 12).map((k) => card(k))];
s.cols[1] = [card('fraxure')];
assert.ok(canDrop(s, 1, 0, 0));
const after = move(s, 1, 0, 0);
assert.equal(after.done.length, 1);
assert.equal(after.cols[0].length, 1);
assert.ok(after.cols[0][0].up);

// Dealing puts one face-up card on every column.
const d = deal(g);
assert.equal(d.stock.length, 40);
assert.ok(d.cols.every((col, i) => col.length === g.cols[i].length + 1 && col.at(-1).up));
console.log('rules ok');
