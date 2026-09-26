import { useEffect, useMemo, useRef, useState } from 'react';
import Guide from './Guide.jsx';
import { Brand } from './Brand.jsx';
import {
  DIFF_NAMES,
  LAYOUT,
  boards,
  byId,
  grade,
  needed,
  sharedCats,
  sharedFacts,
  sprite,
} from './game.js';

const MAX_LINES = 4;
// 라벨 배경 상자 너비 (한글은 넓고 영문은 좁다)
const textWidth = (s) =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 11 : 6.2), 8);

const nodeAt = (x, y) => {
  const g = document.elementFromPoint(x, y)?.closest('[data-node]');
  return g ? Number(g.dataset.node) : null;
};

export default function Game({ puzzle, lang, t, onLang, onNext, onMenu }) {
  const b = boards[puzzle.board];
  const pos = LAYOUT[puzzle.board];
  const k = needed(puzzle.difficulty);
  const nbrs = useMemo(() => {
    const n = Array.from({ length: b.nodes }, () => []);
    for (const [x, y] of b.edges) {
      n[x].push(y);
      n[y].push(x);
    }
    return n;
  }, [b]);

  const [placed, setPlaced] = useState(() => Array(b.nodes).fill(null));
  const [picked, setPicked] = useState(null);
  const [retracts, setRetracts] = useState(0);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState(null); // 잘못 놓아 자동 회수 대기 중인 노드
  const [ghost, setGhost] = useState(null); // 드래그 중인 포켓몬 { id, x, y, node }
  const [hover, setHover] = useState(null); // 드래그 중 포인터 아래의 노드

  const done = flash === null && placed.every(Boolean);
  const tray = puzzle.pokemon.filter((id) => !placed.includes(id));

  // id 포켓몬을 cfg 배치의 node 자리에 놓았을 때 이웃 조건을 만족하는가 (cfg[node] 자신은 무시)
  const fits = (id, node, cfg) =>
    nbrs[node].every(
      (j) =>
        !cfg[j] ||
        sharedCats(byId.get(id), byId.get(cfg[j]), puzzle.scope).length >= k,
    );

  // 두 노드가 이어져 있고 규칙을 만족할 때 공통점을 설명하는 문장들
  const edgeFacts = (x, y) => {
    const a = byId.get(placed[x]);
    const c = byId.get(placed[y]);
    return sharedCats(a, c, puzzle.scope).length >= k
      ? sharedFacts(a, c, puzzle.scope, lang)
      : [];
  };

  // 일단 놓았다가 잠깐 뒤 자동 회수한다. 어떤 이웃과 안 맞는지는 알려주지 않는다.
  const wrong = (node, id) => {
    setRetracts((r) => r + 1);
    setFlash(node);
    setTimeout(() => {
      setPlaced((cur) =>
        cur.map((v, j) => (j === node && v === id ? null : v)),
      );
      setFlash(null);
    }, 700);
  };

  const place = (id, node) => {
    setPlaced(placed.map((v, j) => (j === node ? id : v)));
    setPicked(null);
    setMsg('');
    if (!fits(id, node, placed)) wrong(node, id);
  };

  const retract = (node) => {
    setPlaced(placed.map((v, j) => (j === node ? null : v)));
    setRetracts((r) => r + 1);
    setMsg('');
  };

  // 놓인 포켓몬을 다른 노드로 옮긴다. 빈 노드면 이동, 채워진 노드면 서로 교환. 옮기는 것도 회수 1회로 센다.
  const move = (from, to) => {
    const id = placed[from];
    const next = placed.slice();
    if (!placed[to]) {
      next[from] = null;
      next[to] = id;
      setPlaced(next);
      if (!fits(id, to, next)) wrong(to, id);
      else {
        setRetracts((r) => r + 1);
      }
      return;
    }
    [next[from], next[to]] = [placed[to], id];
    if (fits(next[from], from, next) && fits(next[to], to, next)) {
      setPlaced(next);
      setRetracts((r) => r + 1);
    } else {
      wrong(to, null); // 교환이 안 맞으면 배치는 그대로 두고 감점만
    }
  };

  const drop = (source, x, y) => {
    const node = nodeAt(x, y);
    if (source.from === 'tray') {
      if (node !== null && !placed[node]) place(source.id, node);
    } else if (node === null) {
      retract(source.node); // 보드 밖으로 끌어내면 회수
    } else if (node !== source.node) {
      move(source.node, node);
    }
  };

  // 드래그: 포인터 이벤트라 마우스와 터치 모두 된다. 조금 움직이기 전에는 클릭으로 본다.
  const dragRef = useRef(null);
  const justDragged = useRef(false);
  const api = useRef();
  api.current = { drop };

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (
        !d ||
        (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8)
      )
        return;
      d.active = true;
      setGhost({
        id: d.source.id,
        x: e.clientX,
        y: e.clientY,
        node: d.source.node,
      });
      setHover(nodeAt(e.clientX, e.clientY));
    };
    const end = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      setHover(null);
      if (!d?.active) return;
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 50);
      if (e.type === 'pointerup')
        api.current.drop(d.source, e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const startDrag = (e, source) => {
    if (flash !== null || e.button > 0) return;
    dragRef.current = { source, sx: e.clientX, sy: e.clientY, active: false };
  };

  const clickNode = (i) => {
    if (flash !== null || justDragged.current) return;
    if (placed[i]) {
      retract(i);
      return;
    }
    if (!picked) {
      setMsg(t('pickFirst'));
      return;
    }
    place(picked, i);
  };

  const clickTray = (id) => {
    if (justDragged.current) return;
    setPicked(picked === id ? null : id);
    setMsg('');
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
      <header className="game-header">
        <button className="back-button" onClick={onMenu}>
          ← {t('menu')}
        </button>
        <Brand lang={lang} compact />
        <div className="top-buttons">
          <Guide
            lang={lang}
            t={t}
            scope={puzzle.scope}
            difficulty={puzzle.difficulty}
          />
          <button onClick={onLang}>{t('otherLang')}</button>
        </div>
      </header>
      <div className="play-layout">
        <section className="play-surface">
          <header className="board-toolbar">
            <span>
              {puzzle.scope === 'all' ? t('all') : t('gen', puzzle.scope)} ·{' '}
              {t(puzzle.board)} · {DIFF_NAMES[puzzle.difficulty]}
            </span>
            <span className="count">{t('retracts', retracts)}</span>
            <button onClick={reset}>{t('reset')}</button>
          </header>
          <p className="rule">{t('rule', k)}</p>

          <svg
            className="board"
            viewBox="0 0 460 460"
            role="group"
            aria-label={t('boardLabel')}
          >
            {b.edges.map(([x, y]) => {
              const both = placed[x] && placed[y];
              const facts = both ? edgeFacts(x, y) : [];
              return (
                <line
                  key={`${x}-${y}`}
                  className={both && flash === null ? 'edge ok' : 'edge'}
                  x1={pos[x][0]}
                  y1={pos[x][1]}
                  x2={pos[y][0]}
                  y2={pos[y][1]}
                >
                  {facts.length > 0 && <title>{facts.join(' · ')}</title>}
                </line>
              );
            })}
            {pos.map(([x, y], i) => {
              const p = placed[i] && byId.get(placed[i]);
              const cls = [
                'node',
                p && 'filled',
                flash === i && 'wrong',
                ghost && hover === i && 'hover',
                ghost?.node === i && 'dragging',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <g
                  key={i}
                  data-node={i}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-label={`${i + 1}: ${p ? p.name[lang] : t('emptyNode')}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      clickNode(i);
                    }
                  }}
                  onClick={() => clickNode(i)}
                  onPointerDown={(e) =>
                    p && startDrag(e, { from: 'node', node: i, id: p.id })
                  }
                >
                  <circle cx={x} cy={y} r="34" />
                  {p ? (
                    <image
                      href={sprite(p)}
                      x={x - 32}
                      y={y - 32}
                      width="64"
                      height="64"
                    />
                  ) : (
                    <text x={x} y={y + 5} textAnchor="middle">
                      ?
                    </text>
                  )}
                  {p && (
                    <text className="name" x={x} y={y + 50} textAnchor="middle">
                      {p.name[lang]}
                    </text>
                  )}
                </g>
              );
            })}
            {flash === null &&
              b.edges.map(([x, y]) => {
                if (!placed[x] || !placed[y]) return null;
                const facts = edgeFacts(x, y);
                const lines =
                  facts.length > MAX_LINES
                    ? [
                        ...facts.slice(0, MAX_LINES - 1),
                        `+${facts.length - MAX_LINES + 1}`,
                      ]
                    : facts;
                const mx = (pos[x][0] + pos[y][0]) / 2;
                const my = (pos[x][1] + pos[y][1]) / 2;
                return (
                  <g key={`l${x}-${y}`} className="edge-label">
                    {lines.map((txt, n) => {
                      const w = textWidth(txt);
                      const cy = my + (n - (lines.length - 1) / 2) * 16;
                      return (
                        <g key={n}>
                          <rect
                            x={mx - w / 2}
                            y={cy - 8}
                            width={w}
                            height="15"
                            rx="4"
                          />
                          <text x={mx} y={cy + 3.5} textAnchor="middle">
                            {txt}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
          </svg>

          <div className="board-status" aria-live="polite">
            {msg ? (
              <p className="error">{msg}</p>
            ) : (
              <span>
                {t('progress')}{' '}
                <strong>
                  {placed.filter(Boolean).length} / {b.nodes}
                </strong>
              </span>
            )}
          </div>
        </section>
        <aside className="team-panel">
          <span className="eyebrow">{DIFF_NAMES[puzzle.difficulty]}</span>
          <h2>{t('team')}</h2>
          <p className="hint">{t('trayHint')}</p>

          {done && (
            <div className="result">
              <h3>{t('clear')}</h3>
              <p className="grade">{grade(retracts)}</p>
              <p>{t('retracts', retracts)}</p>
              <button onClick={onMenu}>{t('menu')}</button>
              <button className="primary" onClick={onNext}>
                {t('next')}
              </button>
            </div>
          )}

          <ul className="tray">
            {tray.map((id) => (
              <li key={id}>
                <button
                  aria-pressed={picked === id}
                  className={`${picked === id ? 'on' : ''} ${ghost?.id === id && ghost.node === undefined ? 'dragging' : ''}`}
                  onClick={() => clickTray(id)}
                  onPointerDown={(e) => startDrag(e, { from: 'tray', id })}
                >
                  <img src={sprite(byId.get(id))} alt="" draggable={false} />
                  <span>{byId.get(id).name[lang]}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {ghost && (
        <img
          className="ghost"
          src={sprite(byId.get(ghost.id))}
          alt=""
          draggable={false}
          style={{ left: ghost.x, top: ghost.y }}
        />
      )}

    </main>
  );
}
