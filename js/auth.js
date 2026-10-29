// ============================================================
// auth.js — Role-based login for Admin / Teacher / Parent
//
// Admin logs in with a real email + password.
// Teachers & Parents log in with a Login ID + Password that the ADMIN
// types in manually when creating their record (no auto-generation).
// Firebase Auth needs an email format, so we map their ID to a synthetic
// email: "<id>@login.allegro.app". The REAL identity + role lives in
// Firestore under users/{uid}.
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOGIN_DOMAIN = "login.allegro.app";

function idToEmail(id) {
  // If admin already typed an email, use it as-is.
  if (id.includes("@")) return id.trim();
  return `${id.trim().toUpperCase()}@${LOGIN_DOMAIN}`;
}

/**
 * Attempts login for a given role tab.
 * role: 'admin' | 'teacher' | 'parent'
 * Returns the Firestore user profile on success, throws on failure.
 */
export async function loginAs(role, identifier, password) {
  const email = idToEmail(identifier);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));

  if (!snap.exists()) {
    await signOut(auth);
    throw new Error("No profile found for this account. Contact admin.");
  }

  const profile = snap.data();
  if (profile.role !== role) {
    await signOut(auth);
    throw new Error(`This account is not registered as a ${role}.`);
  }
  if (profile.active === false) {
    await signOut(auth);
    throw new Error("This account has been deactivated.");
  }

  return { uid: cred.user.uid, ...profile };
}

export function watchAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null);
    const snap = await getDoc(doc(db, "users", user.uid));
    callback(snap.exists() ? { uid: user.uid, ...snap.data() } : null);
  });
}

export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

/** Guard a dashboard page: redirects to login if not authenticated as expectedRole. */
export function requireRole(expectedRole, onReady) {
  watchAuth((profile) => {
    if (!profile || profile.role !== expectedRole) {
      window.location.href = "index.html";
      return;
    }
    onReady(profile);
  });
}
