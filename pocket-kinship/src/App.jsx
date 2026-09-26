import { useEffect, useState } from 'react';
import Game from './Game.jsx';
import Guide from './Guide.jsx';
import { Brand, BoardIcon } from './Brand.jsx';
import { DIFFICULTIES, DIFF_NAMES, SCOPES } from './game.js';
import { detectLang, makeT, saveLang } from './i18n.js';

const BOARDS = ['pentagon', 'hexagon', 'square'];

function Choice({ title, options, value, onChange, name, kind, step }) {
  return (
    <fieldset className={`choice ${kind}`}>
      <legend>
        <span className="step">{step}</span>
        {title}
      </legend>
      <div className="options">
        {options.map((o, i) => (
          <button
            key={o}
            aria-pressed={o === value}
            className={o === value ? 'on' : ''}
            onClick={() => onChange(o)}
          >
            {kind === 'boards' && <BoardIcon type={o} />}
            {kind === 'difficulty' && (
              <span className="difficulty-dots" aria-hidden="true">
                {[0, 1, 2, 3].map((n) => (
                  <i key={n} className={n <= i ? 'lit' : ''} />
                ))}
              </span>
            )}
            <span>{name(o)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const [puzzles, setPuzzles] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [scope, setScope] = useState('all');
  const [board, setBoard] = useState('pentagon');
  const [difficulty, setDifficulty] = useState('easy');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState(false);
  const t = makeT(lang);
  const toggleLang = () => setLang(lang === 'ko' ? 'en' : 'ko');
  const load = () => {
    setLoadError(false);
    import('../data/puzzles.json')
      .then((m) => setPuzzles(m.default))
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [current?.id]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('title');
    saveLang(lang);
  }, [lang]);
  const start = () => {
    const pool = puzzles.filter(
      (p) =>
        p.scope === scope &&
        p.board === board &&
        p.difficulty === difficulty &&
        p.id !== current?.id,
    );
    if (!pool.length) {
      setError(true);
      return;
    }
    setError(false);
    setCurrent(pool[Math.floor(Math.random() * pool.length)]);
  };
  if (current)
    return (
      <Game
        key={current.id}
        puzzle={current}
        lang={lang}
        t={t}
        onLang={toggleLang}
        onNext={start}
        onMenu={() => setCurrent(null)}
      />
    );
  return (
    <main className="menu">
      <nav className="menu-nav" aria-label={t('tools')}>
        <span className="small-brand">
          POCKET KINSHIP <span> / {t('puzzleGame')}</span>
        </span>
        <div className="top-buttons">
          <Guide lang={lang} t={t} scope={scope} difficulty={difficulty} />
          <button onClick={toggleLang}>{t('otherLang')}</button>
        </div>
      </nav>
      <header className="menu-hero">
        <h1>
          <Brand lang={lang} />
        </h1>
        <p className="hero-line">{t('heroLine')}</p>
        <p className="sub">{t('subtitle')}</p>
      </header>
      <section className="setup" aria-label={t('setup')}>
        <div className="setup-heading">
          <div>
            <span className="eyebrow">{t('yourPuzzle')}</span>
            <h2>{t('setup')}</h2>
          </div>
          <span className="setup-note">{t('noTimer')}</span>
        </div>
        <Choice
          step="01"
          kind="scopes"
          title={t('scope')}
          options={SCOPES}
          value={scope}
          onChange={setScope}
          name={(s) => (s === 'all' ? t('all') : t('gen', s))}
        />
        <Choice
          step="02"
          kind="boards"
          title={t('board')}
          options={BOARDS}
          value={board}
          onChange={setBoard}
          name={t}
        />
        <Choice
          step="03"
          kind="difficulty"
          title={t('difficulty')}
          options={DIFFICULTIES}
          value={difficulty}
          onChange={setDifficulty}
          name={(d) => DIFF_NAMES[d]}
        />
        {scope !== 'all' && <p className="hint">{t('hintGen')}</p>}
        {difficulty === 'master' && <p className="hint">{t('hintMaster')}</p>}
        {error && (
          <p className="error" role="alert">
            {t('noPuzzle')}
          </p>
        )}
        {loadError ? (
          <div className="error" role="alert">
            {t('loadError')} <button onClick={load}>{t('retry')}</button>
          </div>
        ) : (
          <button
            className="primary start-button"
            disabled={!puzzles}
            onClick={start}
          >
            <span>{puzzles ? t('start') : t('loading')}</span>
            <span aria-hidden="true">→</span>
          </button>
        )}
      </section>
      <footer className="menu-footer">{t('footerHint')}</footer>
    </main>
  );
}
