import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 통계를 볼 앱 목록. 새 웹앱을 추가하면 여기 한 줄만 더한다 (firestore.rules 의 화이트리스트에도 추가해야 한다).
const APPS = [{ id: 'kinship', name: 'Pocket Kinship', desc: '포켓몬 연결 퍼즐' }];

const root = document.getElementById('root');

function render(html) {
  root.innerHTML = html;
}

function loginScreen() {
  render(`
    <div class="center">
      <h1>Stats Hub</h1>
      <p class="muted">등록된 웹앱들의 사용 통계를 봅니다.</p>
      <button id="login" class="primary">Google로 로그인</button>
      <p id="err" class="err"></p>
    </div>
  `);
  document.getElementById('login').onclick = () =>
    signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => {
      document.getElementById('err').textContent = e.message;
    });
}

function shell(user, body) {
  render(`
    <header>
      <a href="#/" class="brand">Stats Hub</a>
      <span class="user">${user.email} <button id="logout">로그아웃</button></span>
    </header>
    <main id="main"></main>
  `);
  document.getElementById('logout').onclick = () => signOut(auth);
  document.getElementById('main').innerHTML = body;
}

function homeBody() {
  return `
    <ul class="app-list">
      ${APPS.map(
        (a) => `
        <li>
          <a href="#/${a.id}">
            <strong>${a.name}</strong>
            <span class="muted">${a.desc}</span>
          </a>
        </li>`,
      ).join('')}
    </ul>
  `;
}

// 원시 이벤트 문서들을 화면에 쓸 숫자들로 집계한다
function summarize(events) {
  const starts = events.filter((e) => e.type === 'play_start');
  const clears = events.filter((e) => e.type === 'play_clear');
  const users = new Set(events.map((e) => e.clientId).filter(Boolean));

  const byKey = new Map(); // "board·difficulty" -> { starts, clears, retracts:[] }
  for (const e of starts) {
    const k = `${e.board ?? '-'} · ${e.difficulty ?? '-'}`;
    if (!byKey.has(k)) byKey.set(k, { starts: 0, clears: 0, retracts: [], grades: {} });
    byKey.get(k).starts++;
  }
  for (const e of clears) {
    const k = `${e.board ?? '-'} · ${e.difficulty ?? '-'}`;
    if (!byKey.has(k)) byKey.set(k, { starts: 0, clears: 0, retracts: [], grades: {} });
    const row = byKey.get(k);
    row.clears++;
    if (typeof e.retracts === 'number') row.retracts.push(e.retracts);
    if (e.grade) row.grades[e.grade] = (row.grades[e.grade] ?? 0) + 1;
  }

  const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-');
  const rows = [...byKey.entries()]
    .sort((a, b) => b[1].starts - a[1].starts)
    .map(
      ([k, v]) => `
      <tr>
        <td>${k}</td>
        <td>${v.starts}</td>
        <td>${v.clears}</td>
        <td>${v.starts ? Math.round((v.clears / v.starts) * 100) + '%' : '-'}</td>
        <td>${avg(v.retracts)}</td>
        <td>${Object.entries(v.grades).map(([g, n]) => `${g}×${n}`).join(' ') || '-'}</td>
      </tr>`,
    )
    .join('');

  return {
    totalStarts: starts.length,
    totalClears: clears.length,
    users: users.size,
    perUser: users.size ? (starts.length / users.size).toFixed(1) : '-',
    rows,
    recent: events
      .slice()
      .sort((a, b) => (b.ts?.seconds ?? 0) - (a.ts?.seconds ?? 0))
      .slice(0, 20),
  };
}

async function appBody(appId) {
  const app = APPS.find((a) => a.id === appId);
  if (!app) return `<p>알 수 없는 앱: ${appId}</p><p><a href="#/">← 목록으로</a></p>`;

  render(document.getElementById('main').innerHTML); // no-op, keeps shell
  document.getElementById('main').innerHTML = `<p class="muted">불러오는 중...</p>`;

  let events;
  try {
    const snap = await getDocs(collection(db, 'apps', appId, 'events'));
    events = snap.docs.map((d) => d.data());
  } catch (e) {
    document.getElementById('main').innerHTML = `<p class="err">불러오기 실패: ${e.message}</p>`;
    return;
  }

  const s = summarize(events);
  document.getElementById('main').innerHTML = `
    <p><a href="#/">← 목록으로</a></p>
    <h2>${app.name}</h2>
    <div class="stat-cards">
      <div class="card"><span class="num">${s.totalStarts}</span><span class="label">시작</span></div>
      <div class="card"><span class="num">${s.totalClears}</span><span class="label">클리어</span></div>
      <div class="card"><span class="num">${s.users}</span><span class="label">플레이어 수</span></div>
      <div class="card"><span class="num">${s.perUser}</span><span class="label">인당 플레이</span></div>
    </div>
    <h3>보드 · 난이도별</h3>
    <table>
      <thead><tr><th>조합</th><th>시작</th><th>클리어</th><th>클리어율</th><th>평균 회수</th><th>등급</th></tr></thead>
      <tbody>${s.rows || '<tr><td colspan="6" class="muted">아직 기록이 없어요.</td></tr>'}</tbody>
    </table>
    <h3>최근 이벤트</h3>
    <table>
      <thead><tr><th>시각</th><th>종류</th><th>내용</th></tr></thead>
      <tbody>
        ${
          s.recent
            .map((e) => {
              const t = e.ts?.seconds ? new Date(e.ts.seconds * 1000).toLocaleString('ko-KR') : '-';
              const { type, ts, clientId, ...rest } = e;
              return `<tr><td>${t}</td><td>${type}</td><td class="muted">${JSON.stringify(rest)}</td></tr>`;
            })
            .join('') || '<tr><td colspan="3" class="muted">-</td></tr>'
        }
      </tbody>
    </table>
  `;
}

function route(user) {
  const path = location.hash.replace(/^#\/?/, '');
  if (!path) {
    shell(user, homeBody());
  } else {
    shell(user, `<p class="muted">불러오는 중...</p>`);
    appBody(path);
  }
}

window.addEventListener('hashchange', () => {
  if (auth.currentUser) route(auth.currentUser);
});

onAuthStateChanged(auth, (user) => {
  if (user) route(user);
  else loginScreen();
});
