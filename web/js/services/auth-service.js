/**
 * ALPHA SQUARED - Authentication Service
 * Manages Firebase Auth & local verified session management with SHA-256 password hashing.
 * Passwords are NEVER stored in plain text.
 */

import { getFirebaseConfig, isFirebaseConfigured } from '../config/firebase-config.js';

const AUTH_USER_KEY = 'alphasquared_auth_user';
const LOCAL_ACCOUNTS_KEY = 'alphasquared_registered_users';

// Quick SHA-256 helper using standard Web Crypto API
export async function hashPassword(plainPassword) {
  const enc = new TextEncoder();
  const data = enc.encode(plainPassword + '_ALPHA_SQUARED_SALT_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const authService = {
  /**
   * Check if a user is currently logged in
   */
  isAuthenticated() {
    const userStr = localStorage.getItem(AUTH_USER_KEY);
    return Boolean(userStr);
  },

  /**
   * Get the current active user profile
   */
  getCurrentUser() {
    const userStr = localStorage.getItem(AUTH_USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  /**
   * Sign in with Email and Password
   */
  async signIn(email, password) {
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const emailClean = email.trim().toLowerCase();

    // Check if live Firebase Auth is configured
    if (isFirebaseConfigured() && window.firebaseAuth) {
      try {
        const cred = await window.firebaseAuth.signInWithEmailAndPassword(window.firebaseAuthInstance, emailClean, password);
        const userObj = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || emailClean.split('@')[0],
          authProvider: 'FIREBASE_AUTH',
          loginTime: Date.now()
        };
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userObj));
        return userObj;
      } catch (fbErr) {
        throw new Error(fbErr.message || 'Firebase Authentication failed.');
      }
    }

    // Local / Prototype Auth Store (with SHA-256 hashed password)
    const storedUsersJson = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    let users = storedUsersJson ? JSON.parse(storedUsersJson) : [];

    // Pre-seed default demo admin if store is empty
    if (users.length === 0) {
      const demoHash = await hashPassword('AlphaSquared@2026');
      users.push({
        uid: 'PATIENT-001',
        email: 'doctor@alphasquared.org',
        fullName: 'Dr. Ramesh Sharma',
        passwordHash: demoHash,
        deviceId: 'ESP32-ALPHA-01',
        role: 'CAREGIVER'
      });
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(users));
    }

    const inputHash = await hashPassword(password);
    const matchedUser = users.find(u => u.email.toLowerCase() === emailClean && u.passwordHash === inputHash);

    if (!matchedUser) {
      // Check if user exists with different password
      const userExists = users.some(u => u.email.toLowerCase() === emailClean);
      if (userExists) {
        throw new Error('Invalid password. Please check your credentials.');
      }
      throw new Error('No account found with this email. Please register first.');
    }

    const userObj = {
      uid: matchedUser.uid,
      email: matchedUser.email,
      displayName: matchedUser.fullName,
      deviceId: matchedUser.deviceId || 'ESP32-ALPHA-01',
      role: matchedUser.role || 'PATIENT',
      authProvider: 'LOCAL_SECURE_STORAGE',
      loginTime: Date.now()
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userObj));
    return userObj;
  },

  /**
   * Register a new user profile
   */
  async register(fullName, email, password, deviceId = 'ESP32-ALPHA-01') {
    if (!fullName || !email || !password) {
      throw new Error('Please fill in all required registration fields.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters in length.');
    }

    const emailClean = email.trim().toLowerCase();

    // Check Firebase Auth if configured
    if (isFirebaseConfigured() && window.firebaseAuth) {
      try {
        const cred = await window.firebaseAuth.createUserWithEmailAndPassword(window.firebaseAuthInstance, emailClean, password);
        const userObj = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: fullName,
          deviceId: deviceId.trim(),
          authProvider: 'FIREBASE_AUTH',
          loginTime: Date.now()
        };
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userObj));
        return userObj;
      } catch (fbErr) {
        throw new Error(fbErr.message || 'Firebase Registration failed.');
      }
    }

    // Local account registration
    const storedUsersJson = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    let users = storedUsersJson ? JSON.parse(storedUsersJson) : [];

    if (users.some(u => u.email.toLowerCase() === emailClean)) {
      throw new Error('An account with this email already exists.');
    }

    const pwdHash = await hashPassword(password);
    const newUid = 'PATIENT-' + Math.floor(1000 + Math.random() * 9000);

    const newUser = {
      uid: newUid,
      email: emailClean,
      fullName: fullName.trim(),
      passwordHash: pwdHash,
      deviceId: deviceId.trim() || 'ESP32-ALPHA-01',
      role: 'PATIENT',
      createdAt: Date.now()
    };

    users.push(newUser);
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(users));

    const userObj = {
      uid: newUser.uid,
      email: newUser.email,
      displayName: newUser.fullName,
      deviceId: newUser.deviceId,
      authProvider: 'LOCAL_SECURE_STORAGE',
      loginTime: Date.now()
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userObj));
    return userObj;
  },

  /**
   * Log out the active user
   */
  async signOut() {
    if (isFirebaseConfigured() && window.firebaseAuth && window.firebaseAuthInstance) {
      try {
        await window.firebaseAuth.signOut(window.firebaseAuthInstance);
      } catch {
        // Continue local cleanup
      }
    }
    localStorage.removeItem(AUTH_USER_KEY);
  },

  /**
   * Route Guard: enforce authentication on protected pages
   */
  requireAuth(redirectUrl = 'login.html') {
    if (!this.isAuthenticated()) {
      window.location.href = redirectUrl;
    }
  }
};

