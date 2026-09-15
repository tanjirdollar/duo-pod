// utils.js
// Shared helper functions: Bengali numeral conversion, date keys, formatting.

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

// Converts any number/string containing 0-9 digits into Bengali numerals.
// Non-digit characters (%, :, commas, spaces) pass through untouched.
export function toBn(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function bnPercent(n) {
  return `${toBn(Math.round(n))}%`;
}

// YYYY-MM-DD in the local timezone (used as a Firestore document id).
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateKeyDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayKey(d);
}

export function daysBetween(dateAKey, dateBKey) {
  const a = new Date(dateAKey + "T00:00:00");
  const b = new Date(dateBKey + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// Bangla weekday abbreviations, Monday-first (as specified in the brief).
export const BN_WEEKDAYS = ["সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি", "রবি"];

// Given a date key, return 0=Monday ... 6=Sunday
export function weekdayIndexMonFirst(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  const jsDay = d.getDay(); // 0 = Sunday ... 6 = Saturday
  return (jsDay + 6) % 7;
}

export function generateInviteCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Format minutes as "X ঘণ্টা Y মিনিট"
export function formatHoursMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${toBn(m)} মিনিট`;
  if (m === 0) return `${toBn(h)} ঘণ্টা`;
  return `${toBn(h)} ঘণ্টা ${toBn(m)} মিনিট`;
}

export function initialOf(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
