/**
 * ALPHA SQUARED - Settings & Contacts Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar, updateBeaconStatus } from '../components/navbar.js';
import { emergencyDetector } from '../services/emergency-service.js';
import { demoSimulator, DEMO_SCENARIOS } from '../services/demo-simulator.js';
import { getFirebaseConfig, saveCustomFirebaseConfig, DEFAULT_FIREBASE_CONFIG } from '../config/firebase-config.js';
import { showToast } from '../components/notification-toast.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('settings');
  initParticleBackground('bg-canvas');

  loadSettings();
  initDemoControls();
  initSaveAction();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function loadSettings() {
  // Load Thresholds
  const th = emergencyDetector.thresholds;
  document.getElementById('thresh-hr-low').value = th.hrLowWarning;
  document.getElementById('thresh-hr-high').value = th.hrHighWarning;
  document.getElementById('thresh-spo2-low').value = th.spo2LowWarning;
  document.getElementById('thresh-temp-high').value = th.tempHighWarning;
  document.getElementById('thresh-fall-sec').value = th.fallConfirmationSeconds;

  // Load Contacts
  try {
    const contacts = JSON.parse(localStorage.getItem('alphasquared_contacts') || '{}');
    if (contacts.primary) {
      if (contacts.primary.name) document.getElementById('contact-primary-name').value = contacts.primary.name;
      if (contacts.primary.phone) document.getElementById('contact-primary-phone').value = contacts.primary.phone;
      if (contacts.primary.email) document.getElementById('contact-primary-email').value = contacts.primary.email;
    }
    if (contacts.secondary) {
      if (contacts.secondary.name) document.getElementById('contact-sec-name').value = contacts.secondary.name;
      if (contacts.secondary.phone) document.getElementById('contact-sec-phone').value = contacts.secondary.phone;
      if (contacts.secondary.email) document.getElementById('contact-sec-email').value = contacts.secondary.email;
    }
  } catch {}

  // Load Firebase Config
  const fb = getFirebaseConfig();
  if (fb.databaseURL) document.getElementById('cfg-fb-dburl').value = fb.databaseURL;
  if (fb.apiKey && !fb.apiKey.includes('DEMO_KEY')) document.getElementById('cfg-fb-apikey').value = fb.apiKey;
  if (fb.projectId) document.getElementById('cfg-fb-projid').value = fb.projectId;

  // Check Demo status
  const demoToggle = document.getElementById('toggle-demo-mode');
  demoToggle.checked = demoSimulator.isDemoActive();
}

function initDemoControls() {
  const toggle = document.getElementById('toggle-demo-mode');
  const scenarioSelect = document.getElementById('select-demo-scenario');
  const injectBtn = document.getElementById('btn-inject-scenario');

  toggle.addEventListener('change', () => {
    const isActive = toggle.checked;
    demoSimulator.setDemoActive(isActive);
    updateBeaconStatus(isActive ? 'demo' : 'normal', isActive ? 'DEMO SIM' : 'ESP32 STANDBY');

    const demoBanner = document.getElementById('demo-banner');
    if (demoBanner) {
      if (isActive) demoBanner.classList.add('visible');
      else demoBanner.classList.remove('visible');
    }

    showToast(isActive ? 'Hackathon Demo Mode enabled.' : 'Demo Mode disabled. Telemetry returns to standby.', isActive ? 'info' : 'success');
  });

  injectBtn.addEventListener('click', () => {
    const scenarioKey = scenarioSelect.value;
    // Auto-enable demo if not already enabled
    if (!toggle.checked) {
      toggle.checked = true;
      demoSimulator.setDemoActive(true);
    }
    demoSimulator.setScenario(scenarioKey);
    const scen = DEMO_SCENARIOS[scenarioKey];
    showToast(`Injected Demo Scenario: ${scen.name} (${scen.description})`, 'warning', 6000);
  });
}

function initSaveAction() {
  const saveBtn = document.getElementById('btn-save-all-settings');
  const resetFbBtn = document.getElementById('btn-reset-firebase');

  saveBtn.addEventListener('click', () => {
    // 1. Save Thresholds
    const newTh = {
      hrLowWarning: parseInt(document.getElementById('thresh-hr-low').value, 10),
      hrHighWarning: parseInt(document.getElementById('thresh-hr-high').value, 10),
      spo2LowWarning: parseInt(document.getElementById('thresh-spo2-low').value, 10),
      tempHighWarning: parseFloat(document.getElementById('thresh-temp-high').value),
      fallConfirmationSeconds: parseInt(document.getElementById('thresh-fall-sec').value, 10)
    };
    emergencyDetector.saveThresholds(newTh);

    // 2. Save Contacts
    const contacts = {
      primary: {
        name: document.getElementById('contact-primary-name').value.trim(),
        phone: document.getElementById('contact-primary-phone').value.trim(),
        email: document.getElementById('contact-primary-email').value.trim()
      },
      secondary: {
        name: document.getElementById('contact-sec-name').value.trim(),
        phone: document.getElementById('contact-sec-phone').value.trim(),
        email: document.getElementById('contact-sec-email').value.trim()
      }
    };
    localStorage.setItem('alphasquared_contacts', JSON.stringify(contacts));

    // 3. Save Firebase if filled
    const dbUrl = document.getElementById('cfg-fb-dburl').value.trim();
    const apiKey = document.getElementById('cfg-fb-apikey').value.trim();
    const projId = document.getElementById('cfg-fb-projid').value.trim();

    if (dbUrl || apiKey || projId) {
      const customFb = {
        ...DEFAULT_FIREBASE_CONFIG,
        ...(dbUrl ? { databaseURL: dbUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(projId ? { projectId: projId } : {})
      };
      saveCustomFirebaseConfig(customFb);
    }

    showToast('All settings and clinical thresholds saved successfully!', 'success');
  });

  resetFbBtn.addEventListener('click', () => {
    localStorage.removeItem('alphasquared_firebase_custom_config');
    document.getElementById('cfg-fb-dburl').value = DEFAULT_FIREBASE_CONFIG.databaseURL;
    document.getElementById('cfg-fb-apikey').value = '';
    document.getElementById('cfg-fb-projid').value = DEFAULT_FIREBASE_CONFIG.projectId;
    showToast('Firebase settings restored to default prototype template.', 'info');
  });
}

