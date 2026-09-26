// 화면 문구. 매개변수가 있는 문구는 함수다.
const STR = {
  ko: {
    title: '포켓 끼리끼리',
    subtitle: '포켓몬을 보드에 전부 배치하세요. 이웃한 노드끼리는 공통점이 있어야 해요.',
    scope: '범위',
    board: '보드',
    difficulty: '난이도',
    all: '전체',
    gen: (n) => `${n}세대`,
    pentagon: '오각형 (5)',
    hexagon: '육각형 (7)',
    square: '사각형 (9)',
    hintGen: '세대별 퍼즐에서는 등장 세대가 공통점으로 인정되지 않아요.',
    hintMaster: 'Master는 이웃한 노드끼리 서로 다른 카테고리 2개에서 공통점이 필요해요.',
    noPuzzle: '이 조합의 퍼즐이 없어요. 다른 설정을 골라 주세요.',
    start: '시작',
    loading: '불러오는 중...',
    menu: '메뉴',
    reset: '초기화',
    retracts: (n) => `회수 ${n}회`,
    rule: (k) => `이웃한 노드와 서로 다른 카테고리 ${k}개 이상에서 공통점이 있어야 해요.`,
    pickFirst: '먼저 아래에서 포켓몬을 골라 주세요.',
    clear: '클리어!',
    next: '다음 퍼즐',
    boardLabel: '보드',
    otherLang: 'English',
  },
  en: {
    title: 'Pocket Kinship',
    subtitle: 'Place every Pokémon on the board. Neighboring nodes must have something in common.',
    scope: 'Scope',
    board: 'Board',
    difficulty: 'Difficulty',
    all: 'All',
    gen: (n) => `Gen ${n}`,
    pentagon: 'Pentagon (5)',
    hexagon: 'Hexagon (7)',
    square: 'Square (9)',
    hintGen: 'In generation puzzles, the debut generation does not count as something in common.',
    hintMaster: 'In Master, neighboring nodes must share something in 2 different categories.',
    noPuzzle: 'No puzzle for this combination. Try another setting.',
    start: 'Start',
    loading: 'Loading...',
    menu: 'Menu',
    reset: 'Reset',
    retracts: (n) => `Retracts: ${n}`,
    rule: (k) => (k > 1 ? `Neighboring nodes must share something in at least ${k} different categories.` : 'Neighboring nodes must share something in at least 1 category.'),
    pickFirst: 'Pick a Pokémon below first.',
    clear: 'Cleared!',
    next: 'Next puzzle',
    boardLabel: 'Board',
    otherLang: '한국어',
  },
};

export const detectLang = () => {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* 저장소를 못 쓰면 브라우저 언어로 */ }
  return navigator.language?.startsWith('ko') ? 'ko' : 'en';
};

export const saveLang = (lang) => {
  try { localStorage.setItem('lang', lang); } catch { /* 저장 실패는 무시 */ }
};

export const makeT = (lang) => (key, ...args) => {
  const v = STR[lang][key];
  return typeof v === 'function' ? v(...args) : v;
};
