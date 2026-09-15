// widgets.js
// Renders the top progress arc and the 2-column widget grid on the dashboard.
// Each widget compares "me" (coral) vs "partner" (cyan) for today.

import { state } from "./state.js";
import { toBn, bnPercent, formatHoursMinutes, clamp } from "./utils.js";
import { openLogPopup } from "./modals.js";

const CORAL = "#FF3B5C";
const CYAN = "#00D2D3";
const EMERALD = "#10B981";

function fmtInt(n) {
  return toBn(Math.round(n || 0).toLocaleString("en-US"));
}

function valueFor(uid, habitId) {
  const day = state.todayLog[uid];
  if (!day) return 0;
  const v = day[habitId];
  return typeof v === "number" ? v : v === true ? 1 : 0;
}

function frac(value, target) {
  if (!target) return 0;
  return clamp(value / target, 0, 1);
}

// -------------------- Top summary arc --------------------

export function computeOverallPercent() {
  // Habits with no numeric target (e.g. weight, which is a comparison-only
  // metric) don't count toward "today's goal completion".
  const habits = state.habits.filter((h) => h.type === "boolean" || h.target);
  if (!habits.length) return 0;
  const { uid, partnerUid } = state;
  let total = 0;
  habits.forEach((h) => {
    let mePct, partnerPct;
    if (h.type === "boolean") {
      mePct = valueFor(uid, h.id) ? 1 : 0;
      partnerPct = partnerUid ? (valueFor(partnerUid, h.id) ? 1 : 0) : mePct;
    } else {
      mePct = frac(valueFor(uid, h.id), h.target);
      partnerPct = partnerUid ? frac(valueFor(partnerUid, h.id), h.target) : mePct;
    }
    total += (mePct + partnerPct) / 2;
  });
  return (total / habits.length) * 100;
}

export function renderArc() {
  const pct = computeOverallPercent();
  const svg = document.getElementById("progress-arc-svg");
  const r = 80;
  const cx = 100,
    cy = 100;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  svg.innerHTML = `
    <defs>
      <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${CORAL}" />
        <stop offset="55%" stop-color="${CYAN}" />
        <stop offset="100%" stop-color="${EMERALD}" />
      </linearGradient>
    </defs>
    <circle class="arc-track" cx="${cx}" cy="${cy}" r="${r}" stroke-dasharray="2 8" />
    <circle class="arc-fill" cx="${cx}" cy="${cy}" r="${r}"
      stroke="url(#arcGradient)"
      stroke-dasharray="${circumference}"
      stroke-dashoffset="${offset}" />
  `;
  document.getElementById("arc-percent").textContent = bnPercent(pct);
  document.getElementById("arc-label-text").textContent = `আজকের লক্ষ্য পূরণ: ${bnPercent(pct)}`;
  document.getElementById("legend-me-name").textContent = state.myName || "আমি";
  document.getElementById("legend-partner-name").textContent = state.partnerUid
    ? state.partnerName || "পার্টনার"
    : "পার্টনার (অপেক্ষমাণ)";
}

// -------------------- Widget renderers --------------------

function ringsSVG(meFrac, partnerFrac) {
  const rOuter = 40,
    rInner = 28,
    cx = 48,
    cy = 48;
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;
  return `
    <svg viewBox="0 0 96 96">
      <circle class="ring-track" cx="${cx}" cy="${cy}" r="${rOuter}" stroke-width="9" />
      <circle class="ring-track" cx="${cx}" cy="${cy}" r="${rInner}" stroke-width="9" />
      <circle class="ring-fill" cx="${cx}" cy="${cy}" r="${rOuter}" stroke-width="9"
        stroke="${CORAL}" stroke-dasharray="${cOuter}" stroke-dashoffset="${cOuter * (1 - meFrac)}" />
      <circle class="ring-fill" cx="${cx}" cy="${cy}" r="${rInner}" stroke-width="9"
        stroke="${CYAN}" stroke-dasharray="${cInner}" stroke-dashoffset="${cInner * (1 - partnerFrac)}" />
    </svg>`;
}

function renderStepsCard(h) {
  const meVal = valueFor(state.uid, h.id);
  const pVal = state.partnerUid ? valueFor(state.partnerUid, h.id) : 0;
  const card = document.createElement("div");
  card.className = "widget-card";
  card.innerHTML = `
    <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
    <div class="widget-body"><div class="rings-wrap">${ringsSVG(frac(meVal, h.target), frac(pVal, h.target))}</div></div>
    <div class="widget-values"><span class="v-me">${fmtInt(meVal)}</span><span class="v-partner">${fmtInt(pVal)}</span></div>
  `;
  return card;
}

function renderSleepCard(h) {
  const meVal = valueFor(state.uid, h.id);
  const pVal = state.partnerUid ? valueFor(state.partnerUid, h.id) : 0;
  const card = document.createElement("div");
  card.className = "widget-card";
  card.innerHTML = `
    <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
    <div class="widget-body">
      <div class="bars-wrap">
        <div class="bar-row"><i class="dot coral"></i>
          <div class="bar-track"><div class="bar-fill" style="width:${frac(meVal, h.target) * 100}%;background:${CORAL}"></div></div>
        </div>
        <div class="bar-row"><i class="dot cyan"></i>
          <div class="bar-track"><div class="bar-fill" style="width:${frac(pVal, h.target) * 100}%;background:${CYAN}"></div></div>
        </div>
      </div>
    </div>
    <div class="widget-values"><span class="v-me">${formatHoursMinutes(meVal)}</span><span class="v-partner">${formatHoursMinutes(pVal)}</span></div>
  `;
  return card;
}

function renderWaterCard(h) {
  const meVal = valueFor(state.uid, h.id);
  const pVal = state.partnerUid ? valueFor(state.partnerUid, h.id) : 0;
  const card = document.createElement("div");
  card.className = "widget-card";
  card.innerHTML = `
    <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
    <div class="widget-body">
      <div class="cylinders-wrap">
        <div>
          <div class="cylinder"><div class="cylinder-fill" style="height:${frac(meVal, h.target) * 100}%;background:${CORAL}"></div></div>
          <div class="cylinder-label">${fmtInt(meVal)}</div>
        </div>
        <div>
          <div class="cylinder"><div class="cylinder-fill" style="height:${frac(pVal, h.target) * 100}%;background:${CYAN}"></div></div>
          <div class="cylinder-label">${fmtInt(pVal)}</div>
        </div>
      </div>
    </div>
    <div class="widget-values"><span>${h.unit || "গ্লাস"}</span><span>লক্ষ্য: ${fmtInt(h.target || 0)}</span></div>
  `;
  return card;
}

function renderWeightCard(h) {
  const meVal = valueFor(state.uid, h.id);
  const pVal = state.partnerUid ? valueFor(state.partnerUid, h.id) : 0;
  const card = document.createElement("div");
  card.className = "widget-card full-width";
  card.innerHTML = `
    <div style="flex:1">
      <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
      <div class="weight-wrap" style="margin-top:10px">
        <div class="weight-row">
          <span class="weight-num" style="color:${CORAL}">${meVal ? fmtInt(meVal) : "—"} <span style="font-size:12px">${h.unit}</span></span>
          <span class="weight-name">${state.myName}</span>
        </div>
        <div class="weight-row">
          <span class="weight-num" style="color:${CYAN}">${pVal ? fmtInt(pVal) : "—"} <span style="font-size:12px">${h.unit}</span></span>
          <span class="weight-name">${state.partnerUid ? state.partnerName : "অপেক্ষমাণ"}</span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function boolRingSVG(color, done) {
  const r = 24,
    cx = 27,
    cy = 27,
    c = 2 * Math.PI * r;
  return `
    <svg viewBox="0 0 54 54">
      <circle class="ring-track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="5" />
      <circle class="ring-fill" cx="${cx}" cy="${cy}" r="${r}" stroke-width="5"
        stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${done ? 0 : c}" />
    </svg>`;
}

function renderBooleanCard(h) {
  const meDone = !!valueFor(state.uid, h.id);
  const pDone = state.partnerUid ? !!valueFor(state.partnerUid, h.id) : false;
  const card = document.createElement("div");
  card.className = "widget-card";
  card.innerHTML = `
    <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
    <div class="widget-body">
      <div class="bool-wrap">
        <div class="bool-avatar-ring">${boolRingSVG(CORAL, meDone)}<span class="bool-check">${meDone ? "✅" : "○"}</span></div>
        <div class="bool-avatar-ring">${boolRingSVG(CYAN, pDone)}<span class="bool-check">${pDone ? "✅" : "○"}</span></div>
      </div>
    </div>
    <div class="widget-values"><span class="v-me">${state.myName}</span><span class="v-partner">${state.partnerUid ? state.partnerName : "—"}</span></div>
  `;
  return card;
}

function renderGenericCountCard(h) {
  const meVal = valueFor(state.uid, h.id);
  const pVal = state.partnerUid ? valueFor(state.partnerUid, h.id) : 0;
  const card = document.createElement("div");
  card.className = "widget-card";
  card.innerHTML = `
    <div class="widget-head"><span class="widget-icon">${h.icon}</span><span class="widget-title">${h.name}</span></div>
    <div class="widget-body">
      <div class="bars-wrap">
        <div class="bar-row"><i class="dot coral"></i>
          <div class="bar-track"><div class="bar-fill" style="width:${frac(meVal, h.target) * 100}%;background:${CORAL}"></div></div>
        </div>
        <div class="bar-row"><i class="dot cyan"></i>
          <div class="bar-track"><div class="bar-fill" style="width:${frac(pVal, h.target) * 100}%;background:${CYAN}"></div></div>
        </div>
      </div>
    </div>
    <div class="widget-values"><span class="v-me">${fmtInt(meVal)} ${h.unit || ""}</span><span class="v-partner">${fmtInt(pVal)} ${h.unit || ""}</span></div>
  `;
  return card;
}

function buildCard(h) {
  let card;
  switch (h.category) {
    case "steps":
      card = renderStepsCard(h);
      break;
    case "sleep":
      card = renderSleepCard(h);
      break;
    case "water":
      card = renderWaterCard(h);
      break;
    case "weight":
      card = renderWeightCard(h);
      break;
    case "boolean":
      card = renderBooleanCard(h);
      break;
    default:
      card = renderGenericCountCard(h);
  }
  card.addEventListener("click", () => openLogPopup(h));
  return card;
}

export function renderWidgetGrid() {
  const grid = document.getElementById("widget-grid");
  const empty = document.getElementById("empty-habits-state");
  grid.innerHTML = "";
  if (!state.habits.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  grid.hidden = false;
  empty.hidden = true;
  state.habits.forEach((h) => grid.appendChild(buildCard(h)));
}

export function renderDashboard() {
  renderArc();
  renderWidgetGrid();
}
