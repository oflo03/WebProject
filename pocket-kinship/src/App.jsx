import { useEffect, useState } from 'react';
import Game from './Game.jsx';
import { DIFFICULTIES, DIFF_NAMES, SCOPES } from './game.js';
import { detectLang, makeT, saveLang } from './i18n.js';

const BOARDS = ['pentagon', 'hexagon', 'square'];

function Choice({ title, options, value, onChange, name }) {
  return (
    <fieldset className="choice">
      <legend>{title}</legend>
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{name(o)}</button>
      ))}
    </fieldset>
  );
}

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const [puzzles, setPuzzles] = useState(null);
  const [scope, setScope] = useState('all');
  const [board, setBoard] = useState('pentagon');
  const [difficulty, setDifficulty] = useState('easy');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState(false);
  const t = makeT(lang);
  const toggleLang = () => setLang(lang === 'ko' ? 'en' : 'ko');

  useEffect(() => { import('../data/puzzles.json').then((m) => setPuzzles(m.default)); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('title');
    saveLang(lang);
  }, [lang]);

  const start = () => {
    const pool = puzzles.filter((p) => p.scope === scope && p.board === board && p.difficulty === difficulty && p.id !== current?.id);
    if (!pool.length) { setError(true); return; }
    setError(false);
    setCurrent(pool[Math.floor(Math.random() * pool.length)]);
  };

  if (current) return <Game key={current.id} puzzle={current} lang={lang} t={t} onLang={toggleLang} onNext={start} onMenu={() => setCurrent(null)} />;

  return (
    <main className="menu">
      <div className="top">
        <h1>{t('title')}</h1>
        <button onClick={toggleLang}>{t('otherLang')}</button>
      </div>
      <p className="sub">{t('subtitle')}</p>
      <Choice title={t('scope')} options={SCOPES} value={scope} onChange={setScope} name={(s) => (s === 'all' ? t('all') : t('gen', s))} />
      <Choice title={t('board')} options={BOARDS} value={board} onChange={setBoard} name={t} />
      <Choice title={t('difficulty')} options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} name={(d) => DIFF_NAMES[d]} />
      {scope !== 'all' && <p className="hint">{t('hintGen')}</p>}
      {difficulty === 'master' && <p className="hint">{t('hintMaster')}</p>}
      {error && <p className="error">{t('noPuzzle')}</p>}
      <button className="primary" disabled={!puzzles} onClick={start}>{puzzles ? t('start') : t('loading')}</button>
    </main>
  );
}
