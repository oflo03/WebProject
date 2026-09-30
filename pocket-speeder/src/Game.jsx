import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import CARDS from './cards.json';
import { STR } from './i18n.js';
import { track } from './analytics.js';
import { RUN, TYPES, WILD, info, newGame, isRun, canDrop, move, deal, won, bestTarget } from './rules.js';

const byId = new Map(CARDS.map((c) => [c.id, c]));
// Hint setting chosen in the menu: uses per game, or always shown / never available.
export const HINT_LEVELS = ['rookie', 'fan', 'boss', 'legend'];
const HINT_USES = { rookie: Infinity, fan: 10, boss: 3, legend: 0 };
const HINT_MS = 5000;
const BRACKET_MIN = 6;
const clamp =(v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Nearest face-up real (non-joker) card from j going along dir; jokers say nothing about a line's type.
function realCard(list, j, dir) {
  for (; list[j]?.up; j += dir) if (!WILD.includes(list[j].key)) return j;
  return -1;
}

// The type the real card at j plays as, limited to `want`. A dual type takes the type it shares
// with the next real card further along `dir`, else its first matching type.
function playType(list, j, dir, want) {
  const types = info(list[j]).types.filter((t) => want.includes(t));
  if (types.length <= 1) return types[0];
  const next = realCard(list, j + dir, dir);
  return (next >= 0 && playType(list, next, dir, types)) || types[0];
}

// Arceus/Silvally take the type of the nearest real card above them (plate/memory form); Golisopod mega
// evolves when that card plays as steel. No real card above: the one below decides; jokers only: base form.
// While lifted as the head of a stack the form stays, unless the stack under it plays as a different type.
function formArt(list, i, lifted) {
  const { key, up } = list[i];
  const wild = WILD.includes(key);
  if (!up || (!wild && key !== 'golisopod')) return undefined;
  const want = wild ? TYPES : ['water', 'steel'];
  const up_ = realCard(list, i - 1, -1);
  const down = realCard(list, i + 1, 1);
  const above = up_ >= 0 ? playType(list, up_, -1, want) : undefined;
  const below = down >= 0 ? playType(list, down, 1, want) : undefined;
  let t = up_ >= 0 ? above : below;
  if (lifted && below && below !== t) t = below;
  if (wild) return t && `${key}-${t}`;
  return t === 'steel' ? 'golisopod-mega' : undefined;
}

export function Face({ id, lang, art = id }) {
  const [shown, setShown] = useState(art);
  const [fx, setFx] = useState(null);
  useEffect(() => {
    if (art === shown) return;
    setFx(id === 'golisopod' ? 'mega' : 'glow');
    const swap = setTimeout(() => setShown(art), 420);
    const end = setTimeout(() => setFx(null), 1000);
    return () => {
      clearTimeout(swap);
      clearTimeout(end);
    };
  }, [art]);
  const src = `/art/${shown}.webp`;
  const { name: names, spd } = byId.get(id);
  const name = names[lang];
  return (
    <div className="flip">
      <div className="side front">
        <div className="strip">
          <img className="mini" src={src} alt="" draggable={false} />
          <span className="nm">{name}</span>
        </div>
        {!WILD.includes(id) && (
          <span className="spd">
            <strong>{spd}</strong>
          </span>
        )}
        <div className={`art ${fx ? `fx-${fx}` : ''}`}>
          <img src={src} alt={name} draggable={false} />
        </div>
      </div>
      <div className="side back" />
    </div>
  );
}

function layout(s, W, H, intro, drag) {
  const COLS = s.cols.length;
  const gap = clamp(W * 0.012, 4, 14);
  const w = Math.min((W - gap * (COLS + 1)) / COLS, COLS > 5 ? 112 : 140, (H - gap * 4) / (1.4 * 3));
  const narrow = w < 62;
  // Narrow portrait screens have spare height: taller cards and wider reveal strips.
  const h = w * (narrow ? 1.55 : 1.4);
  const x0 = (W - (COLS * w + (COLS - 1) * gap)) / 2;
  const colX = (c) => x0 + c * (w + gap);
  const topY = gap;
  const y0 = topY + h + gap * 2;
  const fu = (narrow ? Math.max(h * 0.44, 22) : Math.max(h * 0.24, 17)) * 0.45;
  const fd = Math.max(h * 0.08, 5);
  const fan = w * 0.14;
  const last = new Set(s.last);
  const items = [];

  const deals = s.stock.length / COLS;
  s.stock.forEach((card, i) => {
    const g = Math.floor(i / COLS);
    items.push({ card, x: colX(COLS - 1) - g * fan, y: topY, z: (6 - g) * 12 + (i % COLS), up: false, d: 0 });
  });

  s.done.forEach((run, r) =>
    run.forEach((card, j) =>
      items.push({ card, x: colX(0) + r * w * 0.2, y: topY, z: 60 + r * 14 + (RUN - j), up: true, done: true, d: 0, art: formArt(run, j) }),
    ),
  );

  const lastIdx = new Map(s.last.map((uid, i) => [uid, i]));
  const brackets = [];
  s.cols.forEach((col, c) => {
    const ys = [];
    const steps = col.slice(0, -1).map((k) => (k.up ? fu : fd));
    const total = steps.reduce((a, b) => a + b, 0);
    const room = Math.max(H - y0 - h - gap, 0);
    const k = total > room ? room / total : 1;
    let y = y0;
    col.forEach((card, i) => {
      const dragged = drag && drag.from === c && i >= drag.i;
      // visible header band: the gap to the next card (shrinks when a long column is squeezed)
      const band = i < steps.length ? Math.min(steps[i] * k, fu) : fu;
      const item = { card, col: c, i, band, covered: i < col.length - 1, x: colX(c), y, z: i + 1 + (last.has(card.uid) ? 300 : 0), up: card.up, d: 0, art: formArt(col, i, dragged && i === drag.i) };
      if (intro) Object.assign(item, { x: colX(COLS - 1), y: topY, up: false, d: (i * COLS + c) * 14 });
      else if (s.dealt && lastIdx.has(card.uid)) item.d = lastIdx.get(card.uid) * 45;
      if (dragged) Object.assign(item, { x: item.x + drag.dx, y: item.y + drag.dy, z: 1000 + i, drag: true });
      items.push(item);
      ys.push(y);
      if (i < steps.length) y += steps[i] * k;
    });
    // Every long ordered same-type stretch in a column gets a bracket with its card count.
    // Stretches are taken greedily from the top, each as long as it stays a valid run.
    if (intro || drag?.from === c) return;
    let i = col.findIndex((x) => x.up);
    while (i >= 0 && i < col.length) {
      let j = i;
      while (j + 1 < col.length && isRun(col.slice(i, j + 2))) j++;
      const n = j - i + 1;
      if (n >= BRACKET_MIN) brackets.push({ key: `${c}-${i}`, n, x: colX(c), top: ys[i], bottom: j === col.length - 1 ? ys[j] + h : ys[j + 1] });
      i = j + 1;
    }
  });

  items.sort((a, b) => a.card.uid - b.card.uid);
  return { items, brackets, w, h, gap, x0, colX, topY, y0, fu, fan, deals, narrow, cols: COLS };
}

export default function Game({ mode, hints = 'boss', lang, onMenu, onNew }) {
  const t = STR[lang];
  const [hint, setHint] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(HINT_USES[hints]);
  const alwaysHint = hints === 'rookie';
  const peek = () => {
    if (hint || !hintsLeft) return;
    setHintsLeft((n) => n - 1);
    setHint(true);
    setTimeout(() => setHint(false), HINT_MS);
  };
  const [hist, setHist] = useState(() => [newGame(mode)]);
  const s = hist.at(-1);
  const isWon = won(s);
  const boardRef = useRef(null);
  const toastRef = useRef(null);
  const winRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [intro, setIntro] = useState(true);
  const [drag, setDrag] = useState(null);
  const [nope, setNope] = useState({ ids: new Set(), n: 0 });
  const [now, setNow] = useState(Date.now);
  const startRef = useRef(Date.now());
  const endRef = useRef(null);
  const doneRef = useRef(0);

  useLayoutEffect(() => {
    const el = boardRef.current;
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = size.w > 0;
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setIntro(false), 60);
    return () => clearTimeout(id);
  }, [ready]);

  useEffect(() => track('play_start', mode), [mode]);

  useEffect(() => {
    if (isWon) {
      if (!endRef.current) track('play_clear', mode);
      endRef.current ??= Date.now();
      return;
    }
    endRef.current = null;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isWon]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const grew = s.done.length > doneRef.current;
    doneRef.current = s.done.length;
    if (!grew || isWon || !toastRef.current) return;
    gsap
      .timeline()
      .fromTo(toastRef.current, { opacity: 0, scale: 0.6, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(2.2)' })
      .to(toastRef.current, { opacity: 0, y: -10, duration: 0.35, delay: 0.8 });
  }, [s.done.length, isWon]);

  useLayoutEffect(() => {
    if (!isWon) return;
    const ctx = gsap.context(() => {
      gsap.from('.win-card', { scale: 0.85, opacity: 0, duration: 0.6, delay: 0.45, ease: 'back.out(1.7)' });
      gsap.from('.win', { opacity: 0, duration: 0.4, delay: 0.3 });
    }, winRef);
    gsap.to('.card.in-done .shake', {
      y: -18,
      duration: 0.28,
      yoyo: true,
      repeat: 1,
      ease: 'power2.out',
      stagger: { each: 0.012, from: 'end' },
    });
    return () => ctx.revert();
  }, [isWon]);

  const L = useMemo(() => (ready ? layout(s, size.w, size.h, intro, drag) : null), [s, size, intro, drag, ready]);

  const commit = (next) => setHist((h) => [...h, next]);
  const undo = () => !isWon && setHist((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const shake = (cards) => {
    const n = Date.now();
    setNope({ ids: new Set(cards.map((c) => c.uid)), n });
    setTimeout(() => setNope((v) => (v.n === n ? { ids: new Set(), n } : v)), 450);
  };

  const onDown = (e, c, i) => {
    if (intro || isWon || e.button > 0) return;
    const run = s.cols[c].slice(i);
    if (!run[0].up) return;
    if (!isRun(run)) return shake(run);
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      setDrag({ from: c, i, dx, dy });
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      if (!moved) {
        const to = bestTarget(s, c, i);
        return to < 0 ? shake(run) : commit(move(s, c, i, to));
      }
      const cx = L.colX(c) + L.w / 2 + (ev.clientX - sx);
      const to = clamp(Math.round((cx - L.x0 - L.w / 2) / (L.w + L.gap)), 0, L.cols - 1);
      if (canDrop(s, c, i, to)) commit(move(s, c, i, to));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const elapsed = (endRef.current ?? now) - startRef.current;
  const boardVars = L && { '--w': `${L.w}px`, '--h': `${L.h}px`, '--fu': `${L.fu}px` };

  return (
    <main className="game">
      <header className="bar">
        <button className="brand" onClick={onMenu} aria-label={t.menu}>
          <img src={`/logo-${lang}.webp`} alt={t.title} />
        </button>
        <div className="stats">
          <Stat label={t.time} value={fmt(elapsed)} />
          <Stat label={t.moves} value={s.moves} />
          <Stat label={t.done} value={`${s.done.length}/${s.goal}`} />
        </div>
        <div className="actions">
          <button className="pill ghost icon" onClick={undo} disabled={hist.length < 2 || isWon} aria-label={t.undo}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
            <span>{t.undo}</span>
          </button>
          {hints === 'fan' || hints === 'boss' ? (
            <button
              className={`pill ghost icon tip ${hint ? 'on' : ''}`}
              onClick={peek}
              disabled={!hint && hintsLeft === 0}
              aria-label={`${t.hint} (${hintsLeft})`}
              data-tip={hintsLeft ? t.hintTip(hintsLeft) : t.hintOut}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
              </svg>
              <span>{t.hint}</span>
              <span className="hint-count">{hintsLeft}</span>
            </button>
          ) : null}
          <button className="pill ghost icon" onClick={onNew} aria-label={t.newGame}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            <span>{t.newGame}</span>
          </button>
        </div>
      </header>

      <div className={`board ${L?.narrow ? 'narrow' : ''} ${hint || alwaysHint ? 'show-spd' : ''}`} ref={boardRef} style={boardVars}>
        {L && (
          <>
            <div className="slot wide" style={{ left: L.colX(0), top: L.topY, width: L.w * (1 + (s.goal - 1) * 0.2) }} />
            <div className="slot" style={{ left: L.colX(L.cols - 1), top: L.topY }} />
            {Array.from({ length: L.cols }, (_, c) => (
              <div key={c} className="slot" style={{ left: L.colX(c), top: L.y0 }} />
            ))}

            {L.items.map(({ card, col, i, x, y, z, up, d, drag: dragged, done, covered, art, band }) => {
              const shaking = nope.ids.has(card.uid);
              return (
                <div
                  key={card.uid}
                  className={`card ${covered ? 'covered' : ''} ${up ? 'up' : ''} ${dragged ? 'drag' : ''} ${shaking ? 'nope' : ''} ${done ? 'in-done' : ''}`}
                  style={{ transform: `translate3d(${x}px, ${y}px, 0)`, zIndex: z, '--d': `${d}ms`, ...(band && { '--band': `${band}px` }) }}
                  onPointerDown={col !== undefined ? (e) => onDown(e, col, i) : undefined}
                >
                  <div className="shake" key={shaking ? nope.n : 0}>
                    <Face id={card.key} art={art} lang={lang} />
                  </div>
                </div>
              );
            })}

            {L.deals > 0 && !intro && (
              <button
                className="stock-hit"
                aria-label={t.deal}
                title={t.deal}
                onClick={() => commit(deal(s))}
                style={{ left: L.colX(L.cols - 1) - (L.deals - 1) * L.fan, top: L.topY, width: L.w + (L.deals - 1) * L.fan }}
              >
                <span className="badge">{L.deals}</span>
              </button>
            )}

            {L.brackets.map(({ key, n, x, top, bottom }) => (
              <div
                key={key}
                className="run-bracket"
                style={{ left: x - Math.max(L.gap * 0.6, 5), top, height: bottom - top, width: Math.max(L.gap * 0.45, 4) }}
              >
                <span>{n}</span>
              </div>
            ))}

            <p className={`hint ${s.moves ? 'gone' : ''}`}>{t.tapHint}</p>
            <div className="toast" ref={toastRef}>
              {t.chain}
            </div>
          </>
        )}
      </div>

      <div className="rotate" role="alert">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="22" y="8" width="20" height="36" rx="4" />
          <rect x="14" y="30" width="36" height="20" rx="4" className="to" />
          <path d="M50 18a14 14 0 0 1 4 12" />
          <path d="m51 26 3 4 3-4" />
        </svg>
        <p>{t.rotate}</p>
      </div>

      {isWon && (
        <div className="win" ref={winRef}>
          <div className="win-card">
            <img src={`/logo-${lang}.webp`} alt="" />
            <h2>{t.win}</h2>
            <p>{t.winSub(fmt(elapsed), s.moves)}</p>
            <div className="win-row">
              <button className="pill gold big" onClick={onNew}>
                {t.again}
              </button>
              <button className="pill ghost" onClick={onMenu}>
                {t.menu}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}


