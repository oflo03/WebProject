import pokemon from '../data/pokemon.json';
import categories from '../data/categories.json';
import boards from '../data/boards.json';

export { categories, boards };
export const byId = new Map(pokemon.map((p) => [p.id, p]));

export const BOARD_NAMES = { pentagon: '오각형 (5)', hexagon: '육각형 (7)', square: '사각형 (9)' };
export const DIFFICULTIES = ['easy', 'super', 'expert', 'master'];
export const DIFF_NAMES = { easy: 'Easy', super: 'Super', expert: 'Expert', master: 'Master' };
export const SCOPES = ['all', 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const scopeName = (s) => (s === 'all' ? '전체' : `${s}세대`);

export const sprite = (p) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.pid}.png`;

// 두 포켓몬이 공통 값을 가진 카테고리. 세대별 퍼즐에서는 등장 세대를 뺀다.
export function sharedCats(a, b, scope) {
  return Object.keys(a.attrs).filter((c) => !(scope !== 'all' && c === 'generation') && a.attrs[c].some((v) => b.attrs[c].includes(v)));
}

export const needed =(difficulty) => (difficulty === 'master' ? 2 : 1);

export const grade = (n) => (n === 0 ? 'S' : n <= 2 ? 'A' : n <= 5 ? 'B' : n <= 10 ? 'C' : 'F');

// 보드별 노드 좌표 (viewBox 400x400). 노드 번호는 data/boards.json 과 같다.
const polar = (deg, r) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)];
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
export const LAYOUT = {
  pentagon: Array.from({ length: 5 }, (_, i) => polar(-90 + 72 * i, 130)),
  hexagon: [...Array.from({ length: 6 }, (_, i) => polar(-90 + 60 * i, 135)), [200, 200]],
  square: [...RING.map(([x, y]) => [200 + 135 * x, 200 + 135 * y]), [200, 200]],
};
