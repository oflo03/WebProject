import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  collection,
  doc,
  getDoc,
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

// pocket-kinship 게임이 보내는 값 -> 화면에 보일 한글 이름. counters/summary 의 필드 이름도 이 값들로 만든다.
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

function filterOptions(select, current) {
  return `<option value="">전체</option>${select.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('')}`;
}

// counters/summary 는 apps/{appId}/counters/summary 문서 하나뿐이라 읽기 1건으로 끝난다.
// (범위·보드·난이도를 동시에 좁혀 보는 건 지원하지 않는다 — 그러려면 조합마다 카운터가 따로 필요해서
//  하나만 고르면 나머지 둘은 '전체'로 돌아간다.)
async function fetchSummary(appId) {
  const snap = await getDoc(doc(db, 'apps', appId, 'counters', 'summary'));
  return snap.exists() ? snap.data() : {};
}

// 최근 days 일치 daily/{YYYY-MM-DD} 문서를 하루당 1건씩 읽는다 (14일 = 14건).
async function fetchDaily(appId, days = 14) {
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const docs = await Promise.all(dates.map((d) => getDoc(doc(db, 'apps', appId, 'daily', d))));
  return dates.map((d, i) => [d, docs[i].exists() ? (docs[i].data().starts ?? 0) : 0]);
}

function statCards(summary, filters) {
  let starts = summary.totalStarts ?? 0;
  let clears = summary.totalClears ?? 0;
  if (filters.scope) {
    starts = summary[`scope_${filters.scope}_starts`] ?? 0;
    clears = summary[`scope_${filters.scope}_clears`] ?? 0;
  } else if (filters.board) {
    starts = summary[`board_${filters.board}_starts`] ?? 0;
    clears = summary[`board_${filters.board}_clears`] ?? 0;
  } else if (filters.difficulty) {
    starts = summary[`diff_${filters.difficulty}_starts`] ?? 0;
    clears = summary[`diff_${filters.difficulty}_clears`] ?? 0;
  }
  // 플레이어 수·인당 플레이는 필터와 무관하게 전체 기준이다 (조합별 인원수는 따로 세지 않는다).
  const users = summary.userCount ?? 0;
  const perUser = users ? ((summary.totalStarts ?? 0) / users).toFixed(1) : '-';
  return `
    <div class="card"><span class="num">${starts}</span><span class="label">플레이</span></div>
    <div class="card"><span class="num">${clears}</span><span class="label">클리어</span></div>
    <div class="card"><span class="num">${users}</span><span class="label">플레이어 수</span></div>
    <div class="card"><span class="num">${perUser}</span><span class="label">인당 플레이</span></div>
  `;
}

// counters/summary 의 scope_*/board_*/diff_* 필드에서 basis(인기=플레이 많은 순, 승률=클리어율 높은 순) 1위를 고른다
function topFromSummary(summary, prefix, values, labelFn, basis) {
  let best = null;
  for (const v of values) {
    const starts = summary[`${prefix}_${v}_starts`] ?? 0;
    const clears = summary[`${prefix}_${v}_clears`] ?? 0;
    const score = basis === 'winrate' ? (starts ? clears / starts : -1) : starts;
    if (!best || score > best.score) best = { key: labelFn(v), score, starts, clears };
  }
  return best;
}

function leaderboardHtml(summary, basis) {
  const groups = [
    ['scope', SCOPES, scopeLabel, '범위'],
    ['board', Object.keys(BOARDS), boardLabel, '보드'],
    ['difficulty', DIFFS, diffLabel, '난이도'],
  ];
  return groups
    .map(([dim, values, labelFn, label]) => {
      const top = topFromSummary(summary, dim === 'difficulty' ? 'diff' : dim, values, labelFn, basis);
      if (!top || top.starts === 0) return `<div class="card"><span class="num">-</span><span class="label">${label} 1위</span></div>`;
      const detail = basis === 'winrate' ? `${Math.round(top.score * 100)}% (${top.starts}판)` : `${top.starts}회 플레이`;
      return `<div class="card"><span class="num">${top.key}</span><span class="label">${label} 1위 · ${detail}</span></div>`;
    })
    .join('');
}

async function appBody(appId) {
  const app = APPS.find((a) => a.id === appId);
  if (!app) return `<p>알 수 없는 앱: ${appId}</p><p><a href="#/">← 목록으로</a></p>`;

  document.getElementById('main').innerHTML = `<p class="muted">불러오는 중...</p>`;

  document.getElementById('main').innerHTML = `
    <a href="#/" class="back-link">← 목록으로</a>
    <div class="title-row">
      <h2>${app.name}</h2>
    </div>

    <div class="title-row">
      <h3>통계</h3>
      <button id="stats-refresh">↻ 통계 새로고침</button>
    </div>
    <p class="muted" id="stats-updated"></p>
    <div class="filters">
      <select id="f-scope">${filterOptions(SCOPES, '')}</select>
      <select id="f-board">${filterOptions(Object.keys(BOARDS), '')}</select>
      <select id="f-difficulty">${filterOptions(DIFFS, '')}</select>
    </div>
    <p class="muted">하나만 고를 수 있어요. 고르면 나머지는 '전체'로 돌아가요.</p>
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

    <div class="title-row">
      <h3>로그</h3>
      <button id="log-refresh">↻ 로그 새로고침</button>
    </div>
    <p class="muted" id="log-count"></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>시각</th><th>종류</th><th>범위</th><th>보드</th><th>난이도</th><th>상세</th></tr></thead>
        <tbody id="log-body"></tbody>
      </table>
    </div>
  `;

  let summary = {};

  const renderStatCards = () => {
    const filters = {
      scope: document.getElementById('f-scope').value,
      board: document.getElementById('f-board').value,
      difficulty: document.getElementById('f-difficulty').value,
    };
    document.getElementById('stat-cards').innerHTML = statCards(summary, filters);
  };
  const renderLeaderboard = () => {
    document.getElementById('leaderboard').innerHTML = leaderboardHtml(summary, document.getElementById('basis').value);
  };

  // 셀렉트 하나를 고르면 나머지 둘은 '전체'로 되돌린다 (조합 카운터가 없어서 하나씩만 지원한다)
  ['f-scope', 'f-board', 'f-difficulty'].forEach((id) => {
    document.getElementById(id).onchange = () => {
      ['f-scope', 'f-board', 'f-difficulty'].filter((x) => x !== id).forEach((x) => (document.getElementById(x).value = ''));
      renderStatCards();
    };
  });
  document.getElementById('basis').onchange = renderLeaderboard;

  // 통계: counters/summary 1건 + daily 14건 = 읽기 15건. 이벤트 전체를 훑지 않는다.
  const loadStats = async () => {
    document.getElementById('stats-updated').textContent = '불러오는 중...';
    try {
      const [s, daily] = await Promise.all([fetchSummary(appId), fetchDaily(appId)]);
      summary = s;
      renderStatCards();
      document.getElementById('chart-wrap').innerHTML = chartSvg(daily);
      renderLeaderboard();
      document.getElementById('stats-updated').textContent = `${new Date().toLocaleTimeString('ko-KR')} 기준`;
    } catch (e) {
      document.getElementById('stats-updated').textContent = `통계 불러오기 실패: ${e.message}`;
    }
  };

  // 로그: 원본 이벤트를 전부 읽는다. 기록이 많아지면 이 버튼만 비용이 든다.
  const loadLog = async () => {
    document.getElementById('log-count').textContent = '불러오는 중...';
    try {
      const snap = await getDocs(collection(db, 'apps', appId, 'events'));
      const { count, rows } = logRowsHtml(snap.docs.map((d) => d.data()));
      document.getElementById('log-body').innerHTML = rows;
      document.getElementById('log-count').textContent = `전체 ${count}건${count > 200 ? ' (최근 200건 표시)' : ''} · ${new Date().toLocaleTimeString('ko-KR')} 기준`;
    } catch (e) {
      document.getElementById('log-count').textContent = `로그 불러오기 실패: ${e.message}`;
    }
  };

  document.getElementById('stats-refresh').onclick = loadStats;
  document.getElementById('log-refresh').onclick = loadLog;
  loadStats();
  loadLog();
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
