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
  initTestSmsAction();

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
    const savedPatientPhone = localStorage.getItem('alphasquared_patient_phone');
    const patientPhoneInput = document.getElementById('contact-patient-phone');
    if (patientPhoneInput && savedPatientPhone) {
      patientPhoneInput.value = savedPatientPhone;
    }

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

  // Load SMS Alert Settings
  const yellowToggle = document.getElementById('toggle-sms-yellow');
  const redToggle = document.getElementById('toggle-sms-red');
  const smsProviderSelect = document.getElementById('cfg-sms-provider');
  const smsCooldownSelect = document.getElementById('cfg-sms-cooldown');
  const smsSenderInput = document.getElementById('cfg-sms-sender');

  if (yellowToggle) yellowToggle.checked = localStorage.getItem('alphasquared_sms_yellow') !== 'false';
  if (redToggle) redToggle.checked = localStorage.getItem('alphasquared_sms_red') !== 'false';
  if (smsProviderSelect && localStorage.getItem('alphasquared_sms_provider')) {
    smsProviderSelect.value = localStorage.getItem('alphasquared_sms_provider');
  }
  if (smsCooldownSelect && localStorage.getItem('alphasquared_sms_cooldown')) {
    smsCooldownSelect.value = localStorage.getItem('alphasquared_sms_cooldown');
  }
  if (smsSenderInput && localStorage.getItem('alphasquared_sms_sender')) {
    smsSenderInput.value = localStorage.getItem('alphasquared_sms_sender');
  }

  // Load Firebase Config
  const fb = getFirebaseConfig();
  if (fb.databaseURL) document.getElementById('cfg-fb-dburl').value = fb.databaseURL;
  if (fb.apiKey && !fb.apiKey.includes('DEMO_KEY')) document.getElementById('cfg-fb-apikey').value = fb.apiKey;
  if (fb.projectId) document.getElementById('cfg-fb-projid').value = fb.projectId;

  // Check Demo status
  const demoToggle = document.getElementById('toggle-demo-mode');
  demoToggle.checked = demoSimulator.isDemoActive();

  // Load Hardware Device Settings
  const hwDeviceId = localStorage.getItem('alphasquared_hw_device_id') || 'ESP32-ALPHA-01';
  const hwModel = localStorage.getItem('alphasquared_hw_device_model') || 'CUSTOM_REST_OR_ESP32';
  const hwApiUrl = localStorage.getItem('alphasquared_hw_api_url') || '';
  
  const devIdInput = document.getElementById('cfg-hw-device-id');
  const providerInput = document.getElementById('cfg-hw-provider');
  const apiUrlInput = document.getElementById('cfg-hw-api-url');
  
  if (devIdInput) devIdInput.value = hwDeviceId;
  if (providerInput) providerInput.value = hwModel;
  if (apiUrlInput) apiUrlInput.value = hwApiUrl;
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

    // 2. Save Contacts & Patient Phone
    const patientPhone = document.getElementById('contact-patient-phone')?.value.trim() || '';
    if (patientPhone) {
      localStorage.setItem('alphasquared_patient_phone', patientPhone);
    }

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
    if (contacts.primary.phone) {
      localStorage.setItem('alphasquared_primary_caregiver_phone', contacts.primary.phone);
      localStorage.setItem('alphasquared_primary_caregiver_name', contacts.primary.name);
    }
    if (contacts.secondary.phone) {
      localStorage.setItem('alphasquared_sec_contact_phone', contacts.secondary.phone);
      localStorage.setItem('alphasquared_sec_contact_name', contacts.secondary.name);
    }

    // 3. Save SMS Alert Policies & Gateway Settings
    const yellowToggle = document.getElementById('toggle-sms-yellow');
    const redToggle = document.getElementById('toggle-sms-red');
    const smsProvider = document.getElementById('cfg-sms-provider')?.value;
    const smsCooldown = document.getElementById('cfg-sms-cooldown')?.value;
    const smsSender = document.getElementById('cfg-sms-sender')?.value.trim();

    if (yellowToggle) localStorage.setItem('alphasquared_sms_yellow', String(yellowToggle.checked));
    if (redToggle) localStorage.setItem('alphasquared_sms_red', String(redToggle.checked));
    if (smsProvider) localStorage.setItem('alphasquared_sms_provider', smsProvider);
    if (smsCooldown) localStorage.setItem('alphasquared_sms_cooldown', smsCooldown);
    if (smsSender) localStorage.setItem('alphasquared_sms_sender', smsSender);

    // 4. Save Firebase if filled
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

    // 5. Save Hardware Device Settings
    const hwDevId = document.getElementById('cfg-hw-device-id')?.value.trim();
    const hwProv = document.getElementById('cfg-hw-provider')?.value;
    const hwUrl = document.getElementById('cfg-hw-api-url')?.value.trim();
    if (hwDevId) {
      localStorage.setItem('alphasquared_hw_device_id', hwDevId);
      localStorage.setItem('alphasquared_hw_device_model', hwProv || 'CUSTOM_REST_OR_ESP32');
      if (hwUrl) localStorage.setItem('alphasquared_hw_api_url', hwUrl);
      localStorage.setItem('alphasquared_hw_is_connected', 'true');
    }

    showToast('All settings, SMS policies, and clinical thresholds saved successfully!', 'success');
  });

  resetFbBtn.addEventListener('click', () => {
    localStorage.removeItem('alphasquared_firebase_custom_config');
    document.getElementById('cfg-fb-dburl').value = DEFAULT_FIREBASE_CONFIG.databaseURL;
    document.getElementById('cfg-fb-apikey').value = '';
    document.getElementById('cfg-fb-projid').value = DEFAULT_FIREBASE_CONFIG.projectId;
    showToast('Firebase settings restored to default prototype template.', 'info');
  });
}

function initTestSmsAction() {
  const testBtn = document.getElementById('btn-send-test-sms');
  const feedbackBox = document.getElementById('test-sms-feedback');
  if (!testBtn) return;

  testBtn.addEventListener('click', async () => {
    const patientPhone = document.getElementById('contact-patient-phone')?.value.trim() || '+91 99887 76655';
    const caregiverPhone = document.getElementById('contact-primary-phone')?.value.trim() || '+91 98765 43210';
    const caregiverName = document.getElementById('contact-primary-name')?.value.trim() || 'Dr. Ramesh Sharma';
    const provider = document.getElementById('cfg-sms-provider')?.value || 'SIMULATED';

    try {
      testBtn.disabled = true;
      testBtn.innerHTML = '<span class="spin-animation" style="display:inline-block;">⏳</span> Transmitting Test SMS...';
      if (feedbackBox) {
        feedbackBox.style.display = 'block';
        feedbackBox.style.background = 'rgba(0, 240, 255, 0.08)';
        feedbackBox.style.border = '1px solid var(--border-cyan)';
        feedbackBox.style.color = '#38bdf8';
        feedbackBox.textContent = 'Connecting to SMS gateway & dispatching test frame...';
      }

      const response = await fetch('/api/alerts/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isTest: true,
          patientId: 'PATIENT-001',
          patientName: 'Jane Doe',
          zone: 'YELLOW',
          patientPhone,
          contacts: [
            { name: caregiverName, phone: caregiverPhone, role: 'PRIMARY_CAREGIVER' }
          ]
        })
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        showToast('Test SMS transmission completed successfully!', 'success');
        if (feedbackBox) {
          feedbackBox.style.background = 'rgba(16, 185, 129, 0.15)';
          feedbackBox.style.border = '1px solid #10b981';
          feedbackBox.style.color = '#86efac';
          feedbackBox.innerHTML = `
            <strong>✅ Test SMS Dispatched Successfully!</strong><br>
            <strong>Provider:</strong> ${result.provider} (${result.isLiveGateway ? 'Live Gateway Active' : 'Simulation Audit Mode'})<br>
            <strong>Recipient:</strong> ${caregiverName} (${caregiverPhone})<br>
            <strong>Status Notice:</strong> ${result.notice}<br>
            <div style="margin-top:4px; font-size:0.75rem; color:#cbd5e1; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px;">
              ${result.smsBody}
            </div>
          `;
        }
      } else {
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

    } catch (err) {
      showToast(`Test SMS Failed: ${err.message}`, 'error');
      if (feedbackBox) {
        feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
        feedbackBox.style.border = '1px solid #ef4444';
        feedbackBox.style.color = '#fca5a5';
        feedbackBox.textContent = `❌ Test SMS Dispatch Error: ${err.message}`;
      }
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i data-lucide="send" style="width:14px;height:14px;"></i> <span>Send Test SMS Now</span>';
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    }
  });
}

