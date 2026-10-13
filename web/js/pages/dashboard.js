/**
 * ALPHA SQUARED - Main Telemetry Dashboard Controller
 * Upgraded for Real Hardware Health Device API Integration
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar, updateBeaconStatus } from '../components/navbar.js';
import { initSosModal } from '../components/sos-modal.js';
import { showToast } from '../components/notification-toast.js';
import { hardwareApiService } from '../services/hardware-api-service.js';
import { demoSimulator } from '../services/demo-simulator.js';
import { dbService } from '../services/db-service.js';

let telemetryChart = null;
const maxChartPoints = 20;
const chartLabels = [];
const hrData = [];
const spo2Data = [];
const sysBpData = [];

// Temperature display unit state
let currentTempUnit = 'C'; // 'C' or 'F'
let currentTempCelsius = null;

// ECG animation loop tracker
let ecgAnimationId = null;

export function initDashboard() {
  renderNavbar('dashboard');
  initParticleBackground('bg-canvas');

  initChart();
  initSosIntegration();
  initHardwareConnectionUi();
  initDemoModeControls();
  initUnitToggles();
  initHistoryFilters();
  initEcgCanvas();

  // Check hardware connection state on load
  checkHardwareStatusAndStart();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==============================================================================
// 1. Hardware API Connection UI & Management
// ==============================================================================

function initHardwareConnectionUi() {
  const toggleBtn = document.getElementById('btn-toggle-device-panel');
  const panel = document.getElementById('device-config-panel');
  const closeBtn = document.getElementById('btn-close-device-panel');
  const bannerOpenBtn = document.getElementById('btn-banner-open-connect');
  const form = document.getElementById('hw-device-connect-form');
  const disconnectBtn = document.getElementById('btn-disconnect-device');
  const refreshBtn = document.getElementById('btn-manual-refresh');
  const pollRateSelect = document.getElementById('select-poll-rate');

  const openPanel = () => {
    panel.classList.add('open');
    const input = document.getElementById('hw-input-device-id');
    if (input) input.focus();
  };

  const closePanel = () => {
    panel.classList.remove('open');
    hideConnectError();
  };

  if (toggleBtn) toggleBtn.addEventListener('click', () => panel.classList.toggle('open'));
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (bannerOpenBtn) bannerOpenBtn.addEventListener('click', openPanel);

  // Form submit: Connect Device
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const deviceId = document.getElementById('hw-input-device-id').value.trim();
      const provider = document.getElementById('hw-select-provider').value;
      const apiUrl = document.getElementById('hw-input-api-url').value.trim();
      const apiKey = document.getElementById('hw-input-api-key').value.trim();
      const submitBtn = document.getElementById('btn-submit-connect');
      const labelBtn = document.getElementById('label-connect-btn');

      if (!deviceId) {
        showConnectError('Device ID is required.');
        return;
      }

      try {
        submitBtn.disabled = true;
        labelBtn.textContent = 'Authenticating Hardware API...';
        hideConnectError();

        const result = await hardwareApiService.connectDevice({
          deviceId,
          apiKey,
          apiBaseUrl: apiUrl,
          deviceModel: provider
        });

        showToast(`Hardware Device [${result.deviceId}] connected successfully!`, 'success');
        closePanel();
        updateConnectionStateUi(true, result.deviceId, provider);
        
        // Start polling
        const interval = parseInt(pollRateSelect?.value || '15', 10);
        if (interval > 0) {
          hardwareApiService.startAutoPolling(interval, onHardwareTelemetryUpdate);
        } else {
          queryDeviceTelemetryManual();
        }

      } catch (err) {
        showConnectError(err.message || 'Failed to connect to device API.');
      } finally {
        submitBtn.disabled = false;
        labelBtn.textContent = 'Connect & Authenticate Device';
      }
    });
  }

  // Disconnect button
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      hardwareApiService.disconnectDevice();
      updateConnectionStateUi(false);
      showToast('Hardware device disconnected.', 'info');
      closePanel();
    });
  }

  // Manual Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      queryDeviceTelemetryManual();
    });
  }

  // Auto-refresh interval change
  if (pollRateSelect) {
    pollRateSelect.addEventListener('change', () => {
      const interval = parseInt(pollRateSelect.value, 10);
      if (hardwareApiService.isConnected()) {
        if (interval > 0) {
          hardwareApiService.startAutoPolling(interval, onHardwareTelemetryUpdate);
          showToast(`Auto-refresh interval set to ${interval} seconds.`, 'info');
        } else {
          hardwareApiService.stopAutoPolling();
          showToast('Auto-refresh paused. Use Refresh Data button for manual query.', 'info');
        }
      }
    });
  }
}

function showConnectError(msg) {
  const errBox = document.getElementById('hw-connect-error-banner');
  if (errBox) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }
}

function hideConnectError() {
  const errBox = document.getElementById('hw-connect-error-banner');
  if (errBox) errBox.style.display = 'none';
}

function updateConnectionStateUi(isConnected, deviceId = '', model = '') {
  const bar = document.getElementById('device-conn-bar');
  const nameEl = document.getElementById('connected-device-name');
  const pill = document.getElementById('hw-status-pill');
  const dot = document.getElementById('hw-status-dot');
  const label = document.getElementById('hw-status-label');
  const banner = document.getElementById('banner-disconnected-view');
  const disconnectBtn = document.getElementById('btn-disconnect-device');
  const toggleLabel = document.getElementById('label-toggle-device-panel');
  const edgeLink = document.getElementById('edge-link-status');
  const deviceSub = document.getElementById('patient-device');

  if (isConnected) {
    if (bar) bar.className = 'glass-panel device-connection-bar connected';
    if (nameEl) nameEl.textContent = `${deviceId} (${model.replace(/_/g, ' ')})`;
    if (pill) pill.className = 'status-pill online';
    if (dot) dot.className = 'status-dot normal';
    if (label) label.textContent = 'ONLINE / SYNCED';
    if (banner) banner.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
    if (toggleLabel) toggleLabel.textContent = 'Manage Device';
    if (edgeLink) {
      edgeLink.textContent = 'ONLINE';
      edgeLink.style.color = '#34d399';
    }
    if (deviceSub) deviceSub.textContent = deviceId;
    updateBeaconStatus('normal', 'HARDWARE LINKED');
  } else {
    if (bar) bar.className = 'glass-panel device-connection-bar disconnected';
    if (nameEl) nameEl.textContent = 'No Device Connected';
    if (pill) pill.className = 'status-pill offline';
    if (dot) dot.className = 'status-dot warning';
    if (label) label.textContent = 'DEVICE NOT CONNECTED';
    if (banner) banner.style.display = 'block';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (toggleLabel) toggleLabel.textContent = 'Connect Device';
    if (edgeLink) {
      edgeLink.textContent = 'DISCONNECTED';
      edgeLink.style.color = '#94a3b8';
    }
    updateBeaconStatus('offline', 'NOT CONNECTED');
    clearVitalsDisplay();
  }
}

function checkHardwareStatusAndStart() {
  if (demoSimulator.isDemoActive()) {
    const demoBanner = document.getElementById('demo-mode-alert-banner');
    if (demoBanner) demoBanner.style.display = 'flex';
    const disBanner = document.getElementById('banner-disconnected-view');
    if (disBanner) disBanner.style.display = 'none';
    updateBeaconStatus('demo', 'DEMO SIM');
    return;
  }

  const demoBanner = document.getElementById('demo-mode-alert-banner');
  if (demoBanner) demoBanner.style.display = 'none';

  if (hardwareApiService.isConnected()) {
    const devId = hardwareApiService.getConnectedDeviceId();
    const model = hardwareApiService.getConnectedDeviceModel();
    updateConnectionStateUi(true, devId, model);

    const pollRateSelect = document.getElementById('select-poll-rate');
    const interval = parseInt(pollRateSelect?.value || '15', 10);
    hardwareApiService.startAutoPolling(interval, onHardwareTelemetryUpdate);
  } else {
    updateConnectionStateUi(false);
  }
}

function initDemoModeControls() {
  const quickSimBtn = document.getElementById('btn-quick-sim');
  const bannerStopBtn = document.getElementById('btn-stop-demo-from-banner');
  const demoBanner = document.getElementById('demo-mode-alert-banner');
  const patientId = 'PATIENT-001';

  const updateDemoUi = (active) => {
    if (demoBanner) demoBanner.style.display = active ? 'flex' : 'none';
    if (quickSimBtn) {
      quickSimBtn.className = active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    if (active) {
      updateBeaconStatus('demo', 'DEMO SIM');
      const disBanner = document.getElementById('banner-disconnected-view');
      if (disBanner) disBanner.style.display = 'none';
    } else {
      checkHardwareStatusAndStart();
    }
  };

  // Subscribe to DB / Demo telemetry
  dbService.subscribeToPatientCurrent(patientId, (current) => {
    if (demoSimulator.isDemoActive() && current) {
      renderTelemetryData(current);
    }
  });

  if (quickSimBtn) {
    quickSimBtn.addEventListener('click', () => {
      const willBeActive = !demoSimulator.isDemoActive();
      demoSimulator.setDemoActive(willBeActive);
      updateDemoUi(willBeActive);
      if (willBeActive) {
        showToast('Development Demo Mode enabled. Telemetry is simulated.', 'warning');
      } else {
        showToast('Demo Mode exited. Returning to hardware standby.', 'info');
      }
    });
  }

  if (bannerStopBtn) {
    bannerStopBtn.addEventListener('click', () => {
      demoSimulator.setDemoActive(false);
      updateDemoUi(false);
      showToast('Demo Mode stopped. Returning to hardware standby.', 'info');
    });
  }

  if (demoSimulator.isDemoActive()) {
    updateDemoUi(true);
  }
}

async function queryDeviceTelemetryManual() {
  const spinIcon = document.getElementById('icon-refresh-spin');
  if (spinIcon) spinIcon.classList.add('spin-animation');

  try {
    const result = await hardwareApiService.fetchLiveTelemetry();
    onHardwareTelemetryUpdate(result);
    showToast('Hardware telemetry synchronized.', 'info');
  } catch (err) {
    showToast(`Failed to sync with device: ${err.message}`, 'error');
  } finally {
    if (spinIcon) {
      setTimeout(() => spinIcon.classList.remove('spin-animation'), 600);
    }
  }
}

function onHardwareTelemetryUpdate(response) {
  if (!response) return;

  if (response.connected && response.telemetry) {
    renderTelemetryData(response.telemetry);
  } else if (response.status === 'DEVICE_NOT_CONNECTED') {
    // Clean indicator that hardware has not transmitted data yet
    const pill = document.getElementById('hw-status-pill');
    const label = document.getElementById('hw-status-label');
    if (pill) pill.className = 'status-pill busy';
    if (label) label.textContent = 'AWAITING HARDWARE TRANSMISSION';

    const lastSyncEl = document.getElementById('last-update-time');
    if (lastSyncEl) lastSyncEl.textContent = 'Awaiting Device Stream';
  } else if (response.error) {
    const pill = document.getElementById('hw-status-pill');
    const label = document.getElementById('hw-status-label');
    if (pill) pill.className = 'status-pill busy';
    if (label) label.textContent = 'API SYNC ERROR';
  }
}

// ==============================================================================
// 2. Health Biometrics Display & Normalization
// ==============================================================================

export function renderTelemetryData(payload) {
  if (!payload) return;

  // Timestamp
  const timeEl = document.getElementById('last-update-time');
  const syncDate = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const timeFormatted = syncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (timeEl) {
    timeEl.textContent = `${timeFormatted} (LIVE)`;
  }

  // 1. Blood Pressure
  const bpSysEl = document.getElementById('val-bp-sys');
  const bpDiaEl = document.getElementById('val-bp-dia');
  const bpBadge = document.getElementById('badge-bp');
  const bpPulse = document.getElementById('bp-pulse-label');
  const bpCard = document.getElementById('card-bp');

  if (payload.bloodPressure && payload.bloodPressure.systolic != null) {
    const sys = payload.bloodPressure.systolic;
    const dia = payload.bloodPressure.diastolic;
    if (bpSysEl) bpSysEl.textContent = sys;
    if (bpDiaEl) bpDiaEl.textContent = dia;
    if (bpPulse && payload.bloodPressure.pulse) bpPulse.textContent = `Pulse: ${payload.bloodPressure.pulse} BPM`;
    if (bpBadge) {
      const cls = payload.bloodPressure.status || 'NORMAL';
      bpBadge.textContent = cls;
      bpBadge.className = cls.includes('HYPERTENSION') ? 'status-badge emergency' : (cls.includes('ELEVATED') ? 'status-badge warning' : 'status-badge normal');
    }
    if (bpCard) bpCard.classList.remove('unsupported');
  } else {
    markUnsupported(bpCard, bpBadge, 'Awaiting BP Cuff');
  }

  // 2. Heart Rate
  const hrEl = document.getElementById('val-heart-rate');
  const hrBadge = document.getElementById('badge-heart-rate');
  const hrCard = document.getElementById('card-heart-rate');
  const hrVal = payload.heartRate?.value ?? payload.heartRate;

  if (hrVal != null) {
    if (hrEl) hrEl.textContent = hrVal;
    if (hrBadge && hrCard) {
      if (hrVal > 115 || hrVal < 50) {
        hrBadge.className = 'status-badge emergency';
        hrBadge.textContent = hrVal > 115 ? 'TACHYCARDIA' : 'BRADYCARDIA';
        hrCard.className = 'glass-panel vital-card status-emergency';
      } else if (hrVal > 100 || hrVal < 60) {
        hrBadge.className = 'status-badge warning';
        hrBadge.textContent = 'ELEVATED';
        hrCard.className = 'glass-panel vital-card status-warning';
      } else {
        hrBadge.className = 'status-badge normal';
        hrBadge.textContent = 'NORMAL';
        hrCard.className = 'glass-panel vital-card';
      }
    }
    if (hrCard) hrCard.classList.remove('unsupported');
  } else {
    markUnsupported(hrCard, hrBadge, 'Awaiting Sensor');
  }

  // 3. Body Temperature
  const tempEl = document.getElementById('val-temp');
  const tempBadge = document.getElementById('badge-temp');
  const tempCard = document.getElementById('card-temp');
  const tempVal = payload.temperature?.celsius ?? payload.temperature;

  if (tempVal != null) {
    currentTempCelsius = Number(tempVal);
    renderTemperatureValue();
    if (tempBadge && tempCard) {
      if (currentTempCelsius > 38.5 || currentTempCelsius < 35.0) {
        tempBadge.className = 'status-badge emergency';
        tempBadge.textContent = currentTempCelsius > 38.5 ? 'HIGH FEVER' : 'HYPOTHERMIA';
        tempCard.className = 'glass-panel vital-card status-emergency';
      } else if (currentTempCelsius > 37.6) {
        tempBadge.className = 'status-badge warning';
        tempBadge.textContent = 'MILD PYREXIA';
        tempCard.className = 'glass-panel vital-card status-warning';
      } else {
        tempBadge.className = 'status-badge normal';
        tempBadge.textContent = 'NORMAL';
        tempCard.className = 'glass-panel vital-card';
      }
    }
    if (tempCard) tempCard.classList.remove('unsupported');
  } else {
    markUnsupported(tempCard, tempBadge, 'Awaiting Probe');
  }

  // 4. Blood Oxygen (SpO2)
  const spo2El = document.getElementById('val-spo2');
  const spo2Badge = document.getElementById('badge-spo2');
  const spo2Card = document.getElementById('card-spo2');
  const spo2Val = payload.spo2?.value ?? payload.spo2;

  if (spo2Val != null) {
    if (spo2El) spo2El.textContent = spo2Val;
    if (spo2Badge && spo2Card) {
      if (spo2Val < 90) {
        spo2Badge.className = 'status-badge emergency';
        spo2Badge.textContent = 'CRITICAL HYPOXIA';
        spo2Card.className = 'glass-panel vital-card status-emergency';
      } else if (spo2Val < 95) {
        spo2Badge.className = 'status-badge warning';
        spo2Badge.textContent = 'LOW SPO2';
        spo2Card.className = 'glass-panel vital-card status-warning';
      } else {
        spo2Badge.className = 'status-badge normal';
        spo2Badge.textContent = 'OPTIMAL';
        spo2Card.className = 'glass-panel vital-card';
      }
    }
    if (spo2Card) spo2Card.classList.remove('unsupported');
  } else {
    markUnsupported(spo2Card, spo2Badge, 'Awaiting Oximeter');
  }

  // 5. Respiratory Rate
  const rrEl = document.getElementById('val-rr');
  const rrBadge = document.getElementById('badge-rr');
  const rrCard = document.getElementById('card-rr');
  const rrVal = payload.respiratoryRate?.value ?? payload.respiratoryRate;

  if (rrVal != null) {
    if (rrEl) rrEl.textContent = rrVal;
    if (rrBadge) {
      rrBadge.textContent = rrVal > 22 ? 'TACHYPNEA' : (rrVal < 12 ? 'BRADYPNEA' : 'NORMAL');
      rrBadge.className = (rrVal > 22 || rrVal < 12) ? 'status-badge warning' : 'status-badge normal';
    }
    if (rrCard) rrCard.classList.remove('unsupported');
  } else {
    markUnsupported(rrCard, rrBadge, 'Not on Device');
  }

  // 6. Blood Glucose
  const glucEl = document.getElementById('val-glucose');
  const glucBadge = document.getElementById('badge-glucose');
  const glucCard = document.getElementById('card-glucose');
  const glucContext = document.getElementById('glucose-context-label');
  const glucVal = payload.bloodGlucose?.value ?? payload.bloodGlucose;

  if (glucVal != null) {
    if (glucEl) glucEl.textContent = glucVal;
    if (glucBadge) {
      glucBadge.textContent = glucVal > 140 ? 'HIGH' : (glucVal < 70 ? 'LOW' : 'NORMAL');
      glucBadge.className = (glucVal > 140 || glucVal < 70) ? 'status-badge warning' : 'status-badge normal';
    }
    if (glucContext && payload.bloodGlucose?.mealContext) {
      glucContext.textContent = payload.bloodGlucose.mealContext;
    }
    if (glucCard) glucCard.classList.remove('unsupported');
  } else {
    markUnsupported(glucCard, glucBadge, 'Not on Device');
  }

  // 7. ECG Rhythm & Waveform
  const ecgRhythmEl = document.getElementById('val-ecg-rhythm');
  const ecgLeadsEl = document.getElementById('ecg-leads-status');
  const ecgBadge = document.getElementById('badge-ecg');
  const ecgCard = document.getElementById('card-ecg');

  if (payload.ecg) {
    if (ecgRhythmEl) ecgRhythmEl.textContent = payload.ecg.rhythm || 'Normal Sinus Rhythm';
    if (ecgLeadsEl) ecgLeadsEl.textContent = payload.ecg.leadsStatus || 'Leads Connected';
    if (ecgBadge) {
      ecgBadge.textContent = payload.ecg.rhythm?.includes('Normal') ? 'RHYTHM OK' : 'ANOMALY DETECTED';
      ecgBadge.className = payload.ecg.rhythm?.includes('Normal') ? 'status-badge normal' : 'status-badge emergency';
    }
    if (ecgCard) ecgCard.classList.remove('unsupported');
  } else {
    markUnsupported(ecgCard, ecgBadge, 'Not on Device');
  }

  // 8. Steps & Daily Activity
  const stepsEl = document.getElementById('val-steps');
  const actSub = document.getElementById('activity-sub-label');
  const actCard = document.getElementById('card-activity');
  const stepsVal = payload.activity?.steps ?? payload.steps;

  if (stepsVal != null) {
    if (stepsEl) stepsEl.textContent = Number(stepsVal).toLocaleString();
    if (actSub && payload.activity?.calories) {
      actSub.textContent = `${payload.activity.calories} kcal burned`;
    }
    if (actCard) actCard.classList.remove('unsupported');
  } else {
    markUnsupported(actCard, null, 'Not on Device');
  }

  // 9. Sleep Analysis
  const sleepEl = document.getElementById('val-sleep-hours');
  const sleepSub = document.getElementById('sleep-sub-label');
  const sleepCard = document.getElementById('card-sleep');
  const sleepVal = payload.sleep?.totalDurationHours ?? payload.sleepHours;

  if (sleepVal != null) {
    if (sleepEl) sleepEl.textContent = sleepVal;
    if (sleepSub && payload.sleep?.deepSleepHours) {
      sleepSub.textContent = `Deep Sleep: ${payload.sleep.deepSleepHours} hrs`;
    }
    if (sleepCard) sleepCard.classList.remove('unsupported');
  } else {
    markUnsupported(sleepCard, null, 'Not on Device');
  }

  // 10. Fall Status
  const fallEl = document.getElementById('val-fall');
  const fallBadge = document.getElementById('badge-fall');
  const fallHero = document.getElementById('fall-hero-status');
  if (fallEl && fallBadge) {
    if (payload.fallDetected) {
      fallEl.textContent = 'FALL DETECTED!';
      fallEl.style.color = '#ef4444';
      fallBadge.className = 'status-badge emergency';
      fallBadge.textContent = 'IMPACT DETECTED';
      if (fallHero) {
        fallHero.textContent = 'TRIGGERED';
        fallHero.style.color = '#ef4444';
      }
    } else {
      fallEl.textContent = 'STABLE';
      fallEl.style.color = 'var(--vital-motion)';
      fallBadge.className = 'status-badge normal';
      fallBadge.textContent = 'STABLE';
      if (fallHero) {
        fallHero.textContent = 'ARMED';
        fallHero.style.color = '#a78bfa';
      }
    }
  }

  // Overall State Hero
  updateOverallHeroState(payload);

  // GPS Coordinates & Map Link
  if (payload.latitude && payload.longitude) {
    const coordEl = document.getElementById('coord-lat-lng');
    const gmapsBtn = document.getElementById('btn-open-gmaps');
    const sourceBadge = document.getElementById('location-source-badge');

    if (coordEl) coordEl.textContent = `${Number(payload.latitude).toFixed(4)}° N, ${Number(payload.longitude).toFixed(4)}° E`;
    if (gmapsBtn) gmapsBtn.href = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    if (sourceBadge) sourceBadge.textContent = payload.locationSource || 'DEVICE GPS';
  }

  // Update Live Stream Chart
  const currentHr = hrVal ?? null;
  const currentSpo2 = spo2Val ?? null;
  const currentSys = payload.bloodPressure?.systolic ?? null;
  if (currentHr || currentSpo2) {
    updateChart(timeFormatted, currentHr, currentSpo2, currentSys);
  }
}

function markUnsupported(cardEl, badgeEl, labelText) {
  if (cardEl) cardEl.classList.add('unsupported');
  if (badgeEl) {
    badgeEl.textContent = labelText;
    badgeEl.className = 'status-badge badge-unsupported';
  }
}

function clearVitalsDisplay() {
  document.getElementById('val-bp-sys').textContent = '--';
  document.getElementById('val-bp-dia').textContent = '--';
  document.getElementById('val-heart-rate').textContent = '--';
  document.getElementById('val-temp').textContent = '--';
  document.getElementById('val-spo2').textContent = '--';
  document.getElementById('val-rr').textContent = '--';
  document.getElementById('val-glucose').textContent = '--';
  document.getElementById('val-steps').textContent = '--';
  document.getElementById('val-sleep-hours').textContent = '--';
  document.getElementById('last-update-time').textContent = 'Not Connected';
  
  const heroText = document.getElementById('overall-status-text');
  const heroDesc = document.getElementById('status-description');
  if (heroText) heroText.textContent = 'STANDBY';
  if (heroDesc) heroDesc.textContent = 'Awaiting authorized hardware device connection to evaluate live physiological vitals.';
}

function updateOverallHeroState(payload) {
  const heroCard = document.getElementById('telemetry-hero-card');
  const heroText = document.getElementById('overall-status-text');
  const heroDesc = document.getElementById('status-description');
  const state = payload.emergencyState || 'NORMAL';

  if (heroCard && heroText && heroDesc) {
    heroCard.className = `glass-panel telemetry-hero ${state.toLowerCase()}`;
    heroText.textContent = state;

    if (state === 'EMERGENCY') {
      heroText.style.color = '#ef4444';
      heroDesc.textContent = payload.emergencyReason || 'Critical incident detected on hardware sensor! Caregiver alert dispatched.';
    } else if (state === 'WARNING') {
      heroText.style.color = '#f59e0b';
      heroDesc.textContent = payload.warningReason || 'Caution: Health measurement exceeded safe physiological threshold.';
    } else {
      heroText.style.color = 'var(--status-normal)';
      heroDesc.textContent = 'All vital signs within safe physiological ranges. Hardware stream is active and synchronized.';
    }
  }
}

// ==============================================================================
// 3. Unit Toggles (°C vs °F)
// ==============================================================================

function initUnitToggles() {
  const btnC = document.getElementById('btn-unit-celsius');
  const btnF = document.getElementById('btn-unit-fahrenheit');

  if (btnC) {
    btnC.addEventListener('click', () => {
      currentTempUnit = 'C';
      btnC.classList.add('active');
      if (btnF) btnF.classList.remove('active');
      renderTemperatureValue();
    });
  }

  if (btnF) {
    btnF.addEventListener('click', () => {
      currentTempUnit = 'F';
      btnF.classList.add('active');
      if (btnC) btnC.classList.remove('active');
      renderTemperatureValue();
    });
  }
}

function renderTemperatureValue() {
  const tempEl = document.getElementById('val-temp');
  const unitEl = document.getElementById('unit-temp-display');
  const rangeLabel = document.getElementById('temp-range-label');

  if (!tempEl || currentTempCelsius == null) return;

  if (currentTempUnit === 'F') {
    const fVal = (currentTempCelsius * 9 / 5 + 32).toFixed(1);
    tempEl.textContent = fVal;
    if (unitEl) unitEl.textContent = '°F';
    if (rangeLabel) rangeLabel.textContent = 'Range: 97.0 – 99.5 °F';
  } else {
    tempEl.textContent = currentTempCelsius.toFixed(1);
    if (unitEl) unitEl.textContent = '°C';
    if (rangeLabel) rangeLabel.textContent = 'Range: 36.1 – 37.5 °C';
  }
}

// ==============================================================================
// 4. Interactive Historical & Live Charts (Daily, Weekly, Monthly)
// ==============================================================================

function initChart() {
  const canvas = document.getElementById('live-vitals-chart');
  if (!canvas || !window.Chart) return;

  const ctx = canvas.getContext('2d');

  telemetryChart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Heart Rate (BPM)',
          data: hrData,
          borderColor: '#ff4d6d',
          backgroundColor: 'rgba(255, 77, 109, 0.1)',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#ff4d6d'
        },
        {
          label: 'SpO2 (%)',
          data: spo2Data,
          borderColor: '#00f0ff',
          backgroundColor: 'rgba(0, 240, 255, 0.05)',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#00f0ff'
        },
        {
          label: 'Systolic BP (mmHg)',
          data: sysBpData,
          borderColor: '#fbbf24',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.2,
          pointRadius: 2,
          pointBackgroundColor: '#fbbf24'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          labels: {
            color: '#cbd5e1',
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(6, 10, 18, 0.95)',
          borderColor: '#00f0ff',
          borderWidth: 1,
          titleColor: '#00f0ff',
          bodyColor: '#fff'
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'monospace', size: 10 } }
        },
        y: {
          min: 40,
          max: 160,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'monospace', size: 10 } }
        }
      }
    }
  });
}

function updateChart(timeStr, hr, spo2, sysBp) {
  if (!telemetryChart) return;

  if (chartLabels.length >= maxChartPoints) {
    chartLabels.shift();
    hrData.shift();
    spo2Data.shift();
    sysBpData.shift();
  }

  chartLabels.push(timeStr);
  hrData.push(hr ?? null);
  spo2Data.push(spo2 ?? null);
  sysBpData.push(sysBp ?? null);

  telemetryChart.update();
}

function initHistoryFilters() {
  const filterBtns = document.querySelectorAll('.filter-range-btn');
  const badge = document.getElementById('chart-stream-badge');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range;

      if (badge) {
        badge.textContent = `HISTORY (${range.toUpperCase()})`;
        badge.className = 'status-badge warning';
      }

      showToast(`Loading ${range} historical telemetry trends...`, 'info');
      const historyRes = await hardwareApiService.fetchHistory(range);

      if (historyRes.hasData && historyRes.records && historyRes.records.length > 0) {
        loadHistoryIntoChart(historyRes.records);
      } else {
        showToast(`No historical records found for ${range} range yet. Showing live stream.`, 'info');
      }
    });
  });
}

function loadHistoryIntoChart(records) {
  if (!telemetryChart) return;

  chartLabels.length = 0;
  hrData.length = 0;
  spo2Data.length = 0;
  sysBpData.length = 0;

  records.slice(-24).forEach(r => {
    const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chartLabels.push(time);
    hrData.push(r.heartRate?.value ?? r.heartRate ?? null);
    spo2Data.push(r.spo2?.value ?? r.spo2 ?? null);
    sysBpData.push(r.bloodPressure?.systolic ?? null);
  });

  telemetryChart.update();
}

// ==============================================================================
// 5. ECG Waveform Real-time Trace Animation
// ==============================================================================

function initEcgCanvas() {
  const canvas = document.getElementById('canvas-ecg-trace');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth || 300;
  canvas.height = 48;

  let x = 0;
  let prevY = 24;

  function drawEcg() {
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    // Clear small slice ahead
    ctx.clearRect(x, 0, 4, canvas.height);

    // Baseline cardiac trace waveform calculation
    let y = 24;
    const phase = x % 60;
    if (phase === 20) y = 20;       // P-wave
    else if (phase === 26) y = 26;  // Q-dip
    else if (phase === 28) y = 8;   // R-spike
    else if (phase === 30) y = 36;  // S-dip
    else if (phase === 36) y = 18;  // T-wave
    else y = 24 + (Math.sin(x / 5) * 1.5); // Baseline ripple

    ctx.beginPath();
    ctx.moveTo(x === 0 ? 0 : x - 1, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevY = y;
    x = (x + 1.5) % canvas.width;

    ecgAnimationId = requestAnimationFrame(drawEcg);
  }

  drawEcg();
}

// ==============================================================================
// 6. Deliberate SOS Integration
// ==============================================================================

function initSosIntegration() {
  const sosModal = initSosModal((sosPayload) => {
    showToast('EMERGENCY SOS TRANSMISSION BROADCAST!', 'error', 6000);

    renderTelemetryData({
      heartRate: 128,
      spo2: 91,
      temperature: 37.1,
      fallDetected: false,
      emergencyState: 'EMERGENCY',
      emergencyReason: 'Deliberate SOS Triggered by Patient',
      latitude: 24.7955,
      longitude: 84.9995,
      locationSource: 'EMERGENCY SOS GPS',
      timestamp: Date.now()
    });

    addEmergencyTableEntry({
      eventType: 'MANUAL SOS',
      reason: 'Deliberate SOS button activation',
      vitals: 'HR: 128 BPM | SpO2: 91%',
      time: new Date().toLocaleTimeString(),
      location: '24.7955, 84.9995 (Gaya)',
      status: 'DISPATCHED'
    });
  });

  const btn = document.getElementById('trigger-sos-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      sosModal.open();
    });
  }
}

function addEmergencyTableEntry(evt) {
  const tbody = document.getElementById('emergency-events-table-body');
  if (!tbody) return;

  if (tbody.children.length === 1 && tbody.children[0].innerText.includes('No critical incidents')) {
    tbody.innerHTML = '';
  }

  const row = document.createElement('tr');
  row.innerHTML = `
    <td><span class="status-badge emergency">${evt.eventType}</span></td>
    <td style="font-weight:600; color:#fee2e2;">${evt.reason}</td>
    <td style="font-family:monospace; font-size:0.8rem;">${evt.vitals}</td>
    <td style="font-size:0.8rem; color:#94a3b8;">${evt.time}</td>
    <td><a href="https://maps.google.com/?q=${evt.location}" target="_blank" style="font-size:0.8rem;">${evt.location}</a></td>
    <td><span class="status-badge warning">${evt.status}</span></td>
  `;

  tbody.prepend(row);
}

document.addEventListener('DOMContentLoaded', initDashboard);
