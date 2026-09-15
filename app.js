/**
 * Duo Pod - Main Application Controller
 * Orchestrates Real-time Sync, State, User Actions, and Celebrations.
 */

import { firebaseService } from "./firebase-config.js";
import { drawSpeedometer, renderWidgetVisual, renderWeeklySync, toBengaliNumber } from "./widgets.js";

class DuoApp {
  constructor() {
    this.currentDateStr = this.getTodayDateString();
    this.activeHabitForLog = null;
    this.tempLogValue = 0;
    
    // Core default preset habits
    this.defaultHabits = [
      { id: "steps", name: "হাঁটা", emoji: "👟", type: "number", target: 10000, unit: "কদম", preset: "steps" },
      { id: "water", name: "পানি পান", emoji: "💧", type: "number", target: 8, unit: "গ্লাস", preset: "water" },
      { id: "sleep", name: "পর্যাপ্ত ঘুম", emoji: "🌙", type: "number", target: 8, unit: "ঘণ্টা", preset: "sleep" },
      { id: "weight", name: "ওজন পর্যবেক্ষণ", emoji: "⚖️", type: "number", target: 68, unit: "কেজি", preset: "weight" },
      { id: "reading", name: "বই পড়া", emoji: "📖", type: "number", target: 20, unit: "পৃষ্ঠা", preset: "reading" },
      { id: "vitamins", name: "ভিটামিন ও ওষুধ", emoji: "💊", type: "boolean", target: 1, unit: "বার", preset: "vitamins" }
    ];

    this.podData = {
      habits: [...this.defaultHabits],
      logs: {}
    };

    this.currentStreak = 12; // Initial seed for motivating streak badge
    this.userId = "user_me";
    this.partnerId = "user_partner";
  }

  async init() {
    this.bindDOMEvents();
    this.formatCurrentDateBengali();

    // Initialize Firebase or local mock mode
    const isCloud = await firebaseService.init();
    this.updateCloudStatusIndicator(isCloud);

    // Subscribe to Pod Updates in real-time
    firebaseService.subscribeToPod(firebaseService.activePodId, (data) => {
      if (data) {
        if (data.habits && data.habits.length) {
          this.podData.habits = data.habits;
        }
        if (data.logs) {
          this.podData.logs = data.logs;
        }
      }
      this.refreshUI();
    });

    // Populate Initial Invite code
    const codeEl = document.getElementById("my-invite-code");
    if (codeEl) codeEl.innerText = firebaseService.myInviteCode;

    // Trigger Insights Speedometer & Week Sync
    this.renderInsightsView();
  }

  getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  formatCurrentDateBengali() {
    const days = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
    const months = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    const now = new Date();
    const text = `${days[now.getDay()]}, ${toBengaliNumber(now.getDate())} ${months[now.getMonth()]}`;
    const dateEl = document.getElementById("display-date");
    if (dateEl) dateEl.innerText = text;
  }

  updateCloudStatusIndicator(isLive) {
    const statusLabel = document.getElementById("firebase-status-label");
    const syncDot = document.getElementById("sync-indicator");

    if (isLive) {
      if (statusLabel) statusLabel.innerText = "ক্লাউড সিঙ্ক সক্রিয় (লাইভ)";
      if (syncDot) syncDot.style.backgroundColor = "var(--accent-green)";
    } else {
      if (statusLabel) statusLabel.innerText = "লোকাল ডেমো মোডে চলছে";
      if (syncDot) syncDot.style.backgroundColor = "var(--accent-gold)";
    }
  }

  bindDOMEvents() {
    // Navigation Tabs
    document.querySelectorAll(".tab-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-item").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".screen-view").forEach((v) => v.classList.remove("active-view"));

        btn.classList.add("active");
        const targetView = document.getElementById(`view-${btn.dataset.view}`);
        if (targetView) targetView.classList.add("active-view");

        if (btn.dataset.view === "insights") {
          this.renderInsightsView();
        }
      });
    });

    // Header Action Modals
    document.getElementById("open-settings-btn")?.addEventListener("click", () => {
      this.openModal("settings-modal");
    });

    document.getElementById("open-add-goal-btn")?.addEventListener("click", () => {
      this.openModal("add-goal-modal");
    });

    document.getElementById("streak-badge-btn")?.addEventListener("click", () => {
      this.showCelebrationModal(this.currentStreak);
    });

    // Close Modal triggers
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeModal(btn.getAttribute("data-close"));
      });
    });

    // Preset Chip Selections
    document.querySelectorAll(".preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".preset-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");

        const nameInput = document.getElementById("goal-name");
        const targetInput = document.getElementById("goal-target");
        const unitInput = document.getElementById("goal-unit");

        if (nameInput) nameInput.value = chip.dataset.name;
        if (targetInput) targetInput.value = chip.dataset.target;
        if (unitInput) unitInput.value = chip.dataset.unit;

        const isBool = chip.dataset.type === "boolean";
        document.getElementById("type-boolean").checked = isBool;
        document.getElementById("type-number").checked = !isBool;
        document.getElementById("numeric-fields-row").style.display = isBool ? "none" : "grid";
      });
    });

    // Tracking type radio changes
    document.querySelectorAll("input[name='tracking-type']").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const row = document.getElementById("numeric-fields-row");
        if (row) row.style.display = e.target.value === "boolean" ? "none" : "grid";
      });
    });

    // Create Goal Form Submit
    document.getElementById("create-goal-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("goal-name").value;
      const type = document.querySelector("input[name='tracking-type']:checked").value;
      const target = type === "boolean" ? 1 : Number(document.getElementById("goal-target").value || 1);
      const unit = type === "boolean" ? "বার" : document.getElementById("goal-unit").value;

      const newHabit = {
        id: "custom_" + Date.now(),
        name,
        emoji: "🎯",
        type,
        target,
        unit,
        preset: "custom"
      };

      await firebaseService.addHabitDefinition(firebaseService.activePodId, newHabit);
      this.closeModal("add-goal-modal");
      this.showToast("নতুন লক্ষ্য সফলভাবে যুক্ত হয়েছে!");
    });

    // Quick Log Input Adjusters
    document.getElementById("btn-inc-val")?.addEventListener("click", () => {
      const step = this.activeHabitForLog?.preset === "steps" ? 500 : 1;
      this.tempLogValue += step;
      this.updateLogModalPreview();
    });

    document.getElementById("btn-dec-val")?.addEventListener("click", () => {
      const step = this.activeHabitForLog?.preset === "steps" ? 500 : 1;
      if (this.tempLogValue >= step) this.tempLogValue -= step;
      this.updateLogModalPreview();
    });

    document.getElementById("log-direct-input")?.addEventListener("input", (e) => {
      this.tempLogValue = Number(e.target.value) || 0;
      const label = document.getElementById("log-value-preview");
      if (label) label.innerText = toBengaliNumber(this.tempLogValue);
    });

    // Save Log Button
    document.getElementById("btn-save-log")?.addEventListener("click", async () => {
      if (!this.activeHabitForLog) return;
      const habit = this.activeHabitForLog;
      const completed = this.tempLogValue >= habit.target;

      await firebaseService.recordLog(
        firebaseService.activePodId,
        this.userId,
        habit.id,
        this.currentDateStr,
        this.tempLogValue,
        completed
      );

      this.closeModal("log-input-modal");
      this.showToast(`${habit.name} আপডেট করা হয়েছে!`);

      // Celebrate if goal finished!
      if (completed) {
        this.checkAndTriggerCelebration();
      }
    });

    // Copy Invite Code Button
    document.getElementById("btn-copy-code")?.addEventListener("click", () => {
      navigator.clipboard.writeText(firebaseService.myInviteCode);
      this.showToast("পড কোড কপি করা হয়েছে!");
    });

    // Pair Partner Button
    document.getElementById("btn-pair-partner")?.addEventListener("click", async () => {
      const input = document.getElementById("partner-input-code");
      const code = input?.value.trim();
      if (!code) {
        this.showToast("অনুগ্রহ করে একটি সঠিক কোড দিন");
        return;
      }
      await firebaseService.pairWithCode(code);
      this.showToast("পার্টনারের সাথে সংযুক্ত হয়েছে!");
      document.getElementById("label-partner-name").innerText = "পার্টনার (সংযুক্ত)";
      document.getElementById("paired-status-container").style.display = "flex";
      this.closeModal("settings-modal");
    });

    // Firebase Manual Config Sheet
    document.getElementById("btn-open-fb-config")?.addEventListener("click", () => {
      this.closeModal("settings-modal");
      this.openModal("firebase-config-modal");
    });

    document.getElementById("btn-save-fb-config")?.addEventListener("click", async () => {
      const txt = document.getElementById("firebase-config-json").value.trim();
      const res = firebaseService.saveConfig(txt);
      if (res.success) {
        this.showToast("কনফিগ সংরক্ষিত! রিলোড হচ্ছে...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert(res.message);
      }
    });

    document.getElementById("btn-use-mock-mode")?.addEventListener("click", () => {
      this.closeModal("firebase-config-modal");
      this.showToast("ডেমো সিমুলেটর মোডে সক্রিয়");
    });

    document.getElementById("celeb-close-btn")?.addEventListener("click", () => {
      this.closeModal("celebration-modal");
    });
  }

  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("show");
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("show");
  }

  showToast(msg) {
    const toast = document.getElementById("toast-banner");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  showCelebrationModal(days) {
    const title = document.getElementById("celeb-days-text");
    if (title) title.innerText = `${toBengaliNumber(days)} দিনের ধারা!`;
    this.openModal("celebration-modal");
  }

  checkAndTriggerCelebration() {
    this.currentStreak += 1;
    document.getElementById("header-streak-count").innerText = `${toBengaliNumber(this.currentStreak)} দিন`;
    this.showCelebrationModal(this.currentStreak);
  }

  /**
   * Main Render Pipeline for Dashboard Screen
   */
  refreshUI() {
    const grid = document.getElementById("widgets-container");
    if (!grid) return;
    grid.innerHTML = "";

    const dateLogs = this.podData.logs?.[this.currentDateStr] || {};
    let totalGoals = 0;
    let completedGoals = 0;
    let meDoneCount = 0;
    let themDoneCount = 0;

    this.podData.habits.forEach((habit) => {
      const habitLogs = dateLogs[habit.id] || {};
      const meLog = habitLogs[this.userId] || { value: 0, completed: false };
      
      // If no live partner yet, generate a realistic counterpart log for Duo visualization
      const themLog = habitLogs[this.partnerId] || {
        value: habit.preset === "steps" ? 7400 : (habit.preset === "water" ? 6 : (habit.preset === "sleep" ? 7.2 : 0)),
        completed: habit.preset === "sleep"
      };

      totalGoals += 2;
      if (meLog.completed) { completedGoals++; meDoneCount++; }
      if (themLog.completed) { completedGoals++; themDoneCount++; }

      // Build Widget Card Element
      const card = document.createElement("div");
      card.className = "widget-card";

      const visualHTML = renderWidgetVisual(habit, meLog.value, themLog.value, habit.target);
      const isMeCompleted = meLog.completed;

      card.innerHTML = `
        <div class="widget-header">
          <div class="widget-name-wrap">
            <span class="widget-emoji">${habit.emoji || '🎯'}</span>
            <span class="widget-title">${habit.name}</span>
          </div>
          <div class="widget-check-indicator ${isMeCompleted ? 'completed' : ''}">✓</div>
        </div>

        <div class="widget-center-visual">
          ${visualHTML}
        </div>

        <div class="widget-footer">
          <span class="widget-stat-label me">আমি: <b>${toBengaliNumber(meLog.value)}</b> ${habit.unit}</span>
          <span class="widget-stat-label them">পার্টনার: <b>${toBengaliNumber(themLog.value)}</b></span>
        </div>
      `;

      // Tap widget to log progress
      card.addEventListener("click", () => {
        this.openLogPrompt(habit, meLog.value);
      });

      grid.appendChild(card);
    });

    // Update Top Summary Progress Card
    const combinedPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    document.getElementById("summary-percentage").innerText = `${toBengaliNumber(combinedPct)}%`;
    document.getElementById("summary-arc-val").innerText = `${toBengaliNumber(combinedPct)}%`;
    document.getElementById("summary-me-count").innerText = `${toBengaliNumber(meDoneCount)}/${toBengaliNumber(this.podData.habits.length)}`;
    document.getElementById("summary-them-count").innerText = `${toBengaliNumber(themDoneCount)}/${toBengaliNumber(this.podData.habits.length)}`;
    document.getElementById("header-streak-count").innerText = `${toBengaliNumber(this.currentStreak)} দিন`;

    // Arc Stroke Dashoffset Animation (r=50 -> 2*PI*50 ≈ 314)
    const arcFill = document.getElementById("summary-arc-fill");
    if (arcFill) {
      const offset = 314 - (314 * combinedPct) / 100;
      arcFill.style.strokeDashoffset = offset;
    }
  }

  openLogPrompt(habit, currentValue) {
    this.activeHabitForLog = habit;
    this.tempLogValue = currentValue || 0;

    // For boolean toggles, instant toggle on single tap
    if (habit.type === "boolean") {
      const newVal = this.tempLogValue >= 1 ? 0 : 1;
      firebaseService.recordLog(
        firebaseService.activePodId,
        this.userId,
        habit.id,
        this.currentDateStr,
        newVal,
        newVal >= 1
      );
      this.showToast(`${habit.name} স্ট্যাটাস সম্পন্ন!`);
      return;
    }

    // Otherwise show iOS Sheet Input Modal
    document.getElementById("log-modal-title").innerText = `${habit.name} আপডেট করুন`;
    document.getElementById("log-unit-preview").innerText = habit.unit;
    this.updateLogModalPreview();
    this.openModal("log-input-modal");
  }

  updateLogModalPreview() {
    document.getElementById("log-value-preview").innerText = toBengaliNumber(this.tempLogValue);
    const directInput = document.getElementById("log-direct-input");
    if (directInput) directInput.value = this.tempLogValue;
  }

  /**
   * Render Speedometer & 7-Day Sync on Insights Screen
   */
  renderInsightsView() {
    const canvas = document.getElementById("speedometer-canvas");
    if (canvas) {
      drawSpeedometer(canvas, 86);
    }

    document.getElementById("stat-best-streak").innerText = `${toBengaliNumber(18)} দিন`;
    document.getElementById("stat-days-together").innerText = `${toBengaliNumber(24)} দিন`;
    document.getElementById("stat-current-streak").innerText = `${toBengaliNumber(this.currentStreak)} দিন`;

    // 7 Days Weekly Sync Mock Data for Visualization
    const stripContainer = document.getElementById("weekdays-strip");
    const weekData = [
      { day: "সোম", meDone: true, themDone: true, isToday: false },
      { day: "মঙ্গল", meDone: true, themDone: true, isToday: false },
      { day: "বুধ", meDone: true, themDone: false, isToday: false },
      { day: "বৃহঃ", meDone: true, themDone: true, isToday: false },
      { day: "শুক্র", meDone: false, themDone: true, isToday: false },
      { day: "শনি", meDone: true, themDone: true, isToday: false },
      { day: "রবি", meDone: true, themDone: true, isToday: true }
    ];

    renderWeeklySync(stripContainer, weekData);
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  const app = new DuoApp();
  app.init();
});