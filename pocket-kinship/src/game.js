import pokemon from '../data/pokemon.json';
import categories from '../data/categories.json';
import boards from '../data/boards.json';
import { factText } from './i18n.js';

export { categories, boards };
export const byId = new Map(pokemon.map((p) => [p.id, p]));

export const DIFFICULTIES = ['easy', 'super', 'expert', 'master'];
export const DIFF_NAMES = { easy: 'Easy', super: 'Super', expert: 'Expert', master: 'Master' };
export const SCOPES = ['all', 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const sprite = (p) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.pid}.png`;

// 두 포켓몬이 공통 값을 가진 카테고리. 세대별 퍼즐에서는 등장 세대를 뺀다.
export function sharedCats(a, b, scope) {
  return Object.keys(a.attrs).filter((c) => !(scope !== 'all' && c === 'generation') && a.attrs[c].some((v) => b.attrs[c].includes(v)));
}

// 두 포켓몬이 공유하는 값을 "타입, 진화 없음, 초전설..." 같은 설명 문장 목록으로.
export function sharedFacts(a, b, scope, lang) {
  return sharedCats(a, b, scope).flatMap((c) => a.attrs[c].filter((v) => b.attrs[c].includes(v)).map((v) => factText(lang, c, v, categories[c].values[v])));
}

export const needed =(difficulty) => (difficulty === 'master' ? 2 : 1);

export const grade = (n) => (n === 0 ? 'S' : n <= 2 ? 'A' : n <= 5 ? 'B' : n <= 10 ? 'C' : 'F');

// 보드별 노드 좌표 (viewBox 460x460). 노드 번호는 data/boards.json 과 같다.
const polar = (deg, r) => [230 + r * Math.cos((deg * Math.PI) / 180), 230 + r * Math.sin((deg * Math.PI) / 180)];
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
export const LAYOUT = {
  pentagon: Array.from({ length: 5 }, (_, i) => polar(-90 + 72 * i, 150)),
  hexagon: [...Array.from({ length: 6 }, (_, i) => polar(-90 + 60 * i, 160)), [230, 230]],
  square: [...RING.map(([x, y]) => [230 + 155 * x, 230 + 155 * y]), [230, 230]],
};
