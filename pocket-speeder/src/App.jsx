import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import Game, { HINT_LEVELS } from './Game.jsx';
import { STR } from './i18n.js';
import { MODES } from './rules.js';

const store = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

// Only Android honors orientation lock, and only in fullscreen; elsewhere the portrait overlay covers it.
function lockLandscape() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  Promise.resolve(
    document.fullscreenElement ||
      el.requestFullscreen?.({ navigationUI: 'hide' }),
  )
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

export default function App() {
  const [lang, setLang] = useState(() =>
    store.get('lang', navigator.language?.startsWith('ko') ? 'ko' : 'en'),
  );
  const [mode, setMode] = useState(() => store.get('mode', 'hard'));
  const [hints, setHints] = useState(() => store.get('hints', 'boss'));
  const [game, setGame] = useState(0);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = STR[lang].title;
  }, [lang]);

  const toggleLang = () => {
    const next = lang === 'ko' ? 'en' : 'ko';
    setLang(next);
    store.set('lang', next);
    document.documentElement.lang = next;
  };

  if (game)
    return (
      <Game
        key={game}
        mode={mode}
        hints={hints}
        lang={lang}
        onMenu={() => setGame(0)}
        onNew={() => setGame((g) => g + 1)}
      />
    );

  return (
    <Menu
      lang={lang}
      mode={mode}
      hints={hints}
      onHints={(h) => {
        setHints(h);
        store.set('hints', h);
      }}
      onLang={toggleLang}
      onMode={(m) => {
        setMode(m);
        store.set('mode', m);
      }}
      onStart={() => {
        lockLandscape();
        setGame(1);
      }}
    />
  );
}

function Menu({ lang, mode, hints, onHints, onLang, onMode, onStart }) {
  const t = STR[lang];
  const root = useRef(null);
  const rulesRef = useRef(null);
  const ko = lang === 'ko';
  useLayoutEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.menu-logo', {
        y: 12,
        opacity: 0,
        duration: 0.65,
        ease: 'power2.out',
      });
      gsap.from('.menu-rise', {
        y: 12,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        delay: 0.12,
        ease: 'power2.out',
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <main className="menu" ref={root}>
      <nav className="menu-nav" aria-label={ko ? '게임 메뉴' : 'Game menu'}>
        <span className="menu-kicker">
          <span className="kicker-mark" aria-hidden="true">
            ✳
          </span>{' '}
          POCKET SPEEDER{' '}
          <span className="nav-caption">
            {ko ? '작은 카드 정원' : 'A little card garden'}
          </span>
        </span>
        <div className="menu-nav-actions">
          <button className="pill ghost" onClick={() => rulesRef.current.showModal()}>
            {t.howTo}
          </button>
          <button className="pill ghost" onClick={onLang}>
            {t.otherLang}
          </button>
        </div>
      </nav>
      <section className="menu-center">
        <div className="menu-intro">
          <h1 className="menu-title">
            <img
              className="menu-logo"
              src={`/logo-${lang}.webp`}
              alt={t.title}
            />
          </h1>
          <p className="menu-tagline menu-rise">
            {ko
              ? '빠른 친구부터, 차곡차곡.'
              : 'Fast friends. Thoughtful moves.'}
          </p>
        </div>
        <section
          className="setup-panel menu-rise"
          aria-labelledby="setup-title"
        >
          <div className="setup-heading">
            <h2 id="setup-title">
              {ko ? '어떤 난이도로 할까요?' : 'Find your pace'}
            </h2>
          </div>
          <div
            className="modes"
            role="group"
            aria-label={ko ? '난이도' : 'Difficulty'}
          >
            {MODES.map((m, i) => (
              <button
                key={m}
                aria-pressed={mode === m}
                className={`mode ${mode === m ? 'on' : ''}`}
                onClick={() => onMode(m)}
              >
                <span className="mode-pips" aria-hidden="true">
                  {Array.from({ length: [1, 2, 4][i] }, (_, k) => (
                    <span key={k} className="pip" style={{ '--k': k }} />
                  ))}
                </span>
                <span className="mode-copy">
                  <span className="mode-name">{t.modes[m][0]}</span>
                  <span className="mode-desc">{t.modes[m][1]}</span>
                </span>
                <span className="mode-check" aria-hidden="true">
                  {mode === m ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="hint-levels" role="group" aria-label={t.hintLevel}>
            <span className="hint-levels-label">{t.hintLevel}</span>
            <div className="hint-levels-row">
              {HINT_LEVELS.map((h) => (
                <button key={h} aria-pressed={hints === h} className={`hint-level ${hints === h ? 'on' : ''}`} onClick={() => onHints(h)}>
                  <span className="hint-level-name">{t.hintLevels[h][0]}</span>
                  <span className="hint-level-desc">{t.hintLevels[h][1]}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="pill gold big start-game" onClick={onStart}>
            <span>{t.start}</span>
            <span aria-hidden="true">→</span>
          </button>
          <p className="setup-footnote">{t.setupNotes[hints]}</p>
        </section>
        <dialog
          className="howto-dialog"
          ref={rulesRef}
          onClick={(e) => e.target === rulesRef.current && rulesRef.current.close()}
        >
          <div className="howto-dialog-head">
            <h2>{t.howTo}</h2>
            <button className="howto-close" onClick={() => rulesRef.current.close()} aria-label={ko ? '닫기' : 'Close'}>
              ×
            </button>
          </div>
          <ol>
            {t.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </dialog>
      </section>
    </main>
  );
}
