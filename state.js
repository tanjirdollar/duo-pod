// state.js
// A minimal shared store. Every module imports `state` for reads and
// calls `setState(patch)` to write + notify subscribers via `onChange`.

export const state = {
  uid: null,
  email: null,
  myName: "আমি",

  podId: null,
  pod: null, // full pod doc: { memberIds, memberNames, inviteCode, createdAt, streak:{current,best,lastCompletedDate} }
  partnerUid: null,
  partnerName: "পার্টনার",

  habits: [], // array of habit docs {id, name, icon, category, type, unit, target, frequency}
  todayLog: {}, // { [uid]: { [habitId]: value } } for today's date doc
  weekLogs: {}, // { [dateKey]: { [uid]: { [habitId]: value } } } for last 7 days

  currentTab: "dashboard",
  lastCelebratedStreak: 0,
};

const bus = new EventTarget();

export function setState(patch) {
  Object.assign(state, patch);
  bus.dispatchEvent(new CustomEvent("change"));
}

export function onChange(callback) {
  bus.addEventListener("change", callback);
}

export function todayDateKeyCached() {
  // Kept simple/live rather than cached across midnight rollovers.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
