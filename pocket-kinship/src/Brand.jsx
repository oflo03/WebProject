import logoEn from '../output/logos/pocket-kinship-en.png';
import logoKo from '../output/logos/pocket-kinship-ko.png';
import { boards, LAYOUT } from './game.js';

export function Brand({ lang, compact = false, onClick }) {
  const img = (
    <img
      className={compact ? 'brand compact' : 'brand'}
      src={lang === 'ko' ? logoKo : logoEn}
      alt={lang === 'ko' ? '포켓 끼리끼리' : 'Pocket Kinship'}
    />
  );
  // 로고를 누르면 메뉴로 가는 화면(게임 중)에서만 버튼으로 감싼다
  return onClick ? (
    <button type="button" className="brand-link" onClick={onClick}>
      {img}
    </button>
  ) : (
    img
  );
}

export function BoardIcon({ type }) {
  const points = LAYOUT[type];
  return (
    <svg className="board-icon" viewBox="0 0 460 460" aria-hidden="true">
      {boards[type].edges.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={points[a][0]}
          y1={points[a][1]}
          x2={points[b][0]}
          y2={points[b][1]}
        />
      ))}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="27" />
      ))}
    </svg>
  );
}
