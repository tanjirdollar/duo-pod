// insights.js
// Renders the "ইনসাইটস" tab: pod health gauge (canvas), stat badges,
// and the 7-day (Mon-Sun) split-dot sync tracker.

import { state } from "./state.js";
import { toBn, BN_WEEKDAYS, weekdayIndexMonFirst, todayKey, daysBetween, clamp } from "./utils.js";
import { computeOverallPercent } from "./widgets.js";

const CORAL = "#FF3B5C";
const CYAN = "#00D2D3";

export function getCurrentWeekDateKeys() {
  const today = new Date();
  const jsDay = today.getDay(); // 0 Sun ... 6 Sat
  const mondayOffset = (jsDay + 6) % 7; // days since Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    keys.push(`${y}-${m}-${day}`);
  }
  return keys;
}

function dayCompletion(dateKey) {
  const logs = dateKey === todayKey() ? state.todayLog : state.weekLogs[dateKey] || {};
  const dailyHabits = state.habits.filter(
    (h) => h.frequency === "daily" && (h.type === "boolean" || h.target)
  );
  if (!dailyHabits.length) return { me: null, partner: null };

  const fracFor = (uid) => {
    const userLog = logs[uid] || {};
    const values = dailyHabits.map((h) => {
      const v = userLog[h.id];
      if (h.type === "boolean") return v ? 1 : 0;
      if (!h.target) return 0;
      return clamp((v || 0) / h.target, 0, 1);
    });
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const me = fracFor(state.uid);
  const partner = state.partnerUid ? fracFor(state.partnerUid) : null;
  return { me, partner };
}

// -------------------- Gauge --------------------

function healthLabel(score) {
  if (score >= 85) return "চমৎকার";
  if (score >= 65) return "ভালো করছেন";
  if (score >= 40) return "চেষ্টা চালিয়ে যান";
  return "শুরু করুন";
}

function computeHealthScore() {
  const dailyHabits = state.habits.filter(
    (h) => h.frequency === "daily" && (h.type === "boolean" || h.target)
  );
  if (!dailyHabits.length) return computeOverallPercent();

  const weekKeys = getCurrentWeekDateKeys().filter((k) => k <= todayKey());
  if (!weekKeys.length) return computeOverallPercent();

  let total = 0;
  let count = 0;
  weekKeys.forEach((key) => {
    const { me, partner } = dayCompletion(key);
    if (me === null) return;
    const dayScore = partner === null ? me : (me + partner) / 2;
    total += dayScore;
    count += 1;
  });
  if (!count) return computeOverallPercent();
  return (total / count) * 100;
}

function drawGauge(score) {
  const canvas = document.getElementById("health-gauge");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 200;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH - 20;
  const r = Math.min(cssW / 2 - 20, cssH - 40);

  // Background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI, false);
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#EEEEE9";
  ctx.stroke();

  // Progress arc
  const pct = clamp(score, 0, 100) / 100;
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, CORAL);
  grad.addColorStop(0.55, CYAN);
  grad.addColorStop(1, "#10B981");

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + pct * Math.PI, false);
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.strokeStyle = grad;
  ctx.stroke();

  // Needle-less indicator dot at the end of the progress arc
  const endAngle = Math.PI + pct * Math.PI;
  const dotX = cx + r * Math.cos(endAngle);
  const dotY = cy + r * Math.sin(endAngle);
  ctx.beginPath();
  ctx.arc(dotX, dotY, 9, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1C1C1E";
  ctx.stroke();
}

// -------------------- Stat badges --------------------

function renderStatBadges() {
  const pod = state.pod;
  const streak = (pod && pod.streak) || { current: 0, best: 0 };
  document.getElementById("stat-best-streak").textContent = toBn(streak.best || 0);
  document.getElementById("stat-current-streak").textContent = toBn(streak.current || 0);
  document.getElementById("streak-count-header").textContent = `${toBn(streak.current || 0)} দিন`;

  let daysTogether = 0;
  if (pod && pod.createdAt) {
    const createdDate = pod.createdAt.toDate ? pod.createdAt.toDate() : new Date(pod.createdAt);
    const y = createdDate.getFullYear();
    const m = String(createdDate.getMonth() + 1).padStart(2, "0");
    const d = String(createdDate.getDate()).padStart(2, "0");
    daysTogether = Math.max(0, daysBetween(`${y}-${m}-${d}`, todayKey())) + 1;
  }
  document.getElementById("stat-days-together").textContent = toBn(daysTogether);
}

// -------------------- Weekly sync row --------------------

function renderSyncWeek() {
  const row = document.getElementById("sync-week-row");
  row.innerHTML = "";
  const weekKeys = getCurrentWeekDateKeys();
  const today = todayKey();

  weekKeys.forEach((dateKey, idx) => {
    const isFuture = dateKey > today;
    const { me, partner } = isFuture ? { me: null, partner: null } : dayCompletion(dateKey);
    const meDone = me !== null && me >= 0.999;
    const partnerDone = partner !== null && partner >= 0.999;
    const bothGlow = meDone && partnerDone;

    const wrap = document.createElement("div");
    wrap.className = "sync-day";
    wrap.innerHTML = `
      <div class="split-dot ${bothGlow ? "both-glow" : ""}">
        <div class="half left" style="background:${meDone ? CORAL : "transparent"}"></div>
        <div class="half right" style="background:${partnerDone ? CYAN : "transparent"}"></div>
      </div>
      <div class="sync-day-label">${BN_WEEKDAYS[idx]}</div>
    `;
    row.appendChild(wrap);
  });
}

// -------------------- Public entry --------------------

export function renderInsights() {
  const score = computeHealthScore();
  drawGauge(score);
  document.getElementById("gauge-score").textContent = toBn(Math.round(score));
  document.getElementById("gauge-label").textContent = healthLabel(score);
  renderStatBadges();
  renderSyncWeek();
}
