/**
 * ALPHA SQUARED - Main Telemetry Dashboard Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar, updateBeaconStatus } from '../components/navbar.js';
import { initSosModal } from '../components/sos-modal.js';
import { showToast } from '../components/notification-toast.js';

let telemetryChart = null;
const maxChartPoints = 15;
const chartLabels = [];
const hrData = [];
const spo2Data = [];

export function initDashboard() {
  renderNavbar('dashboard');
  initParticleBackground('bg-canvas');

  initChart();
  initSosIntegration();
  initDemoToggle();

  // Load initial state or start live telemetry listener / demo
  startTelemetryFeed();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

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
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          labels: {
            color: '#cbd5e1',
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(6, 10, 18, 0.9)',
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
          max: 140,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'monospace', size: 10 } }
        }
      }
    }
  });
}

function updateChart(timeStr, hr, spo2) {
  if (!telemetryChart) return;

  if (chartLabels.length >= maxChartPoints) {
    chartLabels.shift();
    hrData.shift();
    spo2Data.shift();
  }

  chartLabels.push(timeStr);
  hrData.push(hr);
  spo2Data.push(spo2);

  telemetryChart.update();
}

export function renderTelemetryData(payload) {
  if (!payload) return;

  // Patient Info
  if (payload.patientName) {
    const el = document.getElementById('patient-name');
    if (el) el.textContent = payload.patientName;
  }

  // Update Timestamps
  const timeEl = document.getElementById('last-update-time');
  const now = new Date(payload.timestamp || Date.now());
  const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (timeEl) {
    timeEl.textContent = `${timeFormatted} (${payload.isDemo ? 'SIMULATED' : 'LIVE'})`;
  }

  // Heart Rate
  const hrEl = document.getElementById('val-heart-rate');
  const hrBadge = document.getElementById('badge-heart-rate');
  const hrCard = document.getElementById('card-heart-rate');
  if (hrEl) hrEl.textContent = payload.heartRate ?? '--';
  if (hrBadge && hrCard) {
    if (payload.heartRate > 115 || payload.heartRate < 50) {
      hrBadge.className = 'status-badge emergency';
      hrBadge.textContent = payload.heartRate > 115 ? 'TACHYCARDIA' : 'BRADYCARDIA';
      hrCard.className = 'glass-panel vital-card status-emergency';
    } else if (payload.heartRate > 100 || payload.heartRate < 60) {
      hrBadge.className = 'status-badge warning';
      hrBadge.textContent = 'ELEVATED';
      hrCard.className = 'glass-panel vital-card status-warning';
    } else {
      hrBadge.className = 'status-badge normal';
      hrBadge.textContent = 'NORMAL';
      hrCard.className = 'glass-panel vital-card';
    }
  }

  // SpO2
  const spo2El = document.getElementById('val-spo2');
  const spo2Badge = document.getElementById('badge-spo2');
  const spo2Card = document.getElementById('card-spo2');
  if (spo2El) spo2El.textContent = payload.spo2 ?? '--';
  if (spo2Badge && spo2Card) {
    if (payload.spo2 < 90) {
      spo2Badge.className = 'status-badge emergency';
      spo2Badge.textContent = 'CRITICAL HYPOXIA';
      spo2Card.className = 'glass-panel vital-card status-emergency';
    } else if (payload.spo2 < 95) {
      spo2Badge.className = 'status-badge warning';
      spo2Badge.textContent = 'LOW SPO2';
      spo2Card.className = 'glass-panel vital-card status-warning';
    } else {
      spo2Badge.className = 'status-badge normal';
      spo2Badge.textContent = 'OPTIMAL';
      spo2Card.className = 'glass-panel vital-card';
    }
  }

  // Temperature
  const tempEl = document.getElementById('val-temp');
  const tempBadge = document.getElementById('badge-temp');
  const tempCard = document.getElementById('card-temp');
  if (tempEl) tempEl.textContent = (typeof payload.temperature === 'number') ? payload.temperature.toFixed(1) : (payload.temperature ?? '--');
  if (tempBadge && tempCard) {
    if (payload.temperature > 38.5 || payload.temperature < 35.0) {
      tempBadge.className = 'status-badge emergency';
      tempBadge.textContent = payload.temperature > 38.5 ? 'HIGH FEVER' : 'HYPOTHERMIA';
      tempCard.className = 'glass-panel vital-card status-emergency';
    } else if (payload.temperature > 37.6) {
      tempBadge.className = 'status-badge warning';
      tempBadge.textContent = 'MILD PYREXIA';
      tempCard.className = 'glass-panel vital-card status-warning';
    } else {
      tempBadge.className = 'status-badge normal';
      tempBadge.textContent = 'NORMAL';
      tempCard.className = 'glass-panel vital-card';
    }
  }

  // Fall Status
  const fallEl = document.getElementById('val-fall');
  const fallBadge = document.getElementById('badge-fall');
  const fallCard = document.getElementById('card-fall');
  const fallHero = document.getElementById('fall-hero-status');
  if (fallEl && fallBadge && fallCard) {
    if (payload.fallDetected) {
      fallEl.textContent = 'FALL DETECTED!';
      fallEl.style.color = '#ef4444';
      fallBadge.className = 'status-badge emergency';
      fallBadge.textContent = 'IMPACT CONFIRMED';
      fallCard.className = 'glass-panel vital-card status-emergency';
      if (fallHero) {
        fallHero.textContent = 'TRIGGERED';
        fallHero.style.color = '#ef4444';
      }
    } else {
      fallEl.textContent = 'STABLE';
      fallEl.style.color = 'var(--vital-motion)';
      fallBadge.className = 'status-badge normal';
      fallBadge.textContent = 'STABLE';
      fallCard.className = 'glass-panel vital-card';
      if (fallHero) {
        fallHero.textContent = 'ARMED';
        fallHero.style.color = '#a78bfa';
      }
    }
  }

  // Overall State Hero
  const heroCard = document.getElementById('telemetry-hero-card');
  const heroText = document.getElementById('overall-status-text');
  const heroDesc = document.getElementById('status-description');
  const state = payload.emergencyState || 'NORMAL';

  if (heroCard && heroText && heroDesc) {
    heroCard.className = `glass-panel telemetry-hero ${state.toLowerCase()}`;
    heroText.textContent = state;

    if (state === 'EMERGENCY') {
      heroText.style.color = '#ef4444';
      heroDesc.textContent = payload.emergencyReason || 'Critical incident triggered! Immediate caregiver response required.';
    } else if (state === 'WARNING') {
      heroText.style.color = '#f59e0b';
      heroDesc.textContent = payload.warningReason || 'Caution: Vital telemetry elevated beyond nominal thresholds.';
    } else {
      heroText.style.color = 'var(--status-normal)';
      heroDesc.textContent = 'All vital signs within safe physiological ranges. ESP32 edge link is active.';
    }
  }

  // GPS Coordinates & Map Link
  if (payload.latitude && payload.longitude) {
    const coordEl = document.getElementById('coord-lat-lng');
    const gmapsBtn = document.getElementById('btn-open-gmaps');
    const sourceBadge = document.getElementById('location-source-badge');

    if (coordEl) coordEl.textContent = `${payload.latitude.toFixed(4)}° N, ${payload.longitude.toFixed(4)}° E`;
    if (gmapsBtn) gmapsBtn.href = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    if (sourceBadge) sourceBadge.textContent = payload.locationSource || 'DEVICE GPS';
  }

  // Feed Chart
  if (payload.heartRate && payload.spo2) {
    updateChart(timeFormatted, payload.heartRate, payload.spo2);
  }
}

function initSosIntegration() {
  const sosModal = initSosModal((sosPayload) => {
    showToast('EMERGENCY SOS BROADCAST INITIATED!', 'error', 6000);

    // Update telemetry state to EMERGENCY immediately
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

    // Add entry to Recent Incidents table
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

  // Clear empty state if present
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

function initDemoToggle() {
  const btn = document.getElementById('btn-quick-sim');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const isCurrentlyDemo = localStorage.getItem('alphasquared_demo_mode') === 'true';
    const newDemoState = !isCurrentlyDemo;
    localStorage.setItem('alphasquared_demo_mode', String(newDemoState));

    showToast(newDemoState ? 'Demo Mode Activated. Streaming simulated test vitals.' : 'Demo Mode Disabled. Returning to physical device telemetry.', newDemoState ? 'info' : 'success');

    // Update navbar beacon
    updateBeaconStatus(newDemoState ? 'demo' : 'normal', newDemoState ? 'DEMO SIM' : 'ESP32 STANDBY');

    const demoBanner = document.getElementById('demo-banner');
    if (demoBanner) {
      if (newDemoState) {
        demoBanner.classList.add('visible');
      } else {
        demoBanner.classList.remove('visible');
      }
    }

    if (newDemoState) {
      startDemoSimulation();
    } else {
      stopDemoSimulation();
    }
  });
}

let demoInterval = null;

function startDemoSimulation() {
  if (demoInterval) clearInterval(demoInterval);

  let step = 0;
  demoInterval = setInterval(() => {
    step++;
    // Fluctuate slightly around realistic nominal values
    const hr = Math.round(74 + Math.sin(step / 3) * 6 + (Math.random() * 2 - 1));
    const spo2 = Math.round(98 + (Math.random() > 0.8 ? -1 : 0));
    const temp = 36.6 + Math.sin(step / 5) * 0.2;

    renderTelemetryData({
      patientName: 'Jane Doe',
      heartRate: hr,
      spo2: spo2,
      temperature: temp,
      fallDetected: false,
      emergencyState: 'NORMAL',
      latitude: 24.7955,
      longitude: 84.9995,
      locationSource: 'SIMULATED GPS',
      timestamp: Date.now(),
      isDemo: true
    });
  }, 2500);
}

function stopDemoSimulation() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

function startTelemetryFeed() {
  const isDemo = localStorage.getItem('alphasquared_demo_mode') === 'true';
  if (isDemo) {
    startDemoSimulation();
  } else {
    // Provide baseline safe default before Firebase connects
    renderTelemetryData({
      patientName: 'Jane Doe',
      heartRate: 75,
      spo2: 98,
      temperature: 36.6,
      fallDetected: false,
      emergencyState: 'NORMAL',
      latitude: 24.7955,
      longitude: 84.9995,
      locationSource: 'DEVICE GPS (STANDBY)',
      timestamp: Date.now(),
      isDemo: false
    });
  }
}

document.addEventListener('DOMContentLoaded', initDashboard);

