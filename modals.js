// modals.js
// Goal creation sheet, tap-to-log popup, streak celebration dialog,
// and the settings screen's pairing (invite / join / leave) actions.

import { state, setState } from "./state.js";
import { toBn, initialOf, clamp, todayKey } from "./utils.js";
import {
  addHabit,
  writeLogValue,
  joinPodByCode,
  leavePod,
} from "./data.js";

const PRESETS = [
  { icon: "🚶", name: "হাঁটা", category: "steps", type: "count", unit: "কদম", target: 8000 },
  { icon: "😴", name: "ঘুম", category: "sleep", type: "count", unit: "মিনিট", target: 480 },
  { icon: "🏋️", name: "ব্যায়াম", category: "boolean", type: "boolean" },
  { icon: "💧", name: "পানি পান", category: "water", type: "count", unit: "গ্লাস", target: 8 },
  { icon: "🧘", name: "মেডিটেশন", category: "boolean", type: "boolean" },
  { icon: "📖", name: "বই পড়া", category: "boolean", type: "boolean" },
  { icon: "💊", name: "ভিটামিন/ওষুধ", category: "boolean", type: "boolean" },
  { icon: "⚖️", name: "ওজন", category: "weight", type: "count", unit: "কেজি", target: null },
];

const STEP_BY_CATEGORY = { steps: 100, sleep: 5, water: 1, weight: 0.5 };

// ==================== Goal Creation Modal ====================

const goalModal = document.getElementById("goal-modal");
const presetGrid = document.getElementById("preset-grid");
const nameInput = document.getElementById("custom-goal-name");
const targetInput = document.getElementById("custom-goal-target");
const unitInput = document.getElementById("custom-goal-unit");
const freqSelect = document.getElementById("custom-goal-frequency");
const countFields = document.getElementById("count-fields");
const goalError = document.getElementById("goal-modal-error");
let trackType = "boolean";

function buildPresetGrid() {
  presetGrid.innerHTML = "";
  PRESETS.forEach((p) => {
    const card = document.createElement("div");
    card.className = "preset-card";
    card.innerHTML = `<div class="preset-icon">${p.icon}</div><div class="preset-name">${p.name}</div>`;
    card.addEventListener("click", async () => {
      const already = state.habits.some((h) => h.name === p.name);
      if (already) return;
      card.classList.add("selected");
      try {
        await addHabit(state.podId, state.uid, {
          name: p.name,
          icon: p.icon,
          category: p.category,
          type: p.type,
          unit: p.unit,
          target: p.target,
          frequency: "daily",
        });
        closeGoalModal();
      } catch (e) {
        card.classList.remove("selected");
      }
    });
    presetGrid.appendChild(card);
  });
}

document.querySelectorAll(".toggle-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    trackType = btn.dataset.tracktype;
    countFields.hidden = trackType !== "count";
  });
});

document.getElementById("goal-modal-cancel").addEventListener("click", closeGoalModal);
document.getElementById("add-goal-fab").addEventListener("click", openGoalModal);

document.getElementById("goal-modal-save").addEventListener("click", async () => {
  goalError.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    goalError.textContent = "লক্ষ্যের একটি নাম দিন।";
    goalError.hidden = false;
    return;
  }
  const habit = {
    name,
    icon: "✨",
    category: trackType === "boolean" ? "boolean" : "count",
    type: trackType,
    unit: trackType === "count" ? unitInput.value.trim() || "সংখ্যা" : "",
    target: trackType === "count" ? Number(targetInput.value) || 1 : null,
    frequency: freqSelect.value,
  };
  try {
    await addHabit(state.podId, state.uid, habit);
    closeGoalModal();
  } catch (e) {
    goalError.textContent = "লক্ষ্যটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।";
    goalError.hidden = false;
  }
});

export function openGoalModal() {
  buildPresetGrid();
  nameInput.value = "";
  targetInput.value = "";
  unitInput.value = "";
  freqSelect.value = "daily";
  trackType = "boolean";
  countFields.hidden = true;
  document.querySelectorAll(".toggle-opt").forEach((b, i) => b.classList.toggle("active", i === 0));
  goalError.hidden = true;
  goalModal.hidden = false;
}

export function closeGoalModal() {
  goalModal.hidden = true;
}

goalModal.addEventListener("click", (e) => {
  if (e.target === goalModal) closeGoalModal();
});

// ==================== Tap-to-log Popup ====================

const logPopup = document.getElementById("log-popup");
const logIcon = document.getElementById("log-popup-icon");
const logTitle = document.getElementById("log-popup-title");
const boolSection = document.getElementById("log-popup-boolean");
const countSection = document.getElementById("log-popup-count");
const toggleBtn = document.getElementById("log-popup-toggle-btn");
const toggleIcon = document.getElementById("log-popup-toggle-icon");
const toggleText = document.getElementById("log-popup-toggle-text");
const valueInput = document.getElementById("log-popup-value");
const countLabel = document.getElementById("log-popup-count-label");
const targetText = document.getElementById("log-popup-target-text");

let activeHabit = null;
let boolValue = false;

export function openLogPopup(habit) {
  activeHabit = habit;
  logIcon.textContent = habit.icon;
  logTitle.textContent = habit.name;

  const myLog = (state.todayLog[state.uid] || {})[habit.id];

  if (habit.type === "boolean") {
    boolSection.hidden = false;
    countSection.hidden = true;
    boolValue = !!myLog;
    updateBoolButton();
  } else {
    boolSection.hidden = true;
    countSection.hidden = false;
    countLabel.textContent = `পরিমাণ (${habit.unit || ""})`;
    valueInput.value = myLog || 0;
    targetText.textContent = habit.target
      ? `লক্ষ্যমাত্রা: ${toBn(habit.target)} ${habit.unit || ""}`
      : "";
  }
  logPopup.hidden = false;
}

function updateBoolButton() {
  toggleBtn.classList.toggle("done", boolValue);
  toggleIcon.textContent = boolValue ? "✅" : "○";
  toggleText.textContent = boolValue ? "সম্পন্ন হয়েছে" : "সম্পন্ন হিসেবে চিহ্নিত করুন";
}

toggleBtn.addEventListener("click", () => {
  boolValue = !boolValue;
  updateBoolButton();
});

document.getElementById("log-popup-minus").addEventListener("click", () => {
  const step = STEP_BY_CATEGORY[activeHabit?.category] || 1;
  valueInput.value = Math.max(0, Number(valueInput.value || 0) - step);
});
document.getElementById("log-popup-plus").addEventListener("click", () => {
  const step = STEP_BY_CATEGORY[activeHabit?.category] || 1;
  valueInput.value = Number(valueInput.value || 0) + step;
});

document.getElementById("log-popup-cancel").addEventListener("click", closeLogPopup);
logPopup.addEventListener("click", (e) => {
  if (e.target === logPopup) closeLogPopup();
});

document.getElementById("log-popup-save").addEventListener("click", async () => {
  if (!activeHabit) return;
  const value = activeHabit.type === "boolean" ? boolValue : clamp(Number(valueInput.value) || 0, 0, 999999);
  await writeLogValue(state.podId, todayKey(), state.uid, activeHabit.id, value);
  closeLogPopup();
});

function closeLogPopup() {
  logPopup.hidden = true;
  activeHabit = null;
}

// ==================== Streak Celebration ====================

const streakModal = document.getElementById("streak-modal");
const streakTitle = document.getElementById("streak-modal-title");

export function showStreakCelebration(days) {
  streakTitle.textContent = `${toBn(days)} দিনের ধারা`;
  streakModal.hidden = false;
}

document.getElementById("streak-modal-close").addEventListener("click", () => {
  streakModal.hidden = true;
});

// ==================== Settings: pairing actions ====================

export function renderSettings() {
  document.getElementById("profile-name").textContent = state.myName || "—";
  document.getElementById("profile-email").textContent = state.email || "—";
  document.getElementById("profile-avatar").textContent = initialOf(state.myName);

  const pairingActions = document.getElementById("pairing-actions");
  const leaveBtn = document.getElementById("leave-pod-btn");
  const statusText = document.getElementById("pod-status-text");
  const inviteDisplay = document.getElementById("invite-code-display");

  if (state.partnerUid) {
    statusText.textContent = `সংযুক্ত আছেন: ${state.partnerName || "পার্টনার"}`;
    pairingActions.hidden = true;
    leaveBtn.hidden = false;
  } else {
    statusText.textContent = "পার্টনারের জন্য অপেক্ষা করছে…";
    pairingActions.hidden = false;
    leaveBtn.hidden = false;
    inviteDisplay.textContent = toBn(state.pod?.inviteCode || "——————");
  }
}

document.getElementById("copy-invite-btn").addEventListener("click", async () => {
  const code = state.pod?.inviteCode || "";
  try {
    await navigator.clipboard.writeText(code);
    const btn = document.getElementById("copy-invite-btn");
    const original = btn.textContent;
    btn.textContent = "কপি হয়েছে ✓";
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (e) {
    /* clipboard unavailable — silently ignore */
  }
});

document.getElementById("join-code-btn").addEventListener("click", async () => {
  const input = document.getElementById("join-code-input");
  const errEl = document.getElementById("join-error");
  errEl.hidden = true;
  const code = input.value.trim();
  if (code.length !== 6) {
    errEl.textContent = "৬-সংখ্যার সঠিক কোড দিন।";
    errEl.hidden = false;
    return;
  }
  try {
    const newPodId = await joinPodByCode(state.uid, state.myName, code);
    setState({ podId: newPodId });
    input.value = "";
  } catch (e) {
    errEl.textContent = e.message || "যুক্ত হওয়া যায়নি।";
    errEl.hidden = false;
  }
});

document.getElementById("leave-pod-btn").addEventListener("click", async () => {
  if (!confirm("আপনি কি নিশ্চিতভাবে পড থেকে বিচ্ছিন্ন হতে চান?")) return;
  await leavePod(state.uid, state.podId);
  window.location.reload();
});
