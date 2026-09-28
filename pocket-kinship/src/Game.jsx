import { useEffect, useMemo, useRef, useState } from 'react';
import Guide from './Guide.jsx';
import { Brand } from './Brand.jsx';
import { track } from './analytics.js';
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

const MEMO_ROWS = 5;

// 포인터 아래 메모 칸(있다면) 의 인덱스. 메모 칸은 보드처럼 스냅하지 않고 정확히 그 칸 위여야 한다.
function memoSlotAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY)?.closest('[data-memo]');
  return el ? Number(el.dataset.memo) : null;
}

// 포인터 아래 svg 보드를 찾아, 그 안에서 가장 가까운 칸으로 스냅한다. 보드 밖이면 null.
function nodeAt(clientX, clientY, pos) {
  const svg = document.querySelector('svg.board');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse());
  let best = 0;
  let bestDist = Infinity;
  pos.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

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
  const [ghost, setGhost] = useState(null); // 드래그 중인 포켓몬 { id, x, y, node }
  const [hover, setHover] = useState(null); // 드래그 중 포인터 아래의 노드
  const [memoHover, setMemoHover] = useState(null); // 드래그 중 포인터 아래의 메모 칸
  const [memo, setMemo] = useState(() => Array(MEMO_ROWS * 2).fill(null)); // 메모 칸마다 넣어둔 포켓몬 id (복사본, 보드/트레이와 무관)

  // 이 게임(퍼즐 한 판) 동안 실제로 보드에서 이웃해 판정된 적 있는 쌍의 결과. sortedIds.join('|') -> {ok, facts}
  // 보드를 초기화해도 지식은 남는다. 새 퍼즐을 시작하면(컴포넌트가 새로 마운트되며) 같이 리셋된다.
  const tested = useRef(new Map());
  const recordTests = (nextPlaced) => {
    for (const [x, y] of b.edges) {
      const a = nextPlaced[x];
      const c = nextPlaced[y];
      if (!a || !c) continue;
      const key = [a, c].sort().join('|');
      if (tested.current.has(key)) continue;
      const ok = sharedCats(byId.get(a), byId.get(c), puzzle.scope).length >= k;
      tested.current.set(key, { ok, facts: ok ? sharedFacts(byId.get(a), byId.get(c), puzzle.scope, lang) : [] });
    }
  };

  // 이어진 두 노드가 모두 채워져 있을 때, 공통 카테고리 수가 기준(k)을 채우는가
  const linkOk = (x, y) =>
    sharedCats(byId.get(placed[x]), byId.get(placed[y]), puzzle.scope).length >= k;
  const badEdges = b.edges.filter(([x, y]) => placed[x] && placed[y] && !linkOk(x, y));
  const done = placed.every(Boolean) && badEdges.length === 0;
  const tray = puzzle.pokemon.filter((id) => !placed.includes(id));

  // 클리어 이벤트는 done 이 true 로 바뀌는 순간 한 번만 보낸다 (재배치로 다시 true 가 돼도 중복 전송 안 함)
  const cleared = useRef(false);
  useEffect(() => {
    if (done && !cleared.current) {
      cleared.current = true;
      track('play_clear', {
        board: puzzle.board,
        difficulty: puzzle.difficulty,
        scope: String(puzzle.scope),
        retracts,
        grade: grade(retracts),
      });
    }
    if (!done) cleared.current = false;
  }, [done]);

  // 두 노드가 이어져 있고 규칙을 만족할 때 공통점을 설명하는 문장들
  const edgeFacts = (x, y) => {
    const a = byId.get(placed[x]);
    const c = byId.get(placed[y]);
    return sharedCats(a, c, puzzle.scope).length >= k
      ? sharedFacts(a, c, puzzle.scope, lang)
      : [];
  };

  const place = (id, node) => {
    const next = placed.map((v, j) => (j === node ? id : v));
    recordTests(next);
    setPlaced(next);
    setPicked(null);
    setMsg('');
  };

  const retract = (node) => {
    setPlaced(placed.map((v, j) => (j === node ? null : v)));
    setRetracts((r) => r + 1);
    setMsg('');
  };

  // 놓인 포켓몬을 다른 노드로 옮긴다. 빈 노드면 이동, 채워진 노드면 서로 교환. 옮기는 것도 회수 1회로 센다.
  // 이어질 수 없는 자리여도 그대로 놓이고, 빨간 선으로만 보인다.
  const move = (from, to) => {
    const next = placed.slice();
    [next[from], next[to]] = [placed[to], placed[from]];
    recordTests(next);
    setPlaced(next);
    setRetracts((r) => r + 1);
  };

  // 메모 칸을 채운다. 원본은 보드/트레이 어디 있든 그대로 두고 복사본만 넣는다.
  const setMemoSlot = (idx, id) => setMemo((m) => m.map((v, j) => (j === idx ? id : v)));

  const clickMemoSlot = (idx) => {
    if (justDragged.current) return;
    if (memo[idx]) {
      setMemoSlot(idx, null);
      return;
    }
    if (!picked) {
      setMsg(t('pickFirst'));
      return;
    }
    setMemoSlot(idx, picked);
    setPicked(null);
    setMsg('');
  };

  const resetMemo = () => setMemo(Array(MEMO_ROWS * 2).fill(null));

  const drop = (source, x, y, pos) => {
    const memoIdx = memoSlotAt(x, y);
    if (memoIdx !== null) {
      setMemoSlot(memoIdx, source.id);
      return;
    }
    const node = nodeAt(x, y, pos);
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
      setHover(nodeAt(e.clientX, e.clientY, pos));
      setMemoHover(memoSlotAt(e.clientX, e.clientY));
    };
    const end = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      setHover(null);
      setMemoHover(null);
      if (!d?.active) return;
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 50);
      if (e.type === 'pointerup')
        api.current.drop(d.source, e.clientX, e.clientY, pos);
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
    if (e.button > 0) return;
    dragRef.current = { source, sx: e.clientX, sy: e.clientY, active: false };
  };

  const clickNode = (i) => {
    if (justDragged.current) return;
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
              const bad = both && !linkOk(x, y);
              const facts = both && !bad ? edgeFacts(x, y) : [];
              return (
                <line
                  key={`${x}-${y}`}
                  className={bad ? 'edge bad' : both ? 'edge ok' : 'edge'}
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
                  aria-label={`${i + 1}: ${p ? p.name[lang] : t('emptySlot')}`}
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
            {b.edges.map(([x, y]) => {
                if (!placed[x] || !placed[y]) return null;
                const bad = !linkOk(x, y);
                const facts = bad ? [t('noLink')] : edgeFacts(x, y);
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
                  <g key={`l${x}-${y}`} className={bad ? 'edge-label bad' : 'edge-label'}>
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

        <aside className="memo">
          <div className="title-row">
            <h2>{t('memoTitle')}</h2>
            <button onClick={resetMemo}>{t('memoReset')}</button>
          </div>
          <p className="hint">{t('memoHint')}</p>
          <div className="memo-pill">
            {Array.from({ length: MEMO_ROWS }, (_, row) => {
              const ai = row * 2;
              const ci = row * 2 + 1;
              const aId = memo[ai];
              const cId = memo[ci];
              const a = aId && byId.get(aId);
              const c = cId && byId.get(cId);
              const rec = a && c && tested.current.get([aId, cId].sort().join('|'));
              // 배지에는 기호만 쓴다: 칸이 좁아 글자가 다 안 보이던 문제라, 대신 title 로 전체 내용을 보여준다.
              const badgeCls = !a || !c ? '' : rec ? (rec.ok ? 'ok' : 'bad') : 'unknown';
              const badgeText = !a || !c ? '' : rec ? (rec.ok ? '✓' : '✗') : '?';
              const badgeTitle = rec?.ok ? rec.facts.join(' · ') : rec ? t('noLink') : a && c ? t('memoUnknown') : undefined;
              const slot = (idx) => {
                const id = memo[idx];
                const p = id && byId.get(id);
                return (
                  <button
                    key={idx}
                    type="button"
                    data-memo={idx}
                    className={`memo-slot ${p ? 'filled' : ''} ${ghost && memoHover === idx ? 'hover' : ''}`}
                    onClick={() => clickMemoSlot(idx)}
                    aria-label={p ? p.name[lang] : t('emptySlot')}
                  >
                    {p ? <img src={sprite(p)} alt="" draggable={false} /> : <span>?</span>}
                  </button>
                );
              };
              return (
                <div className="memo-row" key={row}>
                  {slot(ai)}
                  <div className="memo-link">
                    {a && c && (
                      <span className={`memo-badge ${badgeCls}`} title={badgeTitle}>
                        {badgeText}
                      </span>
                    )}
                  </div>
                  {slot(ci)}
                </div>
              );
            })}
          </div>
        </aside>

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

          <ul
            className="tray"
            style={{ '--tray-cols': Math.ceil(b.nodes / 2) }} // 모바일에서는 항상 두 줄
          >
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
