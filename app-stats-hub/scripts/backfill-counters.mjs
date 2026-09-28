// 이미 쌓인 apps/{appId}/events 기록을 읽어 counters/summary 와 daily/{날짜} 를 한 번 채운다.
// 그 뒤로는 게임의 analytics.js 가 이벤트를 남길 때마다 스스로 늘린다.
// 실행: npm run backfill  (또는 node scripts/backfill-counters.mjs)
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';

const APP_ID = process.argv[2] ?? 'kinship';
const firebaseConfig = {
  projectId: 'app-stats-hub',
  apiKey: 'AIzaSyC8ylQHndr2wArgUraSAN2_KIlAhr_GRj0',
  authDomain: 'app-stats-hub.firebaseapp.com',
};
const db = getFirestore(initializeApp(firebaseConfig));

const snap = await getDocs(collection(db, 'apps', APP_ID, 'events'));
const events = snap.docs.map((d) => d.data());
console.log(`${events.length}개 기록을 읽었다.`);

const summary = { totalStarts: 0, totalClears: 0, userCount: 0 };
const daily = new Map(); // 'YYYY-MM-DD' -> starts
const users = new Set();

for (const e of events) {
  if (e.clientId) users.add(e.clientId);
  const kind = e.type === 'play_start' ? 'starts' : e.type === 'play_clear' ? 'clears' : null;
  if (!kind) continue;
  summary[e.type === 'play_start' ? 'totalStarts' : 'totalClears']++;
  if (e.scope != null) summary[`scope_${e.scope}_${kind}`] = (summary[`scope_${e.scope}_${kind}`] ?? 0) + 1;
  if (e.board) summary[`board_${e.board}_${kind}`] = (summary[`board_${e.board}_${kind}`] ?? 0) + 1;
  if (e.difficulty) summary[`diff_${e.difficulty}_${kind}`] = (summary[`diff_${e.difficulty}_${kind}`] ?? 0) + 1;
  if (e.type === 'play_start' && e.ts?.seconds) {
    const day = new Date(e.ts.seconds * 1000).toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }
}
summary.userCount = users.size;

// users/{clientId} 존재 마커도 채워둔다 (앞으로 analytics.js 가 "처음 보는 사람인지" 확인할 때 쓴다)
for (const cid of users) await setDoc(doc(db, 'apps', APP_ID, 'users', cid), { ts: new Date() });
await setDoc(doc(db, 'apps', APP_ID, 'counters', 'summary'), summary);
for (const [day, starts] of daily) await setDoc(doc(db, 'apps', APP_ID, 'daily', day), { starts });

console.log('summary:', summary);
console.log(`daily 문서 ${daily.size}개, users 문서 ${users.size}개 썼다.`);
