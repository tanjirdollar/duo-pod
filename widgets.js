/**
 * Duo Pod - Custom UI Renderers & Visual Components
 * Handles Apple Canvas Speedometer, Dual Concentric Rings, and Bengali Formatting.
 */

// Bengali numeral translation helper
export function toBengaliNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return "০";
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return num.toString().replace(/\d/g, (d) => bnDigits[d]);
}

/**
 * Renders HTML5 Canvas Apple-style Semi-Circular Pod Health Speedometer
 */
export function drawSpeedometer(canvas, score = 86) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height - 20;
  const radius = width * 0.38;

  ctx.clearRect(0, 0, width, height);

  // Background Arc Track
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI, false);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#F2F2F7";
  ctx.lineCap = "round";
  ctx.stroke();

  // Vibrant Gradient for Score (Cyan -> Coral -> Emerald)
  const gradient = ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
  gradient.addColorStop(0, "#00D2D3");
  gradient.addColorStop(0.5, "#FF3B5C");
  gradient.addColorStop(1, "#10B981");

  // Filled Arc based on score (0 to 100)
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const endAngle = Math.PI + Math.PI * pct;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, endAngle, false);
  ctx.lineWidth = 18;
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.stroke();

  // Tick Marks around track
  const totalTicks = 12;
  for (let i = 0; i <= totalTicks; i++) {
    const angle = Math.PI + (Math.PI / totalTicks) * i;
    const innerR = radius - 18;
    const outerR = radius - 24;

    const x1 = centerX + innerR * Math.cos(angle);
    const y1 = centerY + innerR * Math.sin(angle);
    const x2 = centerX + outerR * Math.cos(angle);
    const y2 = centerY + outerR * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "#D1D1D6";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * Generates Inner Visual HTML for different habit types
 */
export function renderWidgetVisual(habit, meVal, themVal, target) {
  const mePct = Math.min(Math.round((meVal / target) * 100), 100);
  const themPct = Math.min(Math.round((themVal / target) * 100), 100);

  // 1. STEPS (Dual Concentric Apple Rings)
  if (habit.id === "steps" || habit.preset === "steps") {
    // Circumferences: Outer (r=26) -> ~163. Inner (r=18) -> ~113
    const outerOffset = 163 - (163 * mePct) / 100;
    const innerOffset = 113 - (113 * themPct) / 100;

    return `
      <div class="concentric-rings-wrap">
        <svg class="concentric-svg" viewBox="0 0 66 66">
          <!-- Outer Track & Partner 1 (Me: Coral) -->
          <circle class="ring-track" cx="33" cy="33" r="26"></circle>
          <circle class="ring-coral" cx="33" cy="33" r="26" style="stroke-dashoffset: ${outerOffset};"></circle>
          
          <!-- Inner Track & Partner 2 (Partner: Cyan) -->
          <circle class="ring-track" cx="33" cy="33" r="18"></circle>
          <circle class="ring-cyan" cx="33" cy="33" r="18" style="stroke-dashoffset: ${innerOffset};"></circle>
        </svg>
      </div>
    `;
  }

  // 2. WATER (Dual Vertical Fill Fluid Cylinders)
  if (habit.id === "water" || habit.preset === "water") {
    return `
      <div class="dual-cylinders">
        <div class="cylinder-tube" title="আমার পানি">${mePct}%
          <div class="cylinder-fill me" style="height: ${mePct}%;"></div>
        </div>
        <div class="cylinder-tube" title="পার্টনারের পানি">${themPct}%
          <div class="cylinder-fill them" style="height: ${themPct}%;"></div>
        </div>
      </div>
    `;
  }

  // 3. SLEEP (Side-by-Side Dual Horizontal Progress Bars)
  if (habit.id === "sleep" || habit.preset === "sleep") {
    return `
      <div class="sleep-bars-container">
        <div class="sleep-bar-track">
          <div class="sleep-bar-fill me" style="width: ${mePct}%;"></div>
        </div>
        <div class="sleep-bar-track">
          <div class="sleep-bar-fill them" style="width: ${themPct}%;"></div>
        </div>
      </div>
    `;
  }

  // 4. WEIGHT (Bold Comparison Numbers)
  if (habit.id === "weight" || habit.preset === "weight") {
    return `
      <div class="weight-metric-container">
        <span class="weight-val me">${toBengaliNumber(meVal || "--")}</span>
        <span class="weight-vs">বনাম</span>
        <span class="weight-val them">${toBengaliNumber(themVal || "--")}</span>
      </div>
    `;
  }

  // 5. BOOLEAN YES/NO (Vitamins, Meditation, Reading)
  const meDone = meVal >= 1;
  const themDone = themVal >= 1;

  return `
    <div class="boolean-dual-dots">
      <div class="bool-badge ${meDone ? 'me-done' : 'me-empty'}">
        ${meDone ? '✓' : 'আমি'}
      </div>
      <div class="bool-badge ${themDone ? 'them-done' : 'them-empty'}">
        ${themDone ? '✓' : 'সঙ্গী'}
      </div>
    </div>
  `;
}

/**
 * Builds 7-Day Split Circle Indicators for Insights screen
 */
export function renderWeeklySync(container, weeklyData = []) {
  if (!container) return;
  const bengaliDayNames = ["সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি", "রবি"];

  container.innerHTML = weeklyData.map((d, index) => {
    let splitClass = "";
    if (d.meDone && d.themDone) {
      splitClass = "full-sync";
    } else {
      if (d.meDone) splitClass += " left-done";
      if (d.themDone) splitClass += " right-done";
    }

    return `
      <div class="day-sync-col">
        <div class="split-dot ${splitClass}">
          <div class="split-left"></div>
          <div class="split-right"></div>
        </div>
        <span class="weekday-name ${d.isToday ? 'today' : ''}">${bengaliDayNames[index]}</span>
      </div>
    `;
  }).join("");
}