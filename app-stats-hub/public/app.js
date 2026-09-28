import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  collection,
  getDocs,
  getFirestore,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  projectId: 'app-stats-hub',
  apiKey: 'AIzaSyC8ylQHndr2wArgUraSAN2_KIlAhr_GRj0',
  authDomain: 'app-stats-hub.firebaseapp.com',
};
const db = getFirestore(initializeApp(firebaseConfig));

// 통계를 볼 앱 목록. 새 웹앱을 추가하면 여기 한 줄만 더한다 (firestore.rules 의 화이트리스트에도 추가해야 한다).
const APPS = [{ id: 'kinship', name: 'Pocket Kinship', desc: '포켓몬 연결 퍼즐' }];

// pocket-kinship 게임이 보내는 값 -> 화면에 보일 한글 이름
const SCOPES = ['all', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const BOARDS = { pentagon: '오각형', hexagon: '육각형', square: '사각형' };
const DIFFS = ['easy', 'super', 'expert', 'master'];
const scopeLabel = (s) => (s == null ? '-' : s === 'all' ? '전체' : `${s}세대`);
const boardLabel = (b) => BOARDS[b] ?? b ?? '-';
const diffLabel = (d) => (d == null ? '-' : d[0].toUpperCase() + d.slice(1));
const TYPE_LABEL = { play_start: '플레이', play_clear: '클리어' };

const root = document.getElementById('root');

function shell(body) {
  root.innerHTML = `
    <header>
      <a href="#/" class="brand"><span class="dot"></span>Stats Hub</a>
    </header>
    <main id="main">${body}</main>
  `;
}

function homeBody() {
  return `
    <p class="tagline">등록된 웹앱들의 사용 통계를 봅니다.</p>
    <ul class="app-list">
      ${APPS.map(
        (a) => `
        <li>
          <a href="#/${a.id}">
            <span class="icon">🎮</span>
            <strong>${a.name}</strong>
            <span class="muted">${a.desc}</span>
          </a>
        </li>`,
      ).join('')}
    </ul>
  `;
}

// 최근 days 일치 날짜별 시작 횟수. 기록 없는 날도 0으로 채운다 (막대가 끊기지 않게).
function dailyCounts(starts, days = 14) {
  const buckets = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of starts) {
    if (!e.ts?.seconds) continue;
    const key = new Date(e.ts.seconds * 1000).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()];
}

function chartSvg(data) {
  const w = 680;
  const h = 150;
  const padTop = 20;
  const padBottom = 24;
  const max = Math.max(1, ...data.map(([, c]) => c));
  const barW = w / data.length;
  const everyNth = Math.ceil(data.length / 7);
  const bars = data
    .map(([date, c], i) => {
      const barH = (c / max) * (h - padTop - padBottom);
      const x = i * barW;
      const y = h - padBottom - barH;
      const num = c > 0 ? `<text x="${x + barW / 2}" y="${y - 5}" class="chart-num">${c}</text>` : '';
      const label = i % everyNth === 0 ? `<text x="${x + barW / 2}" y="${h - 6}" class="chart-label">${date.slice(5).replace('-', '/')}</text>` : '';
      return `<rect x="${x + 2}" y="${y}" width="${barW - 4}" height="${Math.max(barH, c > 0 ? 2 : 0)}" rx="3" class="chart-bar"></rect>${num}${label}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${bars}</svg>`;
}

// dimension 별("scope"/"board"/"difficulty") 값마다 시작·클리어 수를 모아 basis(인기=시작 많은 순, 승률=클리어율 높은 순) 1위를 고른다
function topBy(starts, clears, dimension, basis) {
  const keyOf = (e) =>
    dimension === 'scope' ? scopeLabel(e.scope) : dimension === 'board' ? boardLabel(e.board) : diffLabel(e.difficulty);
  const counts = new Map();
  for (const e of starts) {
    const k = keyOf(e);
    const row = counts.get(k) ?? { starts: 0, clears: 0 };
    row.starts++;
    counts.set(k, row);
  }
  for (const e of clears) {
    const k = keyOf(e);
    const row = counts.get(k) ?? { starts: 0, clears: 0 };
    row.clears++;
    counts.set(k, row);
  }
  let best = null;
  for (const [k, v] of counts) {
    const score = basis === 'winrate' ? (v.starts ? v.clears / v.starts : -1) : v.starts;
    if (!best || score > best.score) best = { key: k, score, ...v };
  }
  return best;
}

function leaderboardHtml(starts, clears, basis) {
  const cards = [
    ['scope', '범위'],
    ['board', '보드'],
    ['difficulty', '난이도'],
  ].map(([dim, label]) => {
    const top = topBy(starts, clears, dim, basis);
    if (!top) return `<div class="card"><span class="num">-</span><span class="label">${label} 1위</span></div>`;
    const detail = basis === 'winrate' ? `${Math.round(top.score * 100)}% (${top.starts}판)` : `${top.starts}회 플레이`;
    return `<div class="card"><span class="num">${top.key}</span><span class="label">${label} 1위 · ${detail}</span></div>`;
  });
  return cards.join('');
}

// 로그 창은 필터 없이 전체 기록을 최신순으로 보여준다
function logRowsHtml(events) {
  const sorted = events
    .filter((e) => e.type === 'play_start' || e.type === 'play_clear')
    .sort((a, b) => (b.ts?.seconds ?? 0) - (a.ts?.seconds ?? 0));

  const rows = sorted
    .slice(0, 200)
    .map((e) => {
      const t = e.ts?.seconds ? new Date(e.ts.seconds * 1000).toLocaleString('ko-KR') : '-';
      const extra = e.type === 'play_clear' ? `등급 ${e.grade ?? '-'} · 회수 ${e.retracts ?? '-'}회` : '-';
      return `<tr><td>${t}</td><td>${TYPE_LABEL[e.type] ?? e.type}</td><td>${scopeLabel(e.scope)}</td><td>${boardLabel(e.board)}</td><td>${diffLabel(e.difficulty)}</td><td class="muted">${extra}</td></tr>`;
    })
    .join('');

  return { count: sorted.length, rows: rows || '<tr><td colspan="6" class="muted">아직 기록이 없어요.</td></tr>' };
}

// 통계 창의 범위/보드/난이도 필터. 기준값이 비어 있으면(전체) 그 항목은 거르지 않는다.
function applyFilters(events, filters) {
  return events
    .filter((e) => (filters.scope ? e.scope === filters.scope : true))
    .filter((e) => (filters.board ? e.board === filters.board : true))
    .filter((e) => (filters.difficulty ? e.difficulty === filters.difficulty : true));
}

function filterOptions(select, current) {
  return `<option value="">전체</option>${select.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('')}`;
}

async function appBody(appId) {
  const app = APPS.find((a) => a.id === appId);
  if (!app) return `<p>알 수 없는 앱: ${appId}</p><p><a href="#/">← 목록으로</a></p>`;

  document.getElementById('main').innerHTML = `<p class="muted">불러오는 중...</p>`;

  let events;
  try {
    const snap = await getDocs(collection(db, 'apps', appId, 'events'));
    events = snap.docs.map((d) => d.data());
  } catch (e) {
    document.getElementById('main').innerHTML = `<p class="err">불러오기 실패: ${e.message}</p><button id="refresh">다시 시도</button>`;
    document.getElementById('refresh').onclick = () => appBody(appId);
    return;
  }

  const starts = events.filter((e) => e.type === 'play_start');
  const clears = events.filter((e) => e.type === 'play_clear');

  document.getElementById('main').innerHTML = `
    <a href="#/" class="back-link">← 목록으로</a>
    <div class="title-row">
      <h2>${app.name}</h2>
      <button id="refresh">↻ 새로고침</button>
    </div>
    <p class="muted">${new Date().toLocaleTimeString('ko-KR')} 기준</p>

    <div class="title-row">
      <h3>통계</h3>
      <div class="filters">
        <select id="f-scope">${filterOptions(SCOPES, '')}</select>
        <select id="f-board">${filterOptions(Object.keys(BOARDS), '')}</select>
        <select id="f-difficulty">${filterOptions(DIFFS, '')}</select>
      </div>
    </div>
    <div class="stat-cards" id="stat-cards"></div>
    <p class="muted chart-caption">최근 14일 일별 플레이 횟수</p>
    <div class="table-wrap chart-wrap" id="chart-wrap"></div>

    <div class="title-row">
      <h3>인기 순위</h3>
      <select id="basis">
        <option value="popularity">기준: 인기(플레이 횟수)</option>
        <option value="winrate">기준: 승률(클리어율)</option>
      </select>
    </div>
    <div class="stat-cards cols-3" id="leaderboard"></div>

    <h3>로그</h3>
    <p class="muted" id="log-count"></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>시각</th><th>종류</th><th>범위</th><th>보드</th><th>난이도</th><th>상세</th></tr></thead>
        <tbody id="log-body"></tbody>
      </table>
    </div>
  `;

  // 통계 필터는 이미 받아온 events 안에서만 걸러 다시 그린다 (다시 불러오지 않는다)
  const renderStats = () => {
    const filters = {
      scope: document.getElementById('f-scope').value,
      board: document.getElementById('f-board').value,
      difficulty: document.getElementById('f-difficulty').value,
    };
    const fStarts = applyFilters(starts, filters);
    const fClears = applyFilters(clears, filters);
    const users = new Set(fStarts.map((e) => e.clientId).filter(Boolean));
    const perUser = users.size ? (fStarts.length / users.size).toFixed(1) : '-';
    document.getElementById('stat-cards').innerHTML = `
      <div class="card"><span class="num">${fStarts.length}</span><span class="label">플레이</span></div>
      <div class="card"><span class="num">${fClears.length}</span><span class="label">클리어</span></div>
      <div class="card"><span class="num">${users.size}</span><span class="label">플레이어 수</span></div>
      <div class="card"><span class="num">${perUser}</span><span class="label">인당 플레이</span></div>
    `;
    document.getElementById('chart-wrap').innerHTML = chartSvg(dailyCounts(fStarts));
  };
  ['f-scope', 'f-board', 'f-difficulty'].forEach((id) => (document.getElementById(id).onchange = renderStats));
  renderStats();

  // 인기 순위는 통계 필터와 별개로 전체 기록 기준이다
  const renderBoard = () => {
    document.getElementById('leaderboard').innerHTML = leaderboardHtml(starts, clears, document.getElementById('basis').value);
  };
  document.getElementById('basis').onchange = renderBoard;
  renderBoard();

  const { count, rows } = logRowsHtml(events);
  document.getElementById('log-body').innerHTML = rows;
  document.getElementById('log-count').textContent = `전체 ${count}건${count > 200 ? ' (최근 200건 표시)' : ''}`;

  document.getElementById('refresh').onclick = () => appBody(appId);
}

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  if (!path) {
    shell(homeBody());
  } else {
    shell(`<p class="muted">불러오는 중...</p>`);
    appBody(path);
  }
}

window.addEventListener('hashchange', route);
route();
