// ============================================================
// Firebase Configuration
// Replace the values below with YOUR Firebase project's config.
// Firebase Console → Project Settings → General → Your apps → SDK setup
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD7FQnxkLFVIvnlkQQI8fq9OHaY2Zgu4sA",
  authDomain: "allegro-school-of-music-adajan.firebaseapp.com",
  projectId: "allegro-school-of-music-adajan",
  storageBucket: "allegro-school-of-music-adajan.firebasestorage.app",
  messagingSenderId: "890166261765",
  appId: "1:890166261765:web:e9a7eef0fe39398229846c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ------------------------------------------------------------
// Secondary app instance — used ONLY when the admin creates a new
// Parent or Teacher login. Firebase's client SDK signs you in as
// whichever user you just created with createUserWithEmailAndPassword,
// which would otherwise log the admin out of their own session.
// Running that one call on a second, throwaway app instance keeps the
// admin's real session untouched. No Cloud Functions / Blaze plan needed.
// ------------------------------------------------------------
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);
