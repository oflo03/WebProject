// PokéAPI에서 data/pokemon.json, data/categories.json 을 생성한다.
// 실행: node scripts/build-data.mjs   (응답은 data/.cache 에 캐시되어 재실행이 빠르다)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CACHE = path.join(DATA, '.cache');
const API = 'https://pokeapi.co/api/v2';

const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const REGIONS = { alola: ['알로라', 'Alolan', 7], galar: ['가라르', 'Galarian', 8], hisui: ['히스이', 'Hisuian', 8], paldea: ['팔데아', 'Paldean', 9] };
const REGIONAL = /-(alola|galar|hisui|paldea)$/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

const METHODS = { friendship: '친밀도', stone: '진화의 돌', trade: '교환', time: '시간', location: '장소', gender: '성별',
  move: '기술 습득', party: '파티 조건', 'held-item': '아이템 지참', special: '특수 행동' };
const FORMS = { mega: '메가진화', gmax: '거다이맥스', primal: '원시회귀', terastal: '테라스탈폼', 'regional-has': '리전폼 보유', 'regional-self': '리전폼 자체' };
const POSITIONS = { starter: '스타팅', 'sub-legendary': '준전설', legendary: '초전설', mythical: '환상', 'ultra-beast': '울트라비스트', paradox: '패러독스' };
const GENDERS = { 'male-only': '수컷 100%', 'female-only': '암컷 100%', genderless: '무성' };
const HAS = { has: '보유' };

async function get(p) {
  const file = path.join(CACHE, p.replace(/[/?=&]/g, '_') + '.json');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* cache miss */ }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API + p);
      if (!res.ok) throw new Error(`${res.status} ${p}`);
      const json = await res.json();
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const ko = (names) => names.find((n) => n.language.name === 'ko')?.name;
const en = (names) => names.find((n) => n.language.name === 'en')?.name;

// 진화 조건 -> 진화 방법 값. 단순 레벨업(min_level만 있는 경우)은 값이 없다.
// ponytail: use-item 은 돌이 아닌 아이템(달콤한 사과 등)도 전부 'stone' 으로 묶는다. 나누려면 d.item.name 으로 분기.
const SPECIAL_KEYS = ['min_beauty', 'needs_overworld_rain', 'turn_upside_down', 'min_move_count', 'min_steps', 'min_damage_taken', 'used_move'];
function methods(details) {
  const s = new Set();
  for (const d of details) {
    const trigger = d.trigger.name;
    if (trigger === 'trade') s.add('trade');
    else if (trigger === 'use-item') s.add('stone');
    else if (trigger !== 'level-up') s.add('special');
    if (d.min_happiness || d.min_affection) s.add('friendship');
    if (d.time_of_day) s.add('time');
    if (d.location) s.add('location');
    if (d.gender != null) s.add('gender');
    if (d.known_move || d.known_move_type) s.add('move');
    if (d.party_species || d.party_type) s.add('party');
    if (d.held_item && trigger !== 'trade') s.add('held-item');
    if (d.relative_physical_stats != null || SPECIAL_KEYS.some((k) => d[k])) s.add('special');
  }
  return [...s];
}

const overrides = JSON.parse(await fs.readFile(path.join(DATA, 'overrides.json'), 'utf8'));

console.log('species...');
const list = await get('/pokemon-species?limit=2000');
const species = await pool(list.results, 8, (r) => get(`/pokemon-species/${r.name}`));

console.log('evolution chains...');
const chainIds = [...new Set(species.map((s) => s.evolution_chain.url.split('/').at(-2)))];
const evo = {};
for (const c of await pool(chainIds, 8, (id) => get(`/evolution-chain/${id}`))) {
  const names = [];
  let total = 0;
  const visit = (node, depth) => {
    total = Math.max(total, depth);
    names.push(node.species.name);
    const me = (evo[node.species.name] = { depth, chain: c.id, evolvedVia: methods(node.evolution_details), evolveVia: new Set() });
    for (const child of node.evolves_to) {
      visit(child, depth + 1);
      methods(child.evolution_details).forEach((m) => me.evolveVia.add(m));
    }
  };
  visit(c.chain, 1);
  for (const n of names) evo[n].stage = `${evo[n].depth}/${total}`;
}

console.log('type chart...');
const chart = {};
for (const t of TYPES) {
  const rel = (await get(`/type/${t}`)).damage_relations;
  chart[t] = {};
  for (const [k, m] of [['double_damage_to', 2], ['half_damage_to', 0.5], ['no_damage_to', 0]]) {
    for (const x of rel[k]) chart[t][x.name] = m;
  }
}
const mult = (atk, defs) => defs.reduce((m, d) => m * (chart[atk][d] ?? 1), 1);

console.log('pokemon...');
const jobs = species.flatMap((sp) => sp.varieties.filter((v) => v.is_default || REGIONAL.test(v.pokemon.name)).map((v) => v.pokemon.name));
const pokes = Object.fromEntries(await pool(jobs, 8, async (n) => [n, await get(`/pokemon/${n}`)]));

const starterChains = new Set(overrides.position.starter.map((n) => evo[n]?.chain));
function positionOf(sp) {
  const pos = overrides.position;
  const p = [];
  if (starterChains.has(evo[sp.name].chain)) p.push('starter');
  for (const k of ['sub-legendary', 'ultra-beast', 'paradox']) if (pos[k].includes(sp.name)) p.push(k);
  if (sp.is_mythical) p.push('mythical');
  else if (sp.is_legendary && !p.includes('sub-legendary') && !p.includes('ultra-beast')) p.push('legendary');
  return p;
}

const genderOf = (sp) => ({ '-1': ['genderless'], 0: ['male-only'], 8: ['female-only'] })[sp.gender_rate] ?? [];

function formsOf(sp) {
  const v = sp.varieties.map((x) => x.pokemon.name);
  const f = [];
  if (v.some((n) => /-mega(-[xyz])?$/.test(n))) f.push('mega');
  if (v.some((n) => /-gmax$/.test(n))) f.push('gmax');
  if (v.some((n) => /-primal$/.test(n))) f.push('primal');
  if (['terapagos', 'ogerpon'].includes(sp.name)) f.push('terastal');
  if (v.some((n) => /-(alola|galar|hisui|paldea)(?!-cap)/.test(n))) f.push('regional-has');
  return f;
}

// ponytail: 리전폼 항목의 진화/성비/포지션은 종(species) 단위 값을 그대로 쓴다. 진화 계열이 갈라지는 리전폼은 수동 보정 필요.
function entry(id, sp, poke, { ko: koName, en: enName, generation, forms }) {
  const types = poke.types.map((t) => t.type.name);
  const e = evo[sp.name];
  return {
    id,
    dex: sp.id,
    pid: poke.id,
    name: { ko: koName, en: enName },
    attrs: {
      type: types,
      evolveVia: [...e.evolveVia],
      evolvedVia: e.evolvedVia,
      evolutionStage: [e.stage],
      weak4x: TYPES.filter((a) => mult(a, types) === 4),
      resist4x: TYPES.filter((a) => mult(a, types) === 0.25),
      trainer: [],
      generation: [String(generation)],
      forms,
      signatureMove: [],
      signatureZ: [],
      abilities: poke.abilities.map((a) => a.ability.name),
      position: positionOf(sp),
      genderRatio: genderOf(sp),
    },
  };
}

const entries = [];
for (const sp of species) {
  const koName = ko(sp.names) ?? sp.name;
  const enName = en(sp.names) ?? sp.name;
  const def = sp.varieties.find((v) => v.is_default).pokemon.name;
  entries.push(entry(sp.name, sp, pokes[def], { ko: koName, en: enName, generation: ROMAN[sp.generation.name.split('-')[1]], forms: formsOf(sp) }));
  for (const v of sp.varieties) {
    const m = v.pokemon.name.match(REGIONAL);
    if (!m) continue;
    const [rko, ren, gen] = REGIONS[m[1]];
    entries.push(entry(v.pokemon.name, sp, pokes[v.pokemon.name], { ko: `${rko} ${koName}`, en: `${ren} ${enName}`, generation: gen, forms: ['regional-self'] }));
  }
}

const byId = new Map(entries.map((e) => [e.id, e]));
const warnUnknown = (ids) => ids.filter((id) => !byId.has(id)).forEach((id) => console.warn(`overrides: unknown id "${id}"`));
const apply = (key, ids, value) => {
  warnUnknown(ids);
  for (const id of ids) {
    const a = byId.get(id)?.attrs[key];
    if (a && !a.includes(value)) a.push(value);
  }
};
Object.values(overrides.position).forEach(warnUnknown);
for (const [name, ids] of Object.entries(overrides.trainer)) apply('trainer', ids, name);

// 전용기 후보: 한 진화 계열만 배울 수 있는 기술. 검토용으로 data/signature-moves.json 에도 저장한다.
console.log('moves...');
const speciesOf = {};
for (const sp of species) for (const v of sp.varieties) speciesOf[v.pokemon.name] = sp.name;
const signature = {};
for (const m of await pool((await get('/move?limit=2000')).results, 8, (r) => get(`/move/${r.name}`))) {
  const learners = m.learned_by_pokemon.map((p) => p.name).filter((n) => speciesOf[n]);
  if (!learners.length || new Set(learners.map((n) => evo[speciesOf[n]].chain)).size > 1) continue;
  signature[m.name] = [...new Set(learners.map((n) => (byId.has(n) ? n : speciesOf[n])))];
  apply('signatureMove', signature[m.name], 'has');
}
await fs.writeFile(path.join(DATA, 'signature-moves.json'), '{\n' + Object.entries(signature).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
apply('signatureMove', overrides.signatureMove, 'has');
apply('signatureZ', overrides.signatureZ, 'has');

console.log('labels...');
const abilitySlugs = [...new Set(entries.flatMap((e) => e.attrs.abilities))].sort();
const abilities = Object.fromEntries(await pool(abilitySlugs, 8, async (s) => [s, ko((await get(`/ability/${s}`)).names) ?? s]));
const typeLabels = Object.fromEntries(await pool(TYPES, 4, async (t) => [t, ko((await get(`/type/${t}`)).names) ?? t]));
const same = (values) => Object.fromEntries([...new Set(values)].sort().map((v) => [v, v]));
const categories = {
  type: { label: '타입', values: typeLabels },
  evolveVia: { label: '진화할 방법', values: METHODS },
  evolvedVia: { label: '진화한 방법', values: METHODS },
  evolutionStage: { label: '진화 방식', values: same(entries.flatMap((e) => e.attrs.evolutionStage)) },
  weak4x: { label: '4배 약점 타입', values: typeLabels },
  resist4x: { label: '1/4 반감 타입', values: typeLabels },
  trainer: { label: '사용한 네임드 트레이너', values: same(Object.keys(overrides.trainer)) },
  generation: { label: '등장 세대', values: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), `${n}세대`])) },
  forms: { label: '보유 폼', values: FORMS },
  signatureMove: { label: '전용기', values: HAS },
  signatureZ: { label: '전용 Z기술', values: HAS },
  abilities: { label: '보유 특성', values: abilities },
  position: { label: '포지션', values: POSITIONS },
  genderRatio: { label: '독특한 성비', values: GENDERS },
};

await fs.writeFile(path.join(DATA, 'pokemon.json'), '[\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n');
await fs.writeFile(path.join(DATA, 'categories.json'), JSON.stringify(categories, null, 2) + '\n');

console.log(`\n${entries.length} entries (${species.length} species). non-empty count per category:`);
for (const k of Object.keys(categories)) console.log(`  ${k.padEnd(15)} ${entries.filter((e) => e.attrs[k].length).length}`);
