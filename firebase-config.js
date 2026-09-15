/**
 * Duo Pod - Firebase Realtime Infrastructure & Mock Fallback Provider
 * Supports CDN ES Modules without bundlers.
 */

// Official Firebase 10 Modular Web SDK via CDN
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  updateProfile 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const FB_STORAGE_KEY = "duo_pod_firebase_config_v1";

export class DuoFirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.isLive = false;
    this.currentUser = null;
    this.activePodId = localStorage.getItem("duo_pod_active_id") || "POD-" + Math.floor(100000 + Math.random() * 900000);
    this.myInviteCode = localStorage.getItem("duo_pod_invite_code") || "D-" + Math.floor(10000 + Math.random() * 90000);
    this.listeners = [];
  }

  /**
   * Initializes Firebase using config stored in localStorage,
   * otherwise stays in reactive local mode.
   */
  async init() {
    localStorage.setItem("duo_pod_active_id", this.activePodId);
    localStorage.setItem("duo_pod_invite_code", this.myInviteCode);

    const savedConfig = localStorage.getItem(FB_STORAGE_KEY);
    if (!savedConfig) {
      console.log("Duo Pod: ফায়ারবেস কনফিগ পাওয়া যায়নি। লোকাল সিমুলেশনে চালু হচ্ছে।");
      return false;
    }

    try {
      const config = JSON.parse(savedConfig);
      if (!config.apiKey || !config.projectId) {
        throw new Error("ভুল বা অসম্পূর্ণ ফায়ারবেস কনফিগ");
      }

      if (!getApps().length) {
        this.app = initializeApp(config);
      } else {
        this.app = getApps()[0];
      }

      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      // Authenticate silently or anonymously for frictionless duo experience
      await signInAnonymously(this.auth);
      
      this.currentUser = this.auth.currentUser;
      this.isLive = true;
      console.log("Duo Pod: ফায়ারবেস রিয়েলটাইম ক্লাউড ডাটাবেস সংযুক্ত হয়েছে!");
      return true;
    } catch (err) {
      console.error("Firebase init error:", err);
      this.isLive = false;
      return false;
    }
  }

  saveConfig(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.apiKey || !parsed.projectId) {
        return { success: false, message: "কনফিগে apiKey এবং projectId আবশ্যক।" };
      }
      localStorage.setItem(FB_STORAGE_KEY, JSON.stringify(parsed));
      return { success: true };
    } catch (e) {
      return { success: false, message: "অবৈধ JSON বিন্যাস! সঠিক কোড দিন।" };
    }
  }

  /**
   * Realtime Listener for Pod Updates (Shared Habits & Partner Logs)
   */
  subscribeToPod(podId, onUpdateCallback) {
    if (!this.isLive || !this.db) {
      // Local Mock Simulator Listener
      const localHandler = () => {
        const podData = JSON.parse(localStorage.getItem(`duo_local_pod_${podId}`)) || null;
        onUpdateCallback(podData);
      };
      window.addEventListener("duo_local_update", localHandler);
      localHandler();
      return () => window.removeEventListener("duo_local_update", localHandler);
    }

    const podRef = doc(this.db, "pods", podId);
    const unsubscribe = onSnapshot(podRef, (snapshot) => {
      if (snapshot.exists()) {
        onUpdateCallback(snapshot.data());
      } else {
        onUpdateCallback(null);
      }
    }, (error) => {
      console.error("Firestore Snapshot error:", error);
    });

    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Save Habit Log for a specific date: YYYY-MM-DD
   */
  async recordLog(podId, userId, habitId, dateStr, value, isCompleted) {
    if (!this.isLive || !this.db) {
      // Save Locally
      let podData = JSON.parse(localStorage.getItem(`duo_local_pod_${podId}`)) || {
        podId,
        users: { [userId]: { name: "আমি" } },
        logs: {}
      };

      if (!podData.logs) podData.logs = {};
      if (!podData.logs[dateStr]) podData.logs[dateStr] = {};
      if (!podData.logs[dateStr][habitId]) podData.logs[dateStr][habitId] = {};

      podData.logs[dateStr][habitId][userId] = {
        value: Number(value),
        completed: Boolean(isCompleted),
        updatedAt: Date.now()
      };

      localStorage.setItem(`duo_local_pod_${podId}`, JSON.stringify(podData));
      window.dispatchEvent(new Event("duo_local_update"));
      return true;
    }

    try {
      const podRef = doc(this.db, "pods", podId);
      const updatePayload = {};
      updatePayload[`logs.${dateStr}.${habitId}.${userId}`] = {
        value: Number(value),
        completed: Boolean(isCompleted),
        updatedAt: serverTimestamp()
      };

      await setDoc(podRef, updatePayload, { merge: true });
      return true;
    } catch (e) {
      console.error("Error saving log to Firestore:", e);
      return false;
    }
  }

  /**
   * Add a new habit definition to the pod
   */
  async addHabitDefinition(podId, habitObj) {
    if (!this.isLive || !this.db) {
      let podData = JSON.parse(localStorage.getItem(`duo_local_pod_${podId}`)) || {
        podId,
        habits: []
      };
      if (!podData.habits) podData.habits = [];
      podData.habits.push(habitObj);
      localStorage.setItem(`duo_local_pod_${podId}`, JSON.stringify(podData));
      window.dispatchEvent(new Event("duo_local_update"));
      return true;
    }

    try {
      const podRef = doc(this.db, "pods", podId);
      const snap = await getDoc(podRef);
      let habits = [];
      if (snap.exists() && snap.data().habits) {
        habits = snap.data().habits;
      }
      habits.push(habitObj);
      await setDoc(podRef, { habits }, { merge: true });
      return true;
    } catch (e) {
      console.error("Error creating habit:", e);
      return false;
    }
  }

  /**
   * Pair with another user using their 6-digit invite code
   */
  async pairWithCode(targetCode, partnerName = "পার্টনার") {
    // In both Firestore & Local Mode, pairing binds the user to target pod
    const mappedPodId = "POD-" + targetCode.replace(/[^A-Za-z0-9]/g, "");
    this.activePodId = mappedPodId;
    localStorage.setItem("duo_pod_active_id", this.activePodId);
    localStorage.setItem("duo_partner_name", partnerName);
    
    if (this.isLive && this.db) {
      const podRef = doc(this.db, "pods", this.activePodId);
      await setDoc(podRef, {
        partnerJoined: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      window.dispatchEvent(new Event("duo_local_update"));
    }
    return true;
  }
}

export const firebaseService = new DuoFirebaseService();