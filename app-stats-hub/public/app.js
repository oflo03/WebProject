import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  projectId: 'app-stats-hub',
  apiKey: 'AIzaSyC8ylQHndr2wArgUraSAN2_KIlAhr_GRj0',
  authDomain: 'app-stats-hub.firebaseapp.com',
};
const db = getFirestore(initializeApp(firebaseConfig));

// 통계를 볼 앱 목록. 새 웹앱을 추가하면 여기 한 항목만 더한다 (firestore.rules 의 화이트리스트에도 추가해야 한다).
// dims: 이벤트 필드(field) -> counters/summary 필드 이름 `${prefix}_${값}_starts|clears`. 필터·순위·로그 열이 이걸로 만들어진다.
const BOARDS = { pentagon: '오각형', hexagon: '육각형', square: '사각형' };
const SPEEDER_DIFFS = { easy: '쉬움', normal: '보통', hard: '어려움' };
const SPEEDER_HINTS = { rookie: '포린이', fan: '포덕후', boss: '포대장', legend: '포르세우스' };
const APPS = [
  {
    id: 'kinship',
    name: 'Pocket Kinship',
    desc: '포켓몬 연결 퍼즐',
    dims: [
      { field: 'scope', prefix: 'scope', name: '범위', values: ['all', '1', '2', '3', '4', '5', '6', '7', '8', '9'], label: (s) => (s == null ? '-' : s === 'all' ? '전체' : `${s}세대`) },
      { field: 'board', prefix: 'board', name: '보드', values: Object.keys(BOARDS), label: (b) => BOARDS[b] ?? b ?? '-' },
      { field: 'difficulty', prefix: 'diff', name: '난이도', values: ['easy', 'super', 'expert', 'master'], label: (d) => (d == null ? '-' : d[0].toUpperCase() + d.slice(1)) },
    ],
    detail: (e) => (e.type === 'play_clear' ? `등급 ${e.grade ?? '-'} · 회수 ${e.retracts ?? '-'}회` : '-'),
  },
  {
    id: 'speeder',
    name: 'Pocket Speeder',
    desc: '포켓몬 스파이더 솔리테어',
    dims: [
      { field: 'difficulty', prefix: 'diff', name: '난이도', values: Object.keys(SPEEDER_DIFFS), label: (d) => SPEEDER_DIFFS[d] ?? d ?? '-' },
      { field: 'hints', prefix: 'hint', name: '힌트 수준', values: Object.keys(SPEEDER_HINTS), label: (h) => SPEEDER_HINTS[h] ?? h ?? '-' },
    ],
    detail: () => '-',
  },
];
const TYPE_LABEL = { play_start: '플레이', play_clear: '클리어' };

const root = document.getElementById('root');

// title: 앱 화면이면 앱 이름. 헤더 한 줄에 브랜드 / 앱 이름 / 목록으로 링크를 나란히 둔다.
function shell(body, title) {
  root.innerHTML = `
    <header>
      <a href="#/" class="brand"><span class="dot"></span>Stats Hub</a>
      ${title ? `<span class="crumb-sep">/</span><h2 class="crumb">${title}</h2><a href="#/" class="back-link">← 목록으로</a>` : ''}
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

// data: [날짜, 플레이, 클리어][] — 두 꺾은선을 겹쳐 그린다. 숫자는 플레이는 점 위, 클리어는 점 아래.
// data: [[라벨, 플레이, 클리어], ...]. 일별은 날짜를 MM/DD 로 줄여 일부만, 값별 그래프는 라벨을 전부 쓴다.
function chartSvg(data, { aria = '최근 14일 일별 플레이·클리어 횟수', daily = true } = {}) {
  const w = 680;
  const h = 190;
  const pad = { l: 28, r: 28, t: 22, b: 30 };
  const max = Math.max(1, ...data.flatMap(([, s, c]) => [s, c]));
  const x = (i) => (data.length > 1 ? pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1) : w / 2);
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const everyNth = daily ? Math.ceil(data.length / 7) : 1;
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(max * f)}" y2="${y(max * f)}" class="chart-grid"></line>`).join('');
  const line = (idx, cls, dy) => {
    const pts = data.map((d, i) => `${x(i)},${y(d[idx])}`).join(' ');
    const dots = data
      .map((d, i) => {
        const v = d[idx];
        const label = v > 0 ? `<text x="${x(i)}" y="${y(v) + dy}" class="chart-num ${cls}">${v}</text>` : '';
        return `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" class="chart-dot ${cls}"><title>${d[0]} ${v}</title></circle>${label}`;
      })
      .join('');
    return `<polyline points="${pts}" class="chart-line ${cls}"></polyline>${dots}`;
  };
  const labels = data
    .map(([key], i) => (i % everyNth === 0 ? `<text x="${x(i)}" y="${h - 8}" class="chart-label">${daily ? key.slice(5).replace('-', '/') : key}</text>` : ''))
    .join('');
  return `
    <div class="chart-legend"><span class="key starts"></span>플레이 <span class="key clears"></span>클리어</div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${aria}">
      ${grid}${line(1, 'starts', -9)}${line(2, 'clears', 16)}${labels}
    </svg>`;
}

// 로그 창은 필터 없이 읽어 온 기록을 최신순으로 보여준다
function logRowsHtml(app, events) {
  const sorted = events
    .filter((e) => e.type === 'play_start' || e.type === 'play_clear')
    .sort((a, b) => (b.ts?.seconds ?? 0) - (a.ts?.seconds ?? 0));

  const rows = sorted
    .slice(0, 200)
    .map((e) => {
      const t = e.ts?.seconds ? new Date(e.ts.seconds * 1000).toLocaleString('ko-KR') : '-';
      const dims = app.dims.map((d) => `<td>${d.label(e[d.field])}</td>`).join('');
      return `<tr><td>${t}</td><td>${TYPE_LABEL[e.type] ?? e.type}</td>${dims}<td class="muted">${app.detail(e)}</td></tr>`;
    })
    .join('');

  return { count: sorted.length, rows: rows || `<tr><td colspan="${app.dims.length + 3}" class="muted">아직 기록이 없어요.</td></tr>` };
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
  return dates.map((d, i) => {
    const v = docs[i].exists() ? docs[i].data() : {};
    return [d, v.starts ?? 0, v.clears ?? 0];
  });
}

// filter: 고른 차원 하나 ({prefix, value}) 또는 null(전체)
function statCards(summary, filter) {
  const starts = filter ? (summary[`${filter.prefix}_${filter.value}_starts`] ?? 0) : (summary.totalStarts ?? 0);
  const clears = filter ? (summary[`${filter.prefix}_${filter.value}_clears`] ?? 0) : (summary.totalClears ?? 0);
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

function leaderboardHtml(app, summary, basis) {
  return app.dims
    .map(({ prefix, values, label: labelFn, name: label }) => {
      const top = topFromSummary(summary, prefix, values, labelFn, basis);
      if (!top || top.starts === 0) return `<div class="card"><span class="num">-</span><span class="label">${label} 1위</span></div>`;
      const detail = basis === 'winrate' ? `${Math.round(top.score * 100)}% (${top.starts}판)` : `${top.starts}회 플레이`;
      return `<div class="card"><span class="num">${top.key}</span><span class="label">${label} 1위 · ${detail}</span></div>`;
    })
    .join('');
}

async function appBody(appId) {
  const app = APPS.find((a) => a.id === appId);
  if (!app) {
    document.getElementById('main').innerHTML = `<p>알 수 없는 앱: ${appId}</p>`;
    return;
  }

  document.getElementById('main').innerHTML = `
    <div class="title-row">
      <h3>통계</h3>
      <button id="stats-refresh">↻ 통계 새로고침</button>
    </div>
    <p class="muted" id="stats-updated"></p>
    <div class="filters">
      ${app.dims.map((d, i) => `<select id="f-${i}" aria-label="${d.name}"><option value="">${d.name}: 전체</option>${d.values.map((v) => `<option value="${v}">${d.label(v)}</option>`).join('')}</select>`).join('')}
    </div>
    <div class="stat-cards" id="stat-cards"></div>
    <div class="title-row chart-head">
      <div class="chart-tabs" id="chart-tabs" role="tablist" aria-label="그래프 종류">
        <button role="tab" data-kind="daily">일별</button>
        ${app.dims.map((d, i) => `<button role="tab" data-kind="${i}">${d.name}별</button>`).join('')}
      </div>
      <p class="muted chart-caption" id="chart-caption"></p>
    </div>
    <div class="table-wrap chart-wrap" id="chart-wrap"></div>

    <div class="title-row">
      <h3>인기 순위</h3>
      <select id="basis">
        <option value="popularity">기준: 인기(플레이 횟수)</option>
        <option value="winrate">기준: 승률(클리어율)</option>
      </select>
    </div>
    <div class="stat-cards cols-${app.dims.length}" id="leaderboard"></div>

    <div class="title-row">
      <h3>로그</h3>
      <button id="log-refresh">↻ 로그 새로고침</button>
    </div>
    <p class="muted" id="log-count"></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>시각</th><th>종류</th>${app.dims.map((d) => `<th>${d.name}</th>`).join('')}<th>상세</th></tr></thead>
        <tbody id="log-body"></tbody>
      </table>
    </div>
  `;

  let summary = {};
  let daily = [];

  // 일별은 최근 14일, 나머지는 counters/summary 의 값별 누적. 둘 다 꺾은선이고 추가 읽기는 없다.
  let kind = 'daily';
  const renderChart = () => {
    document.querySelectorAll('#chart-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.kind === kind));
    const cap = document.getElementById('chart-caption');
    const wrap = document.getElementById('chart-wrap');
    if (kind === 'daily') {
      cap.textContent = '최근 14일 일별 플레이·클리어 횟수';
      wrap.innerHTML = chartSvg(daily);
      return;
    }
    const d = app.dims[kind];
    cap.textContent = `${d.name}별 누적 플레이·클리어 횟수`;
    const data = d.values.map((v) => [d.label(v), summary[`${d.prefix}_${v}_starts`] ?? 0, summary[`${d.prefix}_${v}_clears`] ?? 0]);
    wrap.innerHTML = chartSvg(data, { aria: cap.textContent, daily: false });
  };
  // 탭에 마우스를 올리면 바로 넘어가고, 터치 화면에서는 누르면 넘어간다
  document.querySelectorAll('#chart-tabs button').forEach((b) => {
    b.onmouseenter = b.onclick = () => {
      if (kind === b.dataset.kind) return;
      kind = b.dataset.kind;
      renderChart();
    };
  });

  const selects = app.dims.map((_, i) => document.getElementById(`f-${i}`));
  const renderStatCards = () => {
    const i = selects.findIndex((s) => s.value);
    document.getElementById('stat-cards').innerHTML = statCards(summary, i < 0 ? null : { prefix: app.dims[i].prefix, value: selects[i].value });
  };
  const renderLeaderboard = () => {
    document.getElementById('leaderboard').innerHTML = leaderboardHtml(app, summary, document.getElementById('basis').value);
  };

  // 셀렉트 하나를 고르면 나머지는 '전체'로 되돌린다 (조합 카운터가 없어서 하나씩만 지원한다)
  selects.forEach((sel) => {
    sel.onchange = () => {
      selects.filter((x) => x !== sel).forEach((x) => (x.value = ''));
      renderStatCards();
    };
  });
  document.getElementById('basis').onchange = renderLeaderboard;

  // 통계: counters/summary 1건 + daily 14건 = 읽기 15건. 이벤트 전체를 훑지 않는다.
  const loadStats = async () => {
    document.getElementById('stats-updated').textContent = '불러오는 중...';
    try {
      [summary, daily] = await Promise.all([fetchSummary(appId), fetchDaily(appId)]);
      renderStatCards();
      renderChart();
      renderLeaderboard();
      document.getElementById('stats-updated').textContent = `${new Date().toLocaleTimeString('ko-KR')} 기준`;
    } catch (e) {
      document.getElementById('stats-updated').textContent = `통계 불러오기 실패: ${e.message}`;
    }
  };

  // 로그: 오늘(이 기기 시간 기준 0시부터) 기록만 읽는다. 쌓인 기록이 많아져도 읽기 비용은 오늘 판 수만큼이다.
  const loadLog = async () => {
    document.getElementById('log-count').textContent = '불러오는 중...';
    try {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const snap = await getDocs(query(collection(db, 'apps', appId, 'events'), where('ts', '>=', midnight)));
      const { count, rows } = logRowsHtml(app, snap.docs.map((d) => d.data()));
      document.getElementById('log-body').innerHTML = rows;
      document.getElementById('log-count').textContent = `오늘 ${count}건${count > 200 ? ' (최근 200건 표시)' : ''} · ${new Date().toLocaleTimeString('ko-KR')} 기준`;
    } catch (e) {
      document.getElementById('log-count').textContent = `로그 불러오기 실패: ${e.message}`;
    }
  };

  document.getElementById('stats-refresh').onclick = loadStats;
  document.getElementById('log-refresh').onclick = loadLog;
  loadStats();
  // 로그는 접속 시 자동으로 읽지 않는다. '로그 새로고침'을 눌러야 그때 오늘 기록을 읽는다.
  document.getElementById('log-count').textContent = '아직 안 불러왔어요. 새로고침을 눌러 주세요.';
}

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  if (!path) {
    shell(homeBody());
  } else {
    shell(`<p class="muted">불러오는 중...</p>`, APPS.find((a) => a.id === path)?.name ?? path);
    appBody(path);
  }
}

window.addEventListener('hashchange', route);
route();
