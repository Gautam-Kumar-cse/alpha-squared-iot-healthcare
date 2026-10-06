/**
 * ALPHA SQUARED - Firebase Configuration Module
 * Provides safe initialization with graceful fallback detection when keys are pending.
 */

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDEMO_KEY_ALPHA_SQUARED_GAYA_2026",
  authDomain: "alpha-squared-iot.firebaseapp.com",
  databaseURL: "https://alpha-squared-iot-default-rtdb.firebaseio.com",
  projectId: "alpha-squared-iot",
  storageBucket: "alpha-squared-iot.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

/**
 * Retrieve configuration from localStorage (configurable via Settings page)
 * or fall back to default project template.
 */
export function getFirebaseConfig() {
  const customConfig = localStorage.getItem('alphasquared_firebase_custom_config');
  if (customConfig) {
    try {
      return JSON.parse(customConfig);
    } catch {
      // Fallback
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveCustomFirebaseConfig(configObj) {
  localStorage.setItem('alphasquared_firebase_custom_config', JSON.stringify(configObj));
}

export function isFirebaseConfigured() {
  const cfg = getFirebaseConfig();
  return Boolean(cfg.apiKey && !cfg.apiKey.includes('DEMO_KEY'));
}

