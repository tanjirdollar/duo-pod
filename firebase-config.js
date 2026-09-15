// firebase-config.js
// Handles the first-launch onboarding modal (paste Firebase config JSON),
// persists it to localStorage, and initializes the Firebase App / Auth / Firestore.
//
// The Firebase SDK is loaded with *dynamic* imports (not static top-level
// imports). This matters: if a static `import ... from "https://...gstatic.com/..."`
// fails to load (blocked network, ad-blocker, browser extension, offline),
// the ENTIRE module fails to evaluate — including any code that attaches
// click listeners — so every button on the page silently does nothing with
// no visible error. Dynamic imports let us catch that failure and show the
// person an actual message instead.

const SDK_BASE = "https://www.gstatic.com/firebasejs/10.12.2/";
const STORAGE_KEY = "duopod_firebase_config";

const onboardingModal = document.getElementById("onboarding-modal");
const configInput = document.getElementById("firebase-config-input");
const submitBtn = document.getElementById("onboarding-submit");
const errorText = document.getElementById("onboarding-error");

function showOnboardingError(message) {
  errorText.textContent = message;
  errorText.hidden = false;
}

let sdkModules = null;
let sdkLoadError = null;

async function loadSdk() {
  if (sdkModules) return sdkModules;
  if (sdkLoadError) throw sdkLoadError;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(SDK_BASE + "firebase-app.js"),
      import(SDK_BASE + "firebase-auth.js"),
      import(SDK_BASE + "firebase-firestore.js"),
    ]);
    sdkModules = { appMod, authMod, fsMod };
    return sdkModules;
  } catch (e) {
    sdkLoadError = new Error(
      "Firebase SDK লোড করা যায়নি। ইন্টারনেট সংযোগ চেক করুন, অ্যাডব্লকার/এক্সটেনশন বন্ধ করে দেখুন, অথবা অন্য ব্রাউজার বা নেটওয়ার্কে চেষ্টা করুন।"
    );
    throw sdkLoadError;
  }
}

// Other modules (app.js, data.js) call these instead of importing the CDN
// URLs directly, so the whole app doesn't die silently on a network hiccup.
export async function getFirebaseAuthApi() {
  const { authMod } = await loadSdk();
  return authMod;
}

export async function getFirestoreApi() {
  const { fsMod } = await loadSdk();
  return fsMod;
}

function parseConfig(raw) {
  // Allow users to paste either a strict JSON object or a JS object literal
  // (e.g. copy-pasted straight from the Firebase console snippet).
  let text = raw.trim();
  if (!text) throw new Error("খালি রাখা যাবে না।");
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to coerce unquoted keys into valid JSON.
    const coerced = text
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/,\s*}/g, "}");
    try {
      return JSON.parse(coerced);
    } catch (e2) {
      throw new Error("এই JSON পড়া যাচ্ছে না। ফরম্যাট যাচাই করুন।");
    }
  }
}

function validateConfig(cfg) {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const missing = required.filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(`এই ফিল্ডগুলো অনুপস্থিত: ${missing.join(", ")}`);
  }
}

async function initFirebase(cfg) {
  const { appMod, authMod, fsMod } = await loadSdk();
  const app = appMod.initializeApp(cfg);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  try {
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  } catch (e) {
    /* non-fatal */
  }
  try {
    await fsMod.enableIndexedDbPersistence(db);
  } catch (e) {
    /* multiple tabs open, or unsupported browser — non-fatal */
  }
  return { app, auth, db };
}

let resolveReady;
export const firebaseReady = new Promise((resolve) => {
  resolveReady = resolve;
});

async function bootFromStoredConfig() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  try {
    const cfg = JSON.parse(stored);
    const result = await initFirebase(cfg);
    onboardingModal.hidden = true;
    resolveReady(result);
    return true;
  } catch (e) {
    // Stored config is bad, or the SDK failed to load — clear it and fall
    // back to onboarding so the person can see what went wrong and retry.
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function wireOnboardingForm() {
  submitBtn.addEventListener("click", async () => {
    errorText.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "যাচাই করা হচ্ছে…";
    try {
      const cfg = parseConfig(configInput.value);
      validateConfig(cfg);
      const result = await initFirebase(cfg);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      onboardingModal.hidden = true;
      resolveReady(result);
    } catch (e) {
      showOnboardingError(e.message || "এই কনফিগারেশন দিয়ে সংযুক্ত করা গেল না।");
      submitBtn.disabled = false;
      submitBtn.textContent = "সংযুক্ত করুন";
    }
  });
}

export function clearStoredConfig() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
window.duopodResetFirebaseConfig = clearStoredConfig;

(async function start() {
  wireOnboardingForm();
  const booted = await bootFromStoredConfig();
  if (!booted) {
    onboardingModal.hidden = false;
    // If the earlier boot attempt failed specifically because the SDK
    // itself wouldn't load, surface that immediately rather than waiting
    // for the person to click submit.
    if (sdkLoadError) showOnboardingError(sdkLoadError.message);
  }
})();
