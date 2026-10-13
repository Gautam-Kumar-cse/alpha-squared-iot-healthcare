/**
 * ALPHA SQUARED - Settings & Contacts Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar, updateBeaconStatus } from '../components/navbar.js';
import { emergencyDetector } from '../services/emergency-service.js';
import { demoSimulator, DEMO_SCENARIOS } from '../services/demo-simulator.js';
import { getFirebaseConfig, saveCustomFirebaseConfig, DEFAULT_FIREBASE_CONFIG } from '../config/firebase-config.js';
import { showToast } from '../components/notification-toast.js';
import { dbService } from '../services/db-service.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('settings');
  initParticleBackground('bg-canvas');

  loadSettings();
  initContactValidationAndActions();
  initDemoControls();
  initSaveAction();
  initTestSmsAction();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const clean = phone.replace(/[\s\-\(\)\.]/g, '');
  // Matches 7 to 15 digits, optionally prefixed by '+' (e.g., +919876543210 or 911 or 1234567)
  return /^\+?[1-9]\d{6,14}$/.test(clean);
}

function updateValidationBadge(inputEl, badgeEl, isRequired = false) {
  if (!inputEl || !badgeEl) return;
  const val = inputEl.value.trim();
  if (!val) {
    if (isRequired) {
      badgeEl.style.display = 'inline-block';
      badgeEl.className = 'status-badge emergency';
      badgeEl.textContent = 'REQUIRED';
    } else {
      badgeEl.style.display = 'none';
    }
    return;
  }

  const valid = isValidPhoneNumber(val);
  badgeEl.style.display = 'inline-block';
  if (valid) {
    badgeEl.className = 'status-badge normal';
    badgeEl.textContent = 'VALID NUMBER';
  } else {
    badgeEl.className = 'status-badge warning';
    badgeEl.textContent = 'INVALID (7-15 DIGITS)';
  }
}

function loadSettings() {
  // 1. Load Thresholds
  const th = emergencyDetector.thresholds;
  if (th) {
    const elHrLow = document.getElementById('thresh-hr-low');
    const elHrHigh = document.getElementById('thresh-hr-high');
    const elSpo2 = document.getElementById('thresh-spo2-low');
    const elTemp = document.getElementById('thresh-temp-high');
    const elFall = document.getElementById('thresh-fall-sec');

    if (elHrLow) elHrLow.value = th.hrLowWarning;
    if (elHrHigh) elHrHigh.value = th.hrHighWarning;
    if (elSpo2) elSpo2.value = th.spo2LowWarning;
    if (elTemp) elTemp.value = th.tempHighWarning;
    if (elFall) elFall.value = th.fallConfirmationSeconds;
  }

  // 2. Load Patient Personal Phone
  const patientPhone = localStorage.getItem('alphasquared_patient_phone') || '';
  const patientInput = document.getElementById('contact-patient-phone');
  if (patientInput) {
    patientInput.value = patientPhone;
    updateValidationBadge(patientInput, document.getElementById('badge-patient-phone-val'), false);
  }

  // 3. Load Parent / Guardian Contact
  const parentContact = dbService.getParentGuardianContact();
  const parentNameInput = document.getElementById('contact-parent-name');
  const parentPhoneInput = document.getElementById('contact-parent-phone');
  const parentRelationInput = document.getElementById('contact-parent-relation');

  if (parentContact) {
    if (parentNameInput && parentContact.name) parentNameInput.value = parentContact.name;
    if (parentPhoneInput && parentContact.phone) parentPhoneInput.value = parentContact.phone;
    if (parentRelationInput && parentContact.relation) parentRelationInput.value = parentContact.relation;
  }
  if (parentPhoneInput) {
    updateValidationBadge(parentPhoneInput, document.getElementById('badge-parent-phone-val'), false);
  }

  // 4. Load Emergency Contact
  const emgContact = dbService.getEmergencyContact();
  const emgNameInput = document.getElementById('contact-emergency-name');
  const emgPhoneInput = document.getElementById('contact-emergency-phone');
  const emgRelationInput = document.getElementById('contact-emergency-relation');

  if (emgContact) {
    if (emgNameInput && emgContact.name) emgNameInput.value = emgContact.name;
    if (emgPhoneInput && emgContact.phone) emgPhoneInput.value = emgContact.phone;
    if (emgRelationInput && emgContact.relation) emgRelationInput.value = emgContact.relation;
  }
  if (emgPhoneInput) {
    updateValidationBadge(emgPhoneInput, document.getElementById('badge-emergency-phone-val'), false);
  }

  // 5. Load Privacy & Location Consent Preferences
  const locToggle = document.getElementById('toggle-location-consent');
  const maskToggle = document.getElementById('toggle-phone-masking');
  if (locToggle) locToggle.checked = dbService.getLocationSharingConsent('PATIENT-001');
  if (maskToggle) maskToggle.checked = dbService.getPhoneMaskingSetting();

  // 6. Load SMS Alert Settings
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

  // 7. Load Firebase Config
  const fb = getFirebaseConfig();
  if (fb.databaseURL) document.getElementById('cfg-fb-dburl').value = fb.databaseURL;
  if (fb.apiKey && !fb.apiKey.includes('DEMO_KEY')) document.getElementById('cfg-fb-apikey').value = fb.apiKey;
  if (fb.projectId) document.getElementById('cfg-fb-projid').value = fb.projectId;

  // 8. Check Demo status
  const demoToggle = document.getElementById('toggle-demo-mode');
  if (demoToggle) demoToggle.checked = demoSimulator.isDemoActive();

  // 9. Load Hardware Device Settings
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

function initContactValidationAndActions() {
  const patientInput = document.getElementById('contact-patient-phone');
  const parentPhoneInput = document.getElementById('contact-parent-phone');
  const emgPhoneInput = document.getElementById('contact-emergency-phone');

  const badgePatient = document.getElementById('badge-patient-phone-val');
  const badgeParent = document.getElementById('badge-parent-phone-val');
  const badgeEmg = document.getElementById('badge-emergency-phone-val');

  if (patientInput) {
    patientInput.addEventListener('input', () => updateValidationBadge(patientInput, badgePatient, false));
  }
  if (parentPhoneInput) {
    parentPhoneInput.addEventListener('input', () => updateValidationBadge(parentPhoneInput, badgeParent, false));
  }
  if (emgPhoneInput) {
    emgPhoneInput.addEventListener('input', () => updateValidationBadge(emgPhoneInput, badgeEmg, false));
  }

  // Clear Patient Phone
  const btnClearPatient = document.getElementById('btn-clear-patient-phone');
  if (btnClearPatient) {
    btnClearPatient.addEventListener('click', () => {
      if (patientInput) {
        patientInput.value = '';
        updateValidationBadge(patientInput, badgePatient, false);
      }
      localStorage.removeItem('alphasquared_patient_phone');
      showToast('Patient phone number cleared.', 'info');
    });
  }

  // Remove Parent / Guardian Contact
  const btnRemoveParent = document.getElementById('btn-remove-parent-contact');
  if (btnRemoveParent) {
    btnRemoveParent.addEventListener('click', () => {
      document.getElementById('contact-parent-name').value = '';
      if (parentPhoneInput) {
        parentPhoneInput.value = '';
        updateValidationBadge(parentPhoneInput, badgeParent, false);
      }
      document.getElementById('contact-parent-relation').value = 'Parent / Guardian';
      dbService.removeParentGuardianContact();
      showToast('Parent / Guardian contact removed.', 'info');
    });
  }

  // Remove Emergency Contact
  const btnRemoveEmg = document.getElementById('btn-remove-emergency-contact');
  if (btnRemoveEmg) {
    btnRemoveEmg.addEventListener('click', () => {
      document.getElementById('contact-emergency-name').value = '';
      if (emgPhoneInput) {
        emgPhoneInput.value = '';
        updateValidationBadge(emgPhoneInput, badgeEmg, false);
      }
      document.getElementById('contact-emergency-relation').value = 'Emergency Contact';
      dbService.removeEmergencyContact();
      showToast('Emergency contact removed.', 'info');
    });
  }
}

function initDemoControls() {
  const toggle = document.getElementById('toggle-demo-mode');
  const scenarioSelect = document.getElementById('select-demo-scenario');
  const injectBtn = document.getElementById('btn-inject-scenario');

  if (!toggle || !scenarioSelect || !injectBtn) return;

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

  if (!saveBtn) return;

  saveBtn.addEventListener('click', () => {
    // 1. Save Thresholds
    const newTh = {
      hrLowWarning: parseInt(document.getElementById('thresh-hr-low')?.value || '55', 10),
      hrHighWarning: parseInt(document.getElementById('thresh-hr-high')?.value || '105', 10),
      spo2LowWarning: parseInt(document.getElementById('thresh-spo2-low')?.value || '94', 10),
      tempHighWarning: parseFloat(document.getElementById('thresh-temp-high')?.value || '37.5'),
      fallConfirmationSeconds: parseInt(document.getElementById('thresh-fall-sec')?.value || '30', 10)
    };
    emergencyDetector.saveThresholds(newTh);

    // 2. Save Patient Phone
    const patientPhone = document.getElementById('contact-patient-phone')?.value.trim() || '';
    if (patientPhone) {
      if (!isValidPhoneNumber(patientPhone)) {
        showToast('Notice: Patient phone number does not conform to standard 7-15 digit format.', 'warning');
      }
      localStorage.setItem('alphasquared_patient_phone', patientPhone);
    } else {
      localStorage.removeItem('alphasquared_patient_phone');
    }

    // 3. Save Parent / Guardian Contact
    const parentName = document.getElementById('contact-parent-name')?.value.trim() || '';
    const parentPhone = document.getElementById('contact-parent-phone')?.value.trim() || '';
    const parentRelation = document.getElementById('contact-parent-relation')?.value.trim() || 'Parent / Guardian';

    if (parentName || parentPhone) {
      if (parentPhone && !isValidPhoneNumber(parentPhone)) {
        showToast('Notice: Parent / Guardian phone format is invalid. Please verify 7-15 digits.', 'warning');
      }
      dbService.saveParentGuardianContact({
        name: parentName,
        phone: parentPhone,
        relation: parentRelation
      });
    }

    // 4. Save Emergency Contact
    const emgName = document.getElementById('contact-emergency-name')?.value.trim() || '';
    const emgPhone = document.getElementById('contact-emergency-phone')?.value.trim() || '';
    const emgRelation = document.getElementById('contact-emergency-relation')?.value.trim() || 'Emergency Contact';

    if (emgName || emgPhone) {
      if (emgPhone && !isValidPhoneNumber(emgPhone)) {
        showToast('Notice: Emergency contact phone format is invalid. Please verify 7-15 digits.', 'warning');
      }
      dbService.saveEmergencyContact({
        name: emgName,
        phone: emgPhone,
        relation: emgRelation
      });
    }

    // 5. Save Privacy & Location Consent Preferences
    const locToggle = document.getElementById('toggle-location-consent');
    const maskToggle = document.getElementById('toggle-phone-masking');
    if (locToggle) dbService.setLocationSharingConsent('PATIENT-001', locToggle.checked);
    if (maskToggle) dbService.setPhoneMaskingSetting(maskToggle.checked);

    // 6. Save SMS Alert Policies & Gateway Settings
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

    // 7. Save Firebase if filled
    const dbUrl = document.getElementById('cfg-fb-dburl')?.value.trim();
    const apiKey = document.getElementById('cfg-fb-apikey')?.value.trim();
    const projId = document.getElementById('cfg-fb-projid')?.value.trim();

    if (dbUrl || apiKey || projId) {
      const customFb = {
        ...DEFAULT_FIREBASE_CONFIG,
        ...(dbUrl ? { databaseURL: dbUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(projId ? { projectId: projId } : {})
      };
      saveCustomFirebaseConfig(customFb);
    }

    // 8. Save Hardware Device Settings
    const hwDevId = document.getElementById('cfg-hw-device-id')?.value.trim();
    const hwProv = document.getElementById('cfg-hw-provider')?.value;
    const hwUrl = document.getElementById('cfg-hw-api-url')?.value.trim();
    if (hwDevId) {
      localStorage.setItem('alphasquared_hw_device_id', hwDevId);
      localStorage.setItem('alphasquared_hw_device_model', hwProv || 'CUSTOM_REST_OR_ESP32');
      if (hwUrl) localStorage.setItem('alphasquared_hw_api_url', hwUrl);
      localStorage.setItem('alphasquared_hw_is_connected', 'true');
    }

    showToast('All contacts, privacy preferences, and clinical thresholds saved successfully!', 'success');
  });

  if (resetFbBtn) {
    resetFbBtn.addEventListener('click', () => {
      localStorage.removeItem('alphasquared_firebase_custom_config');
      document.getElementById('cfg-fb-dburl').value = DEFAULT_FIREBASE_CONFIG.databaseURL;
      document.getElementById('cfg-fb-apikey').value = '';
      document.getElementById('cfg-fb-projid').value = DEFAULT_FIREBASE_CONFIG.projectId;
      showToast('Firebase settings restored to default prototype template.', 'info');
    });
  }
}

function initTestSmsAction() {
  const testBtn = document.getElementById('btn-send-test-sms');
  const feedbackBox = document.getElementById('test-sms-feedback');
  if (!testBtn) return;

  testBtn.addEventListener('click', async () => {
    const parentContact = dbService.getParentGuardianContact();
    const caregiverPhone = parentContact?.phone || document.getElementById('contact-parent-phone')?.value.trim();
    const caregiverName = parentContact?.name || document.getElementById('contact-parent-name')?.value.trim() || 'Parent / Guardian';
    const patientPhone = localStorage.getItem('alphasquared_patient_phone') || document.getElementById('contact-patient-phone')?.value.trim() || null;
    const locationSharingConsent = dbService.getLocationSharingConsent('PATIENT-001');

    if (!caregiverPhone && !patientPhone) {
      showToast('Please configure a Parent/Guardian or Patient phone number first to test SMS.', 'warning');
      return;
    }

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
          locationSharingConsent,
          vitals: { heartRate: 78, temperature: 36.8 },
          contacts: caregiverPhone ? [
            { name: caregiverName, phone: caregiverPhone, role: 'PARENT_GUARDIAN' }
          ] : []
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
            <strong>Recipient:</strong> ${caregiverName} (${caregiverPhone || patientPhone})<br>
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

