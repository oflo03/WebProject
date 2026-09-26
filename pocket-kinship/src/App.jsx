import { useEffect, useState } from 'react';
import Game from './Game.jsx';
import { BOARD_NAMES, DIFFICULTIES, DIFF_NAMES, SCOPES, scopeName } from './game.js';

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
  const [puzzles, setPuzzles] = useState(null);
  const [scope, setScope] = useState('all');
  const [board, setBoard] = useState('pentagon');
  const [difficulty, setDifficulty] = useState('easy');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { import('../data/puzzles.json').then((m) => setPuzzles(m.default)); }, []);

  const start = () => {
    const pool = puzzles.filter((p) => p.scope === scope && p.board === board && p.difficulty === difficulty && p.id !== current?.id);
    if (!pool.length) { setError('이 조합의 퍼즐이 없어요. 다른 설정을 골라 주세요.'); return; }
    setError('');
    setCurrent(pool[Math.floor(Math.random() * pool.length)]);
  };

  if (current) return <Game key={current.id} puzzle={current} onNext={start} onMenu={() => setCurrent(null)} />;

  return (
    <main className="menu">
      <h1>Pocket Kinship</h1>
      <p className="sub">포켓몬을 보드에 전부 배치하세요. 이웃한 노드끼리는 공통점이 있어야 해요.</p>
      <Choice title="범위" options={SCOPES} value={scope} onChange={setScope} name={scopeName} />
      <Choice title="보드" options={Object.keys(BOARD_NAMES)} value={board} onChange={setBoard} name={(b) => BOARD_NAMES[b]} />
      <Choice title="난이도" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} name={(d) => DIFF_NAMES[d]} />
      {scope !== 'all' && <p className="hint">세대별 퍼즐에서는 등장 세대가 공통점으로 인정되지 않아요.</p>}
      {difficulty === 'master' && <p className="hint">Master는 이웃한 노드끼리 서로 다른 카테고리 2개에서 공통점이 필요해요.</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!puzzles} onClick={start}>{puzzles ? '시작' : '불러오는 중...'}</button>
    </main>
  );
}
