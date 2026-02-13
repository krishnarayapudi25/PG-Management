import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyDOcg2PHhY8JWK4LFqYEHNYuLUwpYoQwLE",
  authDomain: "hotel-management-6b968.firebaseapp.com",
  projectId: "hotel-management-6b968",
  storageBucket: "hotel-management-6b968.firebasestorage.app",
  messagingSenderId: "1006492735898",
  appId: "1:1006492735898:web:9f1c1d281cddcbde444223",
  measurementId: "G-38PLRBPKQL"
};

const app = initializeApp(firebaseConfig);

// Analytics is optional - only load in production and if supported
let analytics = null;
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  import("firebase/analytics").then(({ getAnalytics }) => {
    try {
      analytics = getAnalytics(app);
    } catch (e) {
      console.warn("Analytics not available:", e);
    }
  }).catch(() => {
    console.warn("Analytics module not loaded");
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { analytics };
