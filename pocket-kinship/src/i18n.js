// 화면 문구. 매개변수가 있는 문구는 함수다.
const STR = {
  ko: {
    title: '포켓 끼리끼리',
    tools: '게임 도구',
    puzzleGame: '연결 퍼즐',
    heroLine: '닮은 점을 찾아, 끼리끼리.',
    setup: '나만의 퍼즐 고르기',
    yourPuzzle: '오늘은 어떤 조합?',
    noTimer: '시간 제한 없이, 천천히',
    footerHint: '같은 점 하나로 이어지는 작은 만남',
    loadError: '퍼즐을 불러오지 못했어요.',
    retry: '다시 시도',
    team: '함께할 포켓몬',
    trayHint: '골라서 놓거나, 보드로 끌어 주세요.',
    progress: '배치',
    emptyNode: '빈 자리',
    subtitle:
      '포켓몬을 보드에 전부 배치하세요.\n이웃한 노드끼리는 공통점이 있어야 해요.',
    scope: '범위',
    board: '보드',
    difficulty: '난이도',
    all: '전체',
    gen: (n) => `${n}세대`,
    pentagon: '오각형 (5)',
    hexagon: '육각형 (7)',
    square: '사각형 (9)',
    noLink: '연결 불가',
    hintGen: '세대별 퍼즐에서는 등장 세대가 공통점으로 인정되지 않아요.',
    hintMaster:
      'Expert와 Master는 이웃한 노드끼리 서로 다른 카테고리 2개에서 공통점이 필요해요.',
    noPuzzle: '이 조합의 퍼즐이 없어요. 다른 설정을 골라 주세요.',
    start: '시작',
    loading: '불러오는 중...',
    menu: '메뉴',
    reset: '초기화',
    retracts: (n) => `회수 ${n}회`,
    rule: (k) =>
      `이웃한 노드와 서로 다른 카테고리 ${k}개 이상에서 공통점이 있어야 해요.`,
    pickFirst: '먼저 아래에서 포켓몬을 골라 주세요.',
    clear: '클리어!',
    next: '다음 퍼즐',
    boardLabel: '보드',
    otherLang: 'English',
    guideButton: '카테고리 설명',
    guideTitle: '카테고리 설명',
    guideIntro:
      '두 포켓몬이 같은 카테고리에서 같은 값을 가지면 공통점이에요. 값이 없는(해당 없음) 경우끼리는 공통점이 아니에요.',
    guideMaster:
      'Expert와 Master에서는 서로 다른 카테고리 2개에서 공통점이 있어야 해요.',
    guideNoGen: '이 퍼즐은 세대별 퍼즐이라 등장 세대는 쓰이지 않아요.',
    guideAbilities: (n) => `약 ${n}종 (목록은 생략)`,
    guideClose: '닫기',
  },
  en: {
    title: 'Pocket Kinship',
    tools: 'Game tools',
    puzzleGame: 'Connection puzzle',
    heroLine: 'A little in common.\nA connection to make.',
    setup: 'Make it your puzzle',
    yourPuzzle: 'Find your next connection',
    noTimer: 'No timer. Take your time.',
    footerHint: 'Little connections, one shared trait at a time.',
    loadError: 'Could not load puzzles.',
    retry: 'Try again',
    team: 'Your Pokémon',
    trayHint: 'Pick and place, or drag onto the board.',
    progress: 'Placed',
    emptyNode: 'Empty node',
    subtitle:
      'Place every Pokémon on the board.\nNeighboring nodes must have something in common.',
    scope: 'Scope',
    board: 'Board',
    difficulty: 'Difficulty',
    all: 'All',
    gen: (n) => `Gen ${n}`,
    pentagon: 'Pentagon (5)',
    hexagon: 'Hexagon (7)',
    square: 'Square (9)',
    noLink: 'Not connectable',
    hintGen:
      'In generation puzzles, the debut generation does not count as something in common.',
    hintMaster:
      'In Expert and Master, neighboring nodes must share something in 2 different categories.',
    noPuzzle: 'No puzzle for this combination. Try another setting.',
    start: 'Start',
    loading: 'Loading...',
    menu: 'Menu',
    reset: 'Reset',
    retracts: (n) => `Retracts: ${n}`,
    rule: (k) =>
      k > 1
        ? `Neighboring nodes must share something in at least ${k} different categories.`
        : 'Neighboring nodes must share something in at least 1 category.',
    pickFirst: 'Pick a Pokémon below first.',
    clear: 'Cleared!',
    next: 'Next puzzle',
    boardLabel: 'Board',
    otherLang: '한국어',
    guideButton: 'Category guide',
    guideTitle: 'Category guide',
    guideIntro:
      'Two Pokémon have something in common when they share the same value in the same category. Missing (not applicable) values never count.',
    guideMaster:
      'In Expert and Master, the two Pokémon must share something in 2 different categories.',
    guideNoGen:
      'This is a generation puzzle, so the debut generation is not used.',
    guideAbilities: (n) => `About ${n} abilities (list omitted)`,
    guideClose: 'Close',
  },
};

export const detectLang = () => {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* 저장소를 못 쓰면 브라우저 언어로 */
  }
  return navigator.language?.startsWith('ko') ? 'ko' : 'en';
};

export const saveLang = (lang) => {
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* 저장 실패는 무시 */
  }
};

export const makeT =
  (lang) =>
  (key, ...args) => {
    const v = STR[lang][key];
    return typeof v === 'function' ? v(...args) : v;
  };

// 공통 카테고리의 값 하나를 "왜 이어졌는지" 설명하는 문장으로. koLabel 은 categories.json 의 한글 값 라벨.
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const title = (s) => s.split('-').map(cap).join(' ');
const EN_METHOD = {
  friendship: 'friendship',
  stone: 'an evolution stone',
  trade: 'trade',
  time: 'time of day',
  location: 'location',
  gender: 'gender',
  move: 'learning a move',
  party: 'a party condition',
  'held-item': 'a held item',
  special: 'a special condition',
};
const EN_FORMS = {
  mega: 'Has Mega Evolution',
  gmax: 'Has Gigantamax',
  primal: 'Has Primal Reversion',
  terastal: 'Has Terastal form',
  'regional-has': 'Has a regional form',
  'regional-self': 'Regional form',
};
export const EN_POSITION = {
  starter: 'Starter',
  'sub-legendary': 'Sub-legendary',
  legendary: 'Legendary',
  mythical: 'Mythical',
  'ultra-beast': 'Ultra Beast',
  paradox: 'Paradox',
};
export const EN_GENDER = {
  'male-only': 'Male only',
  'female-only': 'Female only',
  genderless: 'Genderless',
};
const FACT = {
  ko: {
    type: (v, L) => `${L} 타입`,
    evolveVia: (v, L) => `진화 방법: ${L}`,
    evolvedVia: (v, L) => `진화한 방법: ${L}`,
    weak4x: (v, L) => `${L}에 4배 약점`,
    resist4x: (v, L) => `${L}에 1/4 반감`,
    trainer: (v, L) => `${L} 사용`,
    generation: (v) => `${v}세대`,
    forms: (v, L) =>
      v === 'regional-has' || v === 'regional-self' ? L : `${L} 있음`,
    signatureMove: () => '전용기 있음',
    signatureZ: () => '전용 Z기술 있음',
    abilities: (v, L) => `특성: ${L}`,
    classification: (v, L) => L,
  },
  en: {
    type: (v) => `${cap(v)} type`,
    evolveVia: (v) => `Evolves by ${EN_METHOD[v]}`,
    evolvedVia: (v) => `Evolved by ${EN_METHOD[v]}`,
    weak4x: (v) => `4x weak to ${cap(v)}`,
    resist4x: (v) => `Resists ${cap(v)} 1/4x`,
    trainer: (v) => `Used by ${v}`,
    generation: (v) => `Gen ${v}`,
    forms: (v) => EN_FORMS[v],
    signatureMove: () => 'Has a signature move',
    signatureZ: () => 'Has a signature Z-move',
    abilities: (v) => `Ability: ${title(v)}`,
    classification: (v) => EN_POSITION[v] ?? EN_GENDER[v],
  },
};
export const factText = (lang, cat, value, koLabel) =>
  FACT[lang][cat](value, koLabel ?? value);
