// data.js
// All Firestore reads/writes live here. Schema:
//
//   users/{uid}                         -> { email, name, podId }
//   pods/{podId}                        -> { memberIds:[uid], memberNames:{uid:name},
//                                             inviteCode, createdAt, streak:{current,best,lastCompletedDate} }
//   pods/{podId}/habits/{habitId}        -> { name, icon, category, type, unit, target, frequency, order, createdBy }
//   pods/{podId}/logs/{YYYY-MM-DD}       -> { data: { [uid]: { [habitId]: value } } }
//
// Keeping one log document per day (holding both partners' values) makes the
// "today" view a single realtime listener and keeps historical reads cheap
// (one getDoc per day needed, addressed directly by date-string id).
//
// Firestore functions are obtained via getFirestoreApi() (see firebase-config.js)
// rather than a static top-level `import ... from "https://...gstatic.com/..."`.
// A static import that fails to load (network/ad-blocker) kills the whole
// module silently; this way a failure surfaces as a normal rejected promise.

import { firebaseReady, getFirestoreApi } from "./firebase-config.js";
import { generateInviteCode } from "./utils.js";

let db;
let fx; // the firestore function bundle: { doc, getDoc, setDoc, ... }

export async function ready() {
  if (!db || !fx) {
    const [{ db: theDb }, api] = await Promise.all([firebaseReady, getFirestoreApi()]);
    db = theDb;
    fx = api;
  }
  return db;
}

// ---------------- Users ----------------

export async function ensureUserProfile(uid, email, name) {
  await ready();
  const ref = fx.doc(db, "users", uid);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) {
    await fx.setDoc(ref, { email, name, podId: null, createdAt: fx.serverTimestamp() });
    return { email, name, podId: null };
  }
  return snap.data();
}

export async function getUserProfile(uid) {
  await ready();
  const snap = await fx.getDoc(fx.doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function setUserPod(uid, podId) {
  await ready();
  await fx.updateDoc(fx.doc(db, "users", uid), { podId });
}

// ---------------- Pods ----------------

export async function createPod(uid, name) {
  await ready();
  const inviteCode = generateInviteCode();
  const podRef = await fx.addDoc(fx.collection(db, "pods"), {
    memberIds: [uid],
    memberNames: { [uid]: name },
    inviteCode,
    createdAt: fx.serverTimestamp(),
    streak: { current: 0, best: 0, lastCompletedDate: null },
  });
  await setUserPod(uid, podRef.id);
  return podRef.id;
}

export async function joinPodByCode(uid, name, code) {
  await ready();
  const q = fx.query(fx.collection(db, "pods"), fx.where("inviteCode", "==", code));
  const snaps = await fx.getDocs(q);
  if (snaps.empty) throw new Error("এই কোড দিয়ে কোনো পড পাওয়া যায়নি।");
  const podDoc = snaps.docs[0];
  const pod = podDoc.data();
  if (pod.memberIds.includes(uid)) {
    await setUserPod(uid, podDoc.id);
    return podDoc.id;
  }
  if (pod.memberIds.length >= 2) {
    throw new Error("এই পড ইতিমধ্যে পূর্ণ।");
  }
  await fx.updateDoc(fx.doc(db, "pods", podDoc.id), {
    memberIds: fx.arrayUnion(uid),
    [`memberNames.${uid}`]: name,
  });
  await setUserPod(uid, podDoc.id);
  return podDoc.id;
}

export async function leavePod(uid, podId) {
  await ready();
  await fx.updateDoc(fx.doc(db, "pods", podId), {
    memberIds: fx.arrayRemove(uid),
  });
  await setUserPod(uid, null);
}

export function subscribePod(podId, cb) {
  ready().then(() => {
    fx.onSnapshot(fx.doc(db, "pods", podId), (snap) => {
      if (snap.exists()) cb({ id: snap.id, ...snap.data() });
    });
  });
}

// ---------------- Habits ----------------

export async function addHabit(podId, uid, habit) {
  await ready();
  const habitsCol = fx.collection(db, "pods", podId, "habits");
  const existing = await fx.getDocs(habitsCol);
  await fx.addDoc(habitsCol, {
    name: habit.name,
    icon: habit.icon,
    category: habit.category,
    type: habit.type, // 'boolean' | 'count'
    unit: habit.unit || "",
    target: habit.target || null,
    frequency: habit.frequency || "daily",
    order: existing.size,
    createdBy: uid,
    createdAt: fx.serverTimestamp(),
  });
}

export function subscribeHabits(podId, cb) {
  ready().then(() => {
    const q = fx.query(fx.collection(db, "pods", podId, "habits"), fx.orderBy("order", "asc"));
    fx.onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  });
}

// ---------------- Logs ----------------

export function subscribeTodayLog(podId, dateKey, cb) {
  ready().then(() => {
    fx.onSnapshot(fx.doc(db, "pods", podId, "logs", dateKey), (snap) => {
      cb(snap.exists() ? snap.data().data || {} : {});
    });
  });
}

export async function writeLogValue(podId, dateKey, uid, habitId, value) {
  await ready();
  const ref = fx.doc(db, "pods", podId, "logs", dateKey);
  await fx.setDoc(
    ref,
    {
      data: { [uid]: { [habitId]: value } },
      updatedAt: fx.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchDateLog(podId, dateKey) {
  await ready();
  const snap = await fx.getDoc(fx.doc(db, "pods", podId, "logs", dateKey));
  return snap.exists() ? snap.data().data || {} : {};
}

export async function fetchLastNDaysLogs(podId, dateKeys) {
  const results = {};
  await Promise.all(
    dateKeys.map(async (key) => {
      results[key] = await fetchDateLog(podId, key);
    })
  );
  return results;
}

// ---------------- Streaks ----------------

export async function updateStreakDoc(podId, streak) {
  await ready();
  await fx.updateDoc(fx.doc(db, "pods", podId), { streak });
}
