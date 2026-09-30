import { initializeApp } from 'firebase/app';
import {
  addDoc, collection, doc, getCountFromServer, getDoc, getDocs, getFirestore, increment, limit, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';

// Stats go to the shared app-stats-hub project, under apps/speeder only (enforced by its firestore.rules).
const APP_ID = 'speeder';
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

function clientId() {
  try {
    let id = localStorage.getItem('clientId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('clientId', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

let userCountChecked = false;
async function ensureUserCounted(cid) {
  if (userCountChecked) return;
  userCountChecked = true;
  try {
    const ref = doc(db, 'apps', APP_ID, 'users', cid);
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, { ts: serverTimestamp() });
    await setDoc(summaryRef, { userCount: increment(1) }, { merge: true });
  } catch {}
}

// Field names must match the stats-hub dashboard: totalStarts/totalClears and diff_<difficulty>_<starts|clears>.
export function track(type, difficulty) {
  if (import.meta.env.DEV) return;
  const cid = clientId();
  ensureUserCounted(cid);
  addDoc(collection(db, 'apps', APP_ID, 'events'), { type, difficulty, ts: serverTimestamp(), clientId: cid }).catch(() => {});

  const kind = type === 'play_start' ? 'starts' : 'clears';
  setDoc(
    summaryRef,
    { [type === 'play_start' ? 'totalStarts' : 'totalClears']: increment(1), [`diff_${difficulty}_${kind}`]: increment(1) },
    { merge: true },
  ).catch(() => {});

  const date = new Date().toISOString().slice(0, 10);
  setDoc(doc(db, 'apps', APP_ID, 'daily', date), { [kind]: increment(1) }, { merge: true }).catch(() => {});
}

// Legend-hint clears only, one board per difficulty: apps/speeder/rankings/{mode}/entries. Ranked by clear time only, fastest first.
const board = (mode) => collection(db, 'apps', APP_ID, 'rankings', mode, 'entries');

export async function submitScore(mode, name, ms, moves) {
  if (import.meta.env.DEV) return 'dev';
  const ref = await addDoc(board(mode), { name, ms, moves, clientId: clientId(), ts: serverTimestamp() });
  return ref.id;
}

export async function topScores(mode, n = 10) {
  const snap = await getDocs(query(board(mode), orderBy('ms'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function rankOf(mode, ms) {
  const snap = await getCountFromServer(query(board(mode), where('ms', '<', ms)));
  return snap.data().count + 1;
}
