import { useEffect, useRef, useState } from 'react';
import { categories } from './game.js';
import { CATEGORY_DESC, valueLabel } from './guideText.js';

// 카테고리 설명 버튼. 마우스를 올리면 큰 창이 뜨고, 눌러서 고정할 수도 있다 (터치용).
export default function Guide({ lang, t, scope = 'all', difficulty }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef();
  // 버튼이 막 생겼을 때 마우스가 그 자리에 있어도 설명 창이 저절로 뜨지 않게, 잠깐 뒤부터 호버를 받는다
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(id);
  }, []);
  const enter = () => { if (!armed) return; clearTimeout(timer.current); setHover(true); };
  const leave = () => { timer.current = setTimeout(() => setHover(false), 200); };
  const open = hover || pinned;
  const noGen = scope !== 'all';

  return (
    <div className="guide" onMouseEnter={enter} onMouseLeave={leave}>
      <button onClick={() => setPinned(!pinned)} aria-expanded={open}>{t('guideButton')}</button>
      {open && (
        <div className="guide-panel" role="dialog" aria-label={t('guideTitle')}>
          <div className="guide-head">
            <h2>{t('guideTitle')}</h2>
            <button onClick={() => { setPinned(false); setHover(false); }}>{t('guideClose')}</button>
          </div>
          <p>{t('guideIntro')}</p>
          {(difficulty === 'expert' || difficulty === 'master') && <p>{t('guideMaster')}</p>}
          {noGen && <p>{t('guideNoGen')}</p>}
          {Object.entries(categories).map(([c, def]) => {
            const keys = Object.keys(def.values);
            const labels = keys.map((v) => valueLabel(lang, c, v, def.values[v]));
            if (c === 'trainer') labels.sort((x, y) => x.localeCompare(y, lang)); // 이름 순
            return (
              <section key={c} className={noGen && c === 'generation' ? 'off' : ''}>
                <h3>{def.label[lang]}</h3>
                <p>{CATEGORY_DESC[lang][c]}</p>
                {c === 'abilities'
                  ? <p className="muted">{t('guideAbilities', keys.length)}</p>
                  : <ul>{labels.map((l) => <li key={l}>{l}</li>)}</ul>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
