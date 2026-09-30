// Builds the 28-per-type card roster from pocket-kinship's cached PokeAPI data plus Smogon usage stats.
// Rules: fixed dual-type jokers; no other mon with two of the four game types; speed buckets of 10
// (140+ is one bucket) get 2 each where possible (1 if the pool is thin), topped up or trimmed to 28;
// priority = fully evolved, then usage; no speed shared within a type (wild cards included) except joker-joker pairs.
import fs from 'node:fs';

const CACHE = new URL('../../pocket-kinship/data/.cache/', import.meta.url);
// VARIANT=dir writes the game data (and nothing else) into src/<dir>/ for side-by-side testing.
const SRC = new URL(process.env.VARIANT ? `../src/${process.env.VARIANT}/` : '../src/', import.meta.url);
const OUT = process.env.VARIANT ? SRC : new URL('../data/', import.meta.url);
if (process.env.VARIANT) fs.mkdirSync(SRC, { recursive: true });
const USAGE = new URL('../data/usage-gen9nationaldex-2026-08.txt', import.meta.url);
const TYPES = ['dragon', 'ghost', 'water', 'steel'];
const PER_TYPE = 28;
const MAX_SAME_SPEED = 2;
// Full jokers: every type, two copies each in the deck.
const WILD = ['arceus', 'silvally'];

const JOKERS = {
  giratina: ['dragon', 'ghost'], dragapult: ['dragon', 'ghost'],
  palkia: ['dragon', 'water'], dracovish: ['dragon', 'water'],
  dialga: ['dragon', 'steel'], archaludon: ['dragon', 'steel'],
  jellicent: ['ghost', 'water'], basculegion: ['ghost', 'water'],
  aegislash: ['ghost', 'steel'], gholdengo: ['ghost', 'steel'],
  empoleon: ['water', 'steel'], golisopod: ['water', 'steel'], // golisopod: house rule, really bug/water
};

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, CACHE), 'utf8'));
const idOf = (url) => +url.match(/\/(\d+)\/$/)[1];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const usage = new Map();
for (const line of fs.readFileSync(USAGE, 'utf8').split('\n')) {
  const m = line.match(/^\| \d+\s+\| (.+?)\s+\| +([\d.]+)%/);
  if (m) usage.set(norm(m[1]), +m[2]);
}

const findNode = (node, name) => (node.species.name === name ? node : node.evolves_to.map((n) => findNode(n, name)).find(Boolean));

const mons = [];
for (const f of fs.readdirSync(CACHE).filter((f) => f.startsWith('_pokemon-species_') && !f.includes('limit'))) {
  const sp = read(f);
  const p = read(`_pokemon_${sp.varieties.find((v) => v.is_default).pokemon.name}.json`);
  const en = sp.names.find((n) => n.language.name === 'en')?.name ?? sp.name;
  mons.push({
    id: sp.name,
    pid: sp.id,
    name: { ko: sp.names.find((n) => n.language.name === 'ko')?.name ?? en, en },
    spd: p.stats.find((s) => s.stat.name === 'speed').base_stat,
    realTypes: p.types.map((t) => t.type.name),
    final: !findNode(read(`_evolution-chain_${idOf(sp.evolution_chain.url)}.json`).chain, sp.name).evolves_to.length,
    usage: usage.get(norm(en)) ?? 0,
  });
}
const byId = new Map(mons.map((m) => [m.id, m]));
const bucketOf = (spd) => Math.min(Math.floor(spd / 10), 14);
const better = (a, b) => b.final - a.final || b.usage - a.usage || a.pid - b.pid;
// Hand-picked swaps after selection: Applin (20) left a lone card at the bottom of dragon; Guzzlord (43) tightens it.
const SWAPS = { applin: 'guzzlord' };

const jokers = Object.entries(JOKERS).map(([id, types]) => ({ ...byId.get(id), types }));
const roster = {};
for (const t of TYPES) {
  const fixed = jokers.filter((j) => j.types.includes(t));
  const pool = mons
    .filter((m) => !JOKERS[m.id] && !WILD.includes(m.id) && m.realTypes.filter((x) => TYPES.includes(x)).join() === t)
    .map((m) => ({ ...m, types: [t] }))
    .sort(better);
  const picked = [...fixed];
  const speedCount = (spd) => picked.filter((m) => m.spd === spd).length;
  const inBucket = (b) => picked.filter((m) => bucketOf(m.spd) === b);
  const nextFor = (b) => pool.find((m) => bucketOf(m.spd) === b && !picked.includes(m) && speedCount(m.spd) < MAX_SAME_SPEED);

  for (let b = 0; b <= 14; b++) while (inBucket(b).length < 2 && nextFor(b)) picked.push(nextFor(b));

  // Too many: drop the weakest non-joker from a bucket that still keeps at least one card.
  while (picked.length > PER_TYPE) {
    const drop = picked
      .filter((m) => !JOKERS[m.id] && inBucket(bucketOf(m.spd)).length > 1)
      .sort(better)
      .at(-1);
    picked.splice(picked.indexOf(drop), 1);
  }
  // Too few: give the best remaining candidate a third slot in its bucket.
  while (picked.length < PER_TYPE) {
    const add = Array.from({ length: 15 }, (_, b) => (inBucket(b).length < 3 ? nextFor(b) : null)).filter(Boolean).sort(better)[0];
    if (!add) throw new Error(`${t}: not enough candidates`);
    picked.push(add);
  }
  // No two cards share a speed within a type (wild cards included), except joker-joker pairs:
  // a non-joker in a tie is swapped for the best unused-speed candidate, same speed bucket first, then the nearest.
  {
    const wilds = WILD.map((id) => ({ ...byId.get(id), wild: true }));
    for (;;) {
      const all = [...picked, ...wilds];
      const tie = Object.values(Object.groupBy(all, (m) => m.spd)).find((g) => g.length > 1 && g.some((m) => !JOKERS[m.id] && !m.wild));
      if (!tie) break;
      const out = tie.filter((m) => !JOKERS[m.id] && !m.wild).sort(better).at(-1);
      const used = new Set(all.map((m) => m.spd));
      const dist = (m) => Math.abs(bucketOf(m.spd) - bucketOf(out.spd));
      const pick = pool.filter((m) => !picked.includes(m) && !used.has(m.spd)).sort((a, b) => dist(a) - dist(b) || better(a, b))[0];
      picked.splice(picked.indexOf(out), 1, pick);
    }
  }
  for (const [from, to] of Object.entries(SWAPS)) {
    const i = picked.findIndex((m) => m.id === from);
    if (i >= 0) picked[i] = { ...byId.get(to), types: [t] };
  }
  roster[t] = picked.sort((a, b) => b.spd - a.spd);
}

const cards = [
  ...new Map(TYPES.flatMap((t) => roster[t]).map((m) => [m.id, { id: m.id, pid: m.pid, name: m.name, spd: m.spd, types: m.types }])).values(),
  ...WILD.map((id) => (({ pid, name, spd }) => ({ id, pid, name, spd, types: TYPES }))(byId.get(id))),
];
if (cards.length !== 102) throw new Error(`expected 102 unique cards, got ${cards.length}`);

// ---- Smaller decks: easy = one type (25 + Arceus = 26 cards), normal = dragon + ghost (50 + Arceus + Silvally = 52).
// Cards are dropped from the most crowded speed buckets (lowest usage first, jokers last), and the rest must
// still split exactly into runs of 13 so every deck can be cleared.
const RUN = 13;
const MAX_GAP = 20;

function splits(cards, live) {
  const sorted = [...cards].sort((a, b) => b.spd - a.spd);
  const runs = Array.from({ length: sorted.length / RUN }, () => ({ type: null, last: 0, n: 0 }));
  const failed = new Set();
  const go = (k) => {
    if (k === sorted.length) return true;
    const c = sorted[k];
    if (runs.some((r) => r.n && r.n < RUN && r.last - c.spd > MAX_GAP)) return false;
    const key = `${k}|${runs.map((r) => `${r.type}${r.last}.${r.n}`).sort()}`;
    if (failed.has(key)) return false;
    const tried = new Set();
    for (const r of runs) {
      if (r.n === RUN) continue;
      for (const t of r.n ? [r.type] : c.types.filter((x) => live.includes(x))) {
        if (!c.types.includes(t) || (r.n && !(r.last - c.spd > 0 && r.last - c.spd <= MAX_GAP))) continue;
        const sig = `${t}${r.last}.${r.n}`;
        if (tried.has(sig)) continue;
        tried.add(sig);
        const saved = { ...r };
        Object.assign(r, { type: t, last: c.spd, n: r.n + 1 });
        if (go(k + 1)) return true;
        Object.assign(r, saved);
      }
    }
    failed.add(key);
    return false;
  };
  return sorted.length % RUN === 0 && go(0);
}

function trim(pool, drop, wilds, live) {
  const bucketSize = (set, m) => set.filter((x) => bucketOf(x.spd) === bucketOf(m.spd)).length;
  const order = (set) =>
    [...set].sort((a, b) => bucketSize(set, b) - bucketSize(set, a) || !!JOKERS[a.id] - !!JOKERS[b.id] || a.usage - b.usage || b.pid - a.pid);
  const go = (set, left) => {
    if (!left) return splits([...set, ...wilds], live) ? set : null;
    const top = bucketSize(set, order(set)[0]);
    for (const m of order(set).filter((x) => bucketSize(set, x) === top)) {
      const hit = go(set.filter((x) => x !== m), left - 1);
      if (hit) return hit;
    }
    return null;
  };
  const kept = go(pool, drop);
  if (!kept) throw new Error(`no clearable trim for ${live}`);
  return kept;
}

const wildCard = (id) => ({ ...byId.get(id), types: TYPES });
const modes = { easy: {}, normal: [] };
for (const t of ['dragon', 'ghost']) {
  const kept = trim(roster[t].map((m) => ({ ...m, types: [t] })), 3, [wildCard('arceus')], [t]);
  modes.easy[t] = kept.sort((a, b) => b.spd - a.spd).map((m) => m.id);
  console.log(`easy ${t} dropped:`, roster[t].filter((m) => !modes.easy[t].includes(m.id)).map((m) => `${m.name.ko}(${m.spd})`).join(', '));
}
{
  const live = ['dragon', 'ghost'];
  const union = [...new Map([...roster.dragon, ...roster.ghost].map((m) => [m.id, m])).values()].map((m) => ({
    ...m,
    types: (JOKERS[m.id] ?? m.types).filter((x) => live.includes(x)),
  }));
  const kept = trim(union, 4, [wildCard('arceus'), wildCard('silvally')], live);
  modes.normal = kept.sort((a, b) => b.spd - a.spd).map((m) => m.id);
  console.log('normal dropped:', union.filter((m) => !modes.normal.includes(m.id)).map((m) => `${m.name.ko}(${m.spd})`).join(', '));
}
fs.writeFileSync(new URL('modes.json', SRC), JSON.stringify(modes));

fs.writeFileSync(
  new URL('roster.json', OUT),
  JSON.stringify(Object.fromEntries(TYPES.map((t) => [t, roster[t].map(({ id, name, spd, final, usage }) => ({ id, ko: name.ko, spd, joker: !!JOKERS[id], final, usage }))])), null, 1),
);
fs.writeFileSync(new URL('cards.json', SRC), JSON.stringify(cards));
for (const t of TYPES) {
  const byB = Array.from({ length: 15 }, (_, b) => roster[t].filter((m) => bucketOf(m.spd) === b).length);
  console.log(t, roster[t].length, 'buckets', byB.join(' '));
}
