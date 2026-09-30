// Lists every fully evolved Pokemon (default form) with a dragon/ghost/water/steel type and its base Speed.
import fs from 'node:fs';

const CACHE = new URL('../../pocket-kinship/data/.cache/', import.meta.url);
const OUT = new URL('../data/', import.meta.url);
const TYPES = { dragon: '드래곤', ghost: '고스트', water: '물', steel: '강철' };
const TYPE_KO = { ...TYPES, normal: '노말', fire: '불꽃', grass: '풀', electric: '전기', ice: '얼음', fighting: '격투', poison: '독', ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레', rock: '바위', dark: '악', fairy: '페어리' };

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, CACHE), 'utf8'));
const files = fs.readdirSync(CACHE);
const idOf = (url) => url.match(/\/(\d+)\/$/)[1];

function findNode(node, name) {
  if (node.species.name === name) return node;
  for (const n of node.evolves_to) {
    const hit = findNode(n, name);
    if (hit) return hit;
  }
  return null;
}

const rows = [];
for (const f of files.filter((f) => f.startsWith('_pokemon-species_') && !f.includes('limit'))) {
  const sp = read(f);
  const chain = read(`_evolution-chain_${idOf(sp.evolution_chain.url)}.json`).chain;
  if (findNode(chain, sp.name).evolves_to.length) continue;
  const p = read(`_pokemon_${sp.varieties.find((v) => v.is_default).pokemon.name}.json`);
  const types = p.types.map((t) => t.type.name);
  if (!types.some((t) => TYPES[t])) continue;
  rows.push({
    dex: sp.id,
    ko: sp.names.find((n) => n.language.name === 'ko')?.name ?? sp.name,
    types,
    spd: p.stats.find((s) => s.stat.name === 'speed').base_stat,
    solo: !chain.evolves_to.length,
    legend: sp.is_legendary || sp.is_mythical,
  });
}

const sorted = (t) => rows.filter((r) => r.types.includes(t)).sort((a, b) => b.spd - a.spd || a.dex - b.dex);
let md = '# 4타입 최종진화체 스피드 종족값\n\n기본 폼 기준. 진화하지 않는 포켓몬도 포함(비고에 "단일"). 두 타입에 걸친 포켓몬은 양쪽 표에 모두 나온다.\n';
for (const [t, ko] of Object.entries(TYPES)) {
  const list = sorted(t);
  md += `\n## ${ko} (${list.length}마리)\n\n| 스피드 | 포켓몬 | 타입 | 비고 |\n|---|---|---|---|\n`;
  for (const r of list) {
    const note = [r.legend && '전설/환상', r.solo && '단일'].filter(Boolean).join(', ');
    md += `| ${r.spd} | ${r.ko} | ${r.types.map((x) => TYPE_KO[x]).join('/')} | ${note} |\n`;
  }
}
fs.writeFileSync(new URL('final-evos.md', OUT), md);
fs.writeFileSync(new URL('final-evos.json', OUT), JSON.stringify(rows, null, 1));
for (const t of Object.keys(TYPES)) console.log(t, sorted(t).length);
console.log('total unique', rows.length);
