import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from 'firebase/firestore';

// 여러 웹앱의 통계를 한 곳(app-stats-hub 프로젝트)에 모은다. 이 앱은 apps/kinship/events 에만 쓴다
// (firestore.rules 가 이 경로 밖의 쓰기와, 누구든 읽기·수정·삭제를 전부 막는다).
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

export function track(type, params = {}) {
  addDoc(collection(db, 'apps', APP_ID, 'events'), {
    type,
    ts: serverTimestamp(),
    clientId: clientId(),
    ...params,
  }).catch(() => {}); // 통계 전송 실패가 게임 플레이를 막으면 안 된다
}
