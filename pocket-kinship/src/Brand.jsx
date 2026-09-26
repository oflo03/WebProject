import logoEn from '../output/logos/pocket-kinship-en.png';
import logoKo from '../output/logos/pocket-kinship-ko.png';
import { boards, LAYOUT } from './game.js';

export function Brand({ lang, compact = false }) {
  return (
    <img
      className={compact ? 'brand compact' : 'brand'}
      src={lang === 'ko' ? logoKo : logoEn}
      alt={lang === 'ko' ? '포켓 끼리끼리' : 'Pocket Kinship'}
    />
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
