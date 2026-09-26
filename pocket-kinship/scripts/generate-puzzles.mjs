// data/puzzles.json 을 생성한다. 실행: node scripts/generate-puzzles.mjs [--count 30] [--seed 1] [--explore]
// 퍼즐 = 보드 노드 수만큼의 포켓몬 리스트 + 정답 배치. 해는 "정답 심기"로 보장하고, 백트래킹으로 정답 개수를 세서 난이도를 판정한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : Number(args[i + 1]); };
const COUNT = opt('count', 30);
let seed = opt('seed', 1);
const rng = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 난이도. k: 인접 노드가 공유해야 하는 카테고리 수, q: 인접하지 않은 쌍이 "우연히 매칭돼도 되는" 확률
// (q=0이면 인접하지 않은 쌍은 전부 매칭 불가 -> 정답 하나). 통과 조건은 정답 종류 수(대칭 제외)의 [최소, 최대].
// 정답 종류의 상한이 보드마다 다르다(오각형 12, 육각형 420, 사각형 45360). 그래서 Easy/Super 구간은 보드별로 둔다.
const DIFFS = {
  easy: { k: 1, q: 1 },
  super: { k: 1, q: 0.35 },
  expert: { k: 1, q: 0, band: [1, 1] },
  master: { k: 2, q: 0, band: [1, 1] },
};
const BANDS = {
  pentagon: { easy: [4, Infinity], super: [2, 3] },
  hexagon: { easy: [20, Infinity], super: [2, 8] },
  square: { easy: [100, Infinity], super: [2, 12] },
};

const pokemon = JSON.parse(await fs.readFile(path.join(DATA, 'pokemon.json'), 'utf8'));
const boards = JSON.parse(await fs.readFile(path.join(DATA, 'boards.json'), 'utf8'));
const CATS = Object.keys(pokemon[0].attrs);
const byId = new Map(pokemon.map((p) => [p.id, p]));

const shared = (a, b, cats) => cats.filter((c) => a.attrs[c].some((v) => b.attrs[c].includes(v))).length;

// 노드마다 각 포켓몬을 배정하는 경우의 수. ok[i*n+j] = 리스트의 i번, j번 포켓몬이 연결 가능한지. 인접 노드만 검사한다.
function countSolutions(n, ok, b, cap) {
  const used = new Array(n).fill(false);
  const at = new Array(b.nodes).fill(-1);
  let count = 0;
  const rec = (d) => {
    if (d === b.nodes) { count++; return; }
    const v = b.order[d];
    for (let p = 0; p < n && count < cap; p++) {
      if (used[p] || b.nbrs[v].some((u) => at[u] >= 0 && !ok[p * n + at[u]])) continue;
      used[p] = true; at[v] = p;
      rec(d + 1);
      used[p] = false; at[v] = -1;
    }
  };
  rec(0);
  return count;
}

for (const b of Object.values(boards)) {
  const n = b.nodes;
  b.nbrs = Array.from({ length: n }, () => []);
  b.adj = new Uint8Array(n * n);
  for (const [x, y] of b.edges) { b.nbrs[x].push(y); b.nbrs[y].push(x); b.adj[x * n + y] = b.adj[y * n + x] = 1; }
  b.order = [b.nbrs.reduce((best, l, i) => (l.length > b.nbrs[best].length ? i : best), 0)];
  for (let i = 0; i < b.order.length; i++) for (const w of b.nbrs[b.order[i]]) if (!b.order.includes(w)) b.order.push(w);
  b.aut = countSolutions(n, b.adj, b, Infinity); // 자기 자신으로의 대칭 개수
}

const has = (s, i) => (s[i >>> 5] >>> (i & 31)) & 1;
const put = (s, i) => { s[i >>> 5] |= 1 << (i & 31); };
const popcount = (x) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

// scope: 'all' 또는 세대 번호. 세대 퍼즐은 그 세대 포켓몬만 쓰고 등장 세대 카테고리는 끈다.
function buildScope(scope) {
  const pool = scope === 'all' ? pokemon : pokemon.filter((p) => p.attrs.generation[0] === String(scope));
  const cats = scope === 'all' ? CATS : CATS.filter((c) => c !== 'generation');
  const P = pool.length;
  const W = (P + 31) >>> 5;
  const mk = () => Array.from({ length: P }, () => new Uint32Array(W));
  const c = { 1: mk(), 2: mk() };
  for (let i = 0; i < P; i++) {
    for (let j = i + 1; j < P; j++) {
      const n = shared(pool[i], pool[j], cats);
      for (const k of [1, 2]) if (n >= k) { put(c[k][i], j); put(c[k][j], i); }
    }
  }
  const all = new Uint32Array(W).fill(0xffffffff);
  if (P & 31) all[W - 1] = (1 << (P & 31)) - 1;
  return { pool, cats, P, W, c, all };
}

function pick(set, W) {
  let total = 0;
  for (let w = 0; w < W; w++) total += popcount(set[w]);
  if (!total) return -1;
  let r = Math.floor(rng() * total);
  for (let w = 0; w < W; w++) {
    const cnt = popcount(set[w]);
    if (r >= cnt) { r -= cnt; continue; }
    for (let bit = 0; bit < 32; bit++) if ((set[w] >>> bit) & 1 && r-- === 0) return w * 32 + bit;
  }
  return -1;
}

// 정답 심기: 노드 순서대로, 이미 놓은 이웃과 매칭되는 포켓몬을 뽑는다. 반환값은 노드별 포켓몬 인덱스.
function attempt(S, b, d) {
  const { W } = S;
  const C = S.c[d.k];
  const cand = new Uint32Array(W);
  const used = new Uint32Array(W);
  const at = new Array(b.nodes).fill(-1);
  for (const v of b.order) {
    for (let w = 0; w < W; w++) cand[w] = S.all[w] & ~used[w];
    for (let u = 0; u < b.nodes; u++) {
      if (at[u] < 0) continue;
      const row = C[at[u]];
      if (b.adj[v * b.nodes + u]) for (let w = 0; w < W; w++) cand[w] &= row[w];
      else if (rng() >= d.q) for (let w = 0; w < W; w++) cand[w] &= ~row[w];
    }
    const p = pick(cand, W);
    if (p < 0) return null;
    at[v] = p;
    put(used, p);
  }
  return at;
}

function classesOf(S, b, d, at) {
  const n = b.nodes;
  const ok = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ok[i * n + j] = has(S.c[d.k][at[i]], at[j]);
  const cap = b.aut * 500;
  return Math.min(countSolutions(n, ok, b, cap), cap) / b.aut;
}

// 생성 로직과 별개로 원본 데이터에서 정답 배치가 규칙을 지키는지 다시 확인한다.
function verify(pz, b, d, cats) {
  const ps = pz.solution.map((id) => byId.get(id));
  if (new Set(pz.solution).size !== b.nodes || ps.some((p) => !p)) throw new Error(`bad solution ${pz.id}`);
  if (pz.scope !== 'all' && ps.some((p) => p.attrs.generation[0] !== String(pz.scope))) throw new Error(`scope ${pz.id}`);
  for (const [x, y] of b.edges) if (shared(ps[x], ps[y], cats) < d.k) throw new Error(`edge ${x}-${y} ${pz.id}`);
  if ([...pz.pokemon].sort().join() !== [...pz.solution].sort().join()) throw new Error(`list ${pz.id}`);
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

if (args.includes('--explore')) {
  const S = buildScope('all');
  for (const [name, b] of Object.entries(boards)) {
    for (const [k, q] of [[1, 1], [1, 0.6], [1, 0.35], [1, 0.15], [1, 0], [2, 1], [2, 0.35], [2, 0]]) {
      const d = { k, q };
      const cs = [];
      for (let i = 0; i < 300 && cs.length < 60; i++) { const at = attempt(S, b, d); if (at) cs.push(classesOf(S, b, d, at)); }
      cs.sort((x, y) => x - y);
      const at = (f) => cs[Math.floor(f * (cs.length - 1))];
      console.log(`${name.padEnd(8)} k=${k} q=${q}`.padEnd(24), `n=${cs.length}`.padEnd(6), `min ${at(0)}  p25 ${at(0.25)}  med ${at(0.5)}  p75 ${at(0.75)}  max ${at(1)}`);
    }
  }
  process.exit(0);
}

const puzzles = [];
for (const scope of ['all', 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  const S = buildScope(scope);
  for (const [bname, b] of Object.entries(boards)) {
    for (const [dname, d] of Object.entries(DIFFS)) {
      const seen = new Set();
      let made = 0;
      for (let tries = 0; made < COUNT && tries < COUNT * 5000; tries++) {
        const at = attempt(S, b, d);
        if (!at) continue;
        const key = [...at].sort((x, y) => x - y).join();
        if (seen.has(key)) continue;
        const classes = classesOf(S, b, d, at);
        const [lo, hi] = d.band ?? BANDS[bname][dname];
        if (classes < lo || classes > hi) continue;
        seen.add(key);
        const solution = at.map((i) => S.pool[i].id);
        const pz = { id: `${scope}-${bname}-${dname}-${made}`, scope, board: bname, difficulty: dname, pokemon: shuffle([...solution]), solution, classes };
        verify(pz, b, d, S.cats);
        puzzles.push(pz);
        made++;
      }
      console.log(`${String(scope).padEnd(4)} ${bname.padEnd(8)} ${dname.padEnd(7)} ${made}/${COUNT}`);
    }
  }
}
await fs.writeFile(path.join(DATA, 'puzzles.json'), '[\n' + puzzles.map((p) => JSON.stringify(p)).join(',\n') + '\n]\n');
console.log(`\n${puzzles.length} puzzles`);
