// app.js
// Wires everything together: auth screens, realtime subscriptions,
// tab routing, and the streak-detection logic.

import { firebaseReady, getFirebaseAuthApi } from "./firebase-config.js";

import { state, setState, onChange } from "./state.js";
import { todayKey, dateKeyDaysAgo, debounce, clamp } from "./utils.js";
import {
  ensureUserProfile,
  getUserProfile,
  createPod,
  subscribePod,
  subscribeHabits,
  subscribeTodayLog,
  fetchLastNDaysLogs,
  updateStreakDoc,
} from "./data.js";
import { renderDashboard } from "./widgets.js";
import { renderInsights, getCurrentWeekDateKeys } from "./insights.js";
import { renderSettings, showStreakCelebration } from "./modals.js";

let auth;
let authApi;
let isUpdatingStreak = false;
let unsubscribed = false;

// ==================== Rendering ====================

function renderAll() {
  renderDashboard();
  renderInsights();
  renderSettings();
}

onChange(renderAll);

const refreshWeekLogs = debounce(async () => {
  if (!state.podId) return;
  const keys = getCurrentWeekDateKeys().filter((k) => k <= todayKey());
  const logs = await fetchLastNDaysLogs(state.podId, keys);
  setState({ weekLogs: logs });
}, 400);

// ==================== Streak detection ====================

function isDayFullyComplete(uid) {
  // Habits with no numeric target (e.g. weight) are comparison-only and
  // don't factor into "did we both hit our goals today".
  const dailyHabits = state.habits.filter(
    (h) => h.frequency === "daily" && (h.type === "boolean" || h.target)
  );
  if (!dailyHabits.length) return false;
  const userLog = (state.todayLog[uid]) || {};
  return dailyHabits.every((h) => {
    const v = userLog[h.id];
    if (h.type === "boolean") return !!v;
    if (!h.target) return false;
    return (v || 0) >= h.target;
  });
}

async function checkStreak() {
  if (isUpdatingStreak) return;
  if (!state.pod || !state.partnerUid || !state.habits.length) return;

  const meDone = isDayFullyComplete(state.uid);
  const partnerDone = isDayFullyComplete(state.partnerUid);
  if (!meDone || !partnerDone) return;

  const today = todayKey();
  const currentStreakInfo = state.pod.streak || { current: 0, best: 0, lastCompletedDate: null };
  if (currentStreakInfo.lastCompletedDate === today) return; // already counted today

  isUpdatingStreak = true;
  try {
    const yesterday = dateKeyDaysAgo(1);
    const newCurrent =
      currentStreakInfo.lastCompletedDate === yesterday ? (currentStreakInfo.current || 0) + 1 : 1;
    const newBest = Math.max(currentStreakInfo.best || 0, newCurrent);
    await updateStreakDoc(state.podId, {
      current: newCurrent,
      best: newBest,
      lastCompletedDate: today,
    });
    if (newCurrent > (state.lastCelebratedStreak || 0)) {
      setState({ lastCelebratedStreak: newCurrent });
      showStreakCelebration(newCurrent);
    }
  } finally {
    isUpdatingStreak = false;
  }
}

// ==================== Subscriptions ====================

function startSubscriptions(podId) {
  subscribePod(podId, (pod) => {
    const partnerUid = (pod.memberIds || []).find((id) => id !== state.uid) || null;
    const partnerName = partnerUid ? pod.memberNames?.[partnerUid] || "পার্টনার" : null;
    const myName = pod.memberNames?.[state.uid] || state.myName;
    setState({ pod, partnerUid, partnerName, myName });
    refreshWeekLogs();
    checkStreak();
  });

  subscribeHabits(podId, (habits) => {
    setState({ habits });
    refreshWeekLogs();
    checkStreak();
  });

  subscribeTodayLog(podId, todayKey(), (todayLog) => {
    setState({ todayLog });
    checkStreak();
  });
}

// ==================== Auth flow ====================

async function loadUserIntoApp(uid, email) {
  let profile = await ensureUserProfile(uid, email, email.split("@")[0]);
  let name = profile.name || email.split("@")[0];
  let podId = profile.podId;

  if (!podId) {
    podId = await createPod(uid, name);
  }

  setState({ uid, email, myName: name, podId });
  startSubscriptions(podId);

  document.getElementById("auth-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;
}

function showAuthScreen() {
  document.getElementById("app-shell").hidden = true;
  document.getElementById("auth-screen").hidden = false;
}

function wireAuthForms() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.authtab;
      document.getElementById("login-form").hidden = which !== "login";
      document.getElementById("signup-form").hidden = which !== "signup";
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    errEl.hidden = true;
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      await authApi.signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      errEl.textContent = describeAuthError(err);
      errEl.hidden = false;
    }
  });

  document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("signup-error");
    errEl.hidden = true;
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    try {
      const cred = await authApi.createUserWithEmailAndPassword(auth, email, password);
      await ensureUserProfile(cred.user.uid, email, name || email.split("@")[0]);
    } catch (err) {
      errEl.textContent = describeAuthError(err);
      errEl.hidden = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => authApi.signOut(auth));

  document.getElementById("reset-config-link").addEventListener("click", () => {
    if (confirm("Firebase কনফিগ মুছে আবার নতুন করে পেস্ট করতে চান?")) {
      window.duopodResetFirebaseConfig();
    }
  });
}

// Turns a raw Firebase Auth error into a Bengali message that still shows
// the underlying error code, since that code (e.g. auth/unauthorized-domain,
// auth/operation-not-allowed, auth/invalid-api-key) is the fastest way to
// diagnose a misconfigured Firebase project.
function describeAuthError(err) {
  const code = err?.code || "unknown";
  const known = {
    "auth/invalid-email": "ইমেইল ঠিকানাটি সঠিক নয়।",
    "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।",
    "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়।",
    "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
    "auth/email-already-in-use": "এই ইমেইলটি আগে থেকেই ব্যবহৃত হচ্ছে।",
    "auth/weak-password": "পাসওয়ার্ড অন্তত ৬ ক্যারেক্টার হতে হবে।",
    "auth/operation-not-allowed":
      "Firebase কনসোলে Email/Password সাইন-ইন এখনো চালু করা হয়নি।",
    "auth/unauthorized-domain":
      "এই ওয়েবসাইটের ডোমেইনটি Firebase কনসোলে Authorized domains-এ যোগ করা হয়নি।",
    "auth/invalid-api-key": "Firebase কনফিগ ভুল বা অসম্পূর্ণ। কনফিগ পরিবর্তন করে আবার চেষ্টা করুন।",
    "auth/network-request-failed": "নেটওয়ার্ক সমস্যা — ইন্টারনেট সংযোগ পরীক্ষা করুন।",
  };
  const base = known[code] || "একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।";
  return `${base} (${code})`;
}

// ==================== Tab routing ====================

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      setState({ currentTab: tab });
      document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
      document.getElementById(`${tab}-screen`).classList.add("active");
      if (tab === "insights") refreshWeekLogs();
    });
  });

  document.getElementById("settings-icon-btn").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="settings"]').click();
  });
}

// ==================== Boot ====================

(async function boot() {
  const { auth: a } = await firebaseReady;
  auth = a;
  authApi = await getFirebaseAuthApi();
  wireAuthForms();
  wireTabs();

  authApi.onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await loadUserIntoApp(user.uid, user.email || "");
      } catch (e) {
        console.error("App load failed:", e);
      }
    } else {
      showAuthScreen();
    }
  });
})();
