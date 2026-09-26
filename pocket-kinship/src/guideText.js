import { EN_GENDER, EN_POSITION, cap } from './i18n.js';

// 카테고리 설명 창용: 카테고리별 설명과 값 라벨
export const CATEGORY_DESC = {
  ko: {
    type: '포켓몬의 타입. 복수 타입 중 하나만 겹쳐도 돼요.',
    evolveVia: '이 포켓몬이 다음 형태로 진화할 때 쓰는 방법. 단순 레벨업은 제외해요.',
    evolvedVia: '이 포켓몬이 되기 위해 앞 형태가 쓴 진화 방법.',
    evolutionStage: '진화 계열에서의 위치 (몇 단계 중 몇 번째). 1/1은 진화가 없는 포켓몬이에요.',
    weak4x: '4배 약점인 타입.',
    resist4x: '데미지를 1/4만 받는 타입.',
    trainer: '챔피언, 사천왕, 관장, 보스가 사용한 트레이너. 같은 트레이너의 포켓몬끼리만 이어져요.',
    generation: '처음 등장한 세대. 세대별 퍼즐에서는 쓰이지 않아요.',
    forms: '가지고 있거나 자신이 해당하는 특수 폼.',
    signatureMove: '그 포켓몬 계열만 배울 수 있는 전용기가 있는지. 기술 이름은 보지 않아요.',
    signatureZ: '전용 Z기술이 있는지. 전용기와는 별개예요.',
    abilities: '가질 수 있는 특성. 하나만 겹쳐도 돼요.',
    position: '스타팅, 전설 같은 분류.',
    genderRatio: '암수 한쪽만 존재하거나 성별이 없는 경우.',
  },
  en: {
    type: "The Pokémon's type. Sharing any one type is enough.",
    evolveVia: 'How this Pokémon evolves into its next form. Plain level-up is excluded.',
    evolvedVia: 'How the previous form evolved into this Pokémon.',
    evolutionStage: 'Position in its evolution line (stage n of total). 1/1 means it does not evolve.',
    weak4x: 'Types it takes 4x damage from.',
    resist4x: 'Types it takes 1/4x damage from.',
    trainer: 'Champion, Elite Four, Gym Leader, or boss trainers who used it. Only Pokémon of the same trainer connect.',
    generation: 'Debut generation. Not used in generation puzzles.',
    forms: 'Special forms it has or is.',
    signatureMove: 'Whether it has a move only its evolution line can learn. The move itself does not matter.',
    signatureZ: 'Whether it has an exclusive Z-move. Separate from the signature move.',
    abilities: 'Abilities it can have. Sharing any one is enough.',
    position: 'A classification such as starter or legendary.',
    genderRatio: 'Only one gender exists, or it is genderless.',
  },
};

const EN_METHOD = { friendship: 'Friendship', stone: 'Evolution stone', trade: 'Trade', time: 'Time of day', location: 'Location', gender: 'Gender', move: 'Learning a move', party: 'Party condition', 'held-item': 'Held item', special: 'Special condition' };
const EN_FORM = { mega: 'Mega Evolution', gmax: 'Gigantamax', primal: 'Primal Reversion', terastal: 'Terastal form', 'regional-has': 'Has a regional form', 'regional-self': 'Is a regional form' };

// koLabel 은 categories.json 의 한글 값 라벨
export function valueLabel(lang, cat, v, koLabel) {
  if (cat === 'evolutionStage' || cat === 'trainer') return v;
  if (lang === 'ko') return koLabel ?? v;
  if (cat === 'type' || cat === 'weak4x' || cat === 'resist4x') return cap(v);
  if (cat === 'evolveVia' || cat === 'evolvedVia') return EN_METHOD[v];
  if (cat === 'forms') return EN_FORM[v];
  if (cat === 'generation') return `Gen ${v}`;
  if (cat === 'position') return EN_POSITION[v];
  if (cat === 'genderRatio') return EN_GENDER[v];
  if (cat === 'signatureMove' || cat === 'signatureZ') return 'Has one';
  return v;
}
