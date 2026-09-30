import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

// 여러 웹앱의 통계를 한 곳(app-stats-hub 프로젝트)에 모은다. 이 앱은 apps/kinship 아래에만 쓴다
// (firestore.rules 가 이 경로 밖의 쓰기와, 읽기 이외의 대부분을 막는다).
const APP_ID = 'kinship';
const firebaseConfig = {
  projectId: 'app-stats-hub',
  appId: '1:652443691928:web:5b01c2ed99e7c55de999ed',
  apiKey: 'AIzaSyC8ylQHndr2wArgUraSAN2_KIlAhr_GRj0',
  authDomain: 'app-stats-hub.firebaseapp.com',
  storageBucket: 'app-stats-hub.firebasestorage.app',
  messagingSenderId: '652443691928',
};

const db = getFirestore(initializeApp(firebaseConfig));
const summaryRef = doc(db, 'apps', APP_ID, 'counters', 'summary');

// 브라우저마다 하나씩 갖는 익명 식별자. 인당 이벤트 수(예: 인당 플레이 횟수)를 세는 데 쓴다.
// ponytail: localStorage 하나뿐이라 기기·브라우저를 바꾸면 다른 사람으로 잡힌다. 로그인 붙이면 그때 교체.
function clientId() {
  try {
    const key = 'clientId';
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

// 이 브라우저를 처음 보면(apps/kinship/users 에 없으면) 인원수 카운터를 하나 늘린다.
// 탭 하나 열려 있는 동안은 한 번만 확인한다 (sessionStorage 플래그).
let userCountChecked = false;
async function ensureUserCounted(cid) {
  if (userCountChecked) return;
  userCountChecked = true;
  try {
    const ref = doc(db, 'apps', APP_ID, 'users', cid);
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, { ts: serverTimestamp() });
    await setDoc(summaryRef, { userCount: increment(1) }, { merge: true });
  } catch {
    /* 실패해도 플레이에는 영향 없다 */
  }
}

// 이벤트 하나를 집계 카운터 증가분으로. 대시보드가 참고하는 필드 이름과 맞춰야 한다.
function counterUpdates(type, { scope, board, difficulty } = {}) {
  const kind = type === 'play_start' ? 'starts' : type === 'play_clear' ? 'clears' : null;
  if (!kind) return null;
  const updates = { [type === 'play_start' ? 'totalStarts' : 'totalClears']: increment(1) };
  if (scope != null) updates[`scope_${scope}_${kind}`] = increment(1);
  if (board) updates[`board_${board}_${kind}`] = increment(1);
  if (difficulty) updates[`diff_${difficulty}_${kind}`] = increment(1);
  return updates;
}

export function track(type, params = {}) {
  const cid = clientId();
  ensureUserCounted(cid);

  addDoc(collection(db, 'apps', APP_ID, 'events'), {
    type,
    ts: serverTimestamp(),
    clientId: cid,
    ...params,
  }).catch(() => {}); // 통계 전송 실패가 게임 플레이를 막으면 안 된다

  const updates = counterUpdates(type, params);
  if (updates) setDoc(summaryRef, updates, { merge: true }).catch(() => {});

  const kind = type === 'play_start' ? 'starts' : type === 'play_clear' ? 'clears' : null;
  if (kind) {
    const date = new Date().toISOString().slice(0, 10);
    setDoc(doc(db, 'apps', APP_ID, 'daily', date), { [kind]: increment(1) }, { merge: true }).catch(() => {});
  }
}
