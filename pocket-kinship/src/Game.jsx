import { useMemo, useState } from 'react';
import { BOARD_NAMES, DIFF_NAMES, LAYOUT, boards, byId, categories, grade, needed, scopeName, sharedCats, sprite } from './game.js';

export default function Game({ puzzle, onNext, onMenu }) {
  const b = boards[puzzle.board];
  const pos = LAYOUT[puzzle.board];
  const k = needed(puzzle.difficulty);
  const nbrs = useMemo(() => {
    const n = Array.from({ length: b.nodes }, () => []);
    for (const [x, y] of b.edges) { n[x].push(y); n[y].push(x); }
    return n;
  }, [b]);

  const [placed, setPlaced] = useState(() => Array(b.nodes).fill(null));
  const [picked, setPicked] = useState(null);
  const [retracts, setRetracts] = useState(0);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState(null); // 잘못 놓아 자동 회수 대기 중인 노드

  const done = flash === null && placed.every(Boolean);
  const tray = puzzle.pokemon.filter((id) => !placed.includes(id));

  const clickNode = (i) => {
    if (flash !== null) return;
    if (placed[i]) { // 놓인 포켓몬을 누르면 회수
      setPlaced(placed.map((v, j) => (j === i ? null : v)));
      setRetracts((r) => r + 1);
      setMsg('');
      return;
    }
    if (!picked) { setMsg('먼저 아래에서 포켓몬을 골라 주세요.'); return; }
    const me = byId.get(picked);
    const bad = nbrs[i].some((j) => placed[j] && sharedCats(me, byId.get(placed[j]), puzzle.scope).length < k);
    setPlaced(placed.map((v, j) => (j === i ? picked : v)));
    setPicked(null);
    setMsg('');
    if (bad) {
      // 일단 놓았다가 잠깐 뒤 자동 회수한다. 어떤 이웃과 안 맞는지는 알려주지 않는다.
      const id = picked;
      setRetracts((r) => r + 1);
      setFlash(i);
      setTimeout(() => {
        setPlaced((cur) => cur.map((v, j) => (j === i && v === id ? null : v)));
        setFlash(null);
      }, 700);
    }
  };

  const reset = () => {
    if (!placed.some(Boolean)) return;
    setPlaced(Array(b.nodes).fill(null));
    setRetracts((r) => r + 1);
    setPicked(null);
    setMsg('');
  };

  return (
    <main className="game">
      <header>
        <button onClick={onMenu}>메뉴</button>
        <span>{scopeName(puzzle.scope)} · {BOARD_NAMES[puzzle.board]} · {DIFF_NAMES[puzzle.difficulty]}</span>
        <span className="count">회수 {retracts}회</span>
        <button onClick={reset}>초기화</button>
      </header>
      <p className="rule">이웃한 노드와 서로 다른 카테고리 {k}개 이상에서 공통점이 있어야 해요.</p>

      <svg className="board" viewBox="0 0 400 400" role="img" aria-label="보드">
        {b.edges.map(([x, y]) => {
          const both = placed[x] && placed[y];
          const cats = both ? sharedCats(byId.get(placed[x]), byId.get(placed[y]), puzzle.scope) : [];
          return (
            <line key={`${x}-${y}`} className={both && flash === null ? 'edge ok' : 'edge'} x1={pos[x][0]} y1={pos[x][1]} x2={pos[y][0]} y2={pos[y][1]}>
              {both && cats.length >= k && <title>{cats.map((c) => categories[c].label).join(', ')}</title>}
            </line>
          );
        })}
        {pos.map(([x, y], i) => {
          const p = placed[i] && byId.get(placed[i]);
          return (
            <g key={i} className={`node ${p ? 'filled' : ''} ${flash === i ? 'wrong' : ''}`} onClick={() => clickNode(i)}>
              <circle cx={x} cy={y} r="34" />
              {p ? <image href={sprite(p)} x={x - 32} y={y - 32} width="64" height="64" /> : <text x={x} y={y + 5} textAnchor="middle">?</text>}
              {p && <text className="name" x={x} y={y + 50} textAnchor="middle">{p.name.ko}</text>}
            </g>
          );
        })}
      </svg>

      {msg && <p className="error">{msg}</p>}

      <ul className="tray">
        {tray.map((id) => (
          <li key={id}>
            <button className={picked === id ? 'on' : ''} onClick={() => { setPicked(picked === id ? null : id); setMsg(''); }}>
              <img src={sprite(byId.get(id))} alt="" />
              <span>{byId.get(id).name.ko}</span>
            </button>
          </li>
        ))}
      </ul>

      {done && (
        <div className="overlay">
          <div className="result">
            <h2>클리어!</h2>
            <p className="grade">{grade(retracts)}</p>
            <p>회수 {retracts}회</p>
            <button className="primary" onClick={onNext}>다음 퍼즐</button>
            <button onClick={onMenu}>메뉴</button>
          </div>
        </div>
      )}
    </main>
  );
}
