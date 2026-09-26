// overrides.json 의 트레이너 영문 이름마다 Bulbapedia 에서 한국어 이름을 찾아 data/trainer-names.json 을 만든다.
// 실행: node scripts/fetch-trainer-names.mjs   (이미 있는 항목은 건너뛰므로 실패한 것만 다시 시도된다)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const OUT = path.join(DATA, 'trainer-names.json');
const overrides = JSON.parse(await fs.readFile(path.join(DATA, 'overrides.json'), 'utf8'));
let names = {};
try { names = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* 처음 실행 */ }

// 이름과 다른 Bulbapedia 문서 제목
const PAGE = { 'Tate & Liza': ['Tate_and_Liza'], N: ['N_(Trainer)', 'N_(game)'], Blue: ['Blue_(game)', 'Blue'], 'Lt. Surge': ['Lt._Surge'] };
const candidates = (n) => PAGE[n] ?? [n.replaceAll(' ', '_'), `${n.replaceAll(' ', '_')}_(game)`, `${n.replaceAll(' ', '_')}_(Trainer)`, `${n.replaceAll(' ', '_')}_(character)`];

async function korean(title) {
  const url = `https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'pocket-kinship-data/1.0 (personal project)' } });
  const j = await res.json();
  const text = j.parse?.wikitext?.['*'];
  if (!text) return null;
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^\|.*\bKorean\s*$/.test(l.trim()));
  if (i < 0) return null;
  const m = lines[i + 1]?.match(/^\|\s*([^'|]+?)\s*(?:''|$)/);
  return m && /[가-힣]/.test(m[1]) ? m[1].trim() : null;
}

const failed = [];
for (const n of Object.keys(overrides.trainer)) {
  if (names[n]) continue;
  let ko = null;
  for (const title of candidates(n)) {
    try { ko = await korean(title); } catch { ko = null; }
    await new Promise((r) => setTimeout(r, 250));
    if (ko) break;
  }
  if (ko) names[n] = ko; else failed.push(n);
}
await fs.writeFile(OUT, JSON.stringify(names, null, 2) + '\n');
console.log(`${Object.keys(names).length} names saved`);
if (failed.length) console.log('not found:', failed.join(', '));
