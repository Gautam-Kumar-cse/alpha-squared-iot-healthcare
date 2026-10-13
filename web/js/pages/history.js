/**
 * ALPHA SQUARED - Health History Page Controller
 * Upgraded for Multi-Parameter Hardware API Telemetry (Daily, Weekly, Monthly)
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { hardwareApiService } from '../services/hardware-api-service.js';
import { zoneEngine, CLINICAL_ZONES } from '../services/zone-engine.js';

let bpChart, hrChart, spo2Chart, tempChart;
const patientId = 'PATIENT-001';
let allReadings = [];
let currentFilter = 'daily';
let currentZoneFilter = 'ALL';

document.addEventListener('DOMContentLoaded', async () => {
  renderNavbar('history');
  initParticleBackground('bg-canvas');

  initFilterButtons();
  initCharts();

  await loadHistoryData(currentFilter);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function initFilterButtons() {
  const timeButtons = document.querySelectorAll('.time-filter-btn');
  timeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      timeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.range;
      await loadHistoryData(currentFilter);
    });
  });

  const zoneButtons = document.querySelectorAll('.zone-filter-btn');
  zoneButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      zoneButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentZoneFilter = btn.dataset.zone || 'ALL';
      applyFilterAndRender(allReadings, currentFilter);
    });
  });
}

async function loadHistoryData(range) {
  // If hardware device is connected, check its API history first
  if (hardwareApiService.isConnected()) {
    try {
      const hwHistory = await hardwareApiService.fetchHistory(range);
      if (hwHistory.hasData && hwHistory.records && hwHistory.records.length > 0) {
        allReadings = hwHistory.records;
        applyFilterAndRender(allReadings, range);
        const srcBadge = document.getElementById('history-dataset-source');
        if (srcBadge) srcBadge.textContent = 'CONNECTED HARDWARE API';
        return;
      }
    } catch {
      // Fallback to local/DB storage
    }
  }

  // Fallback to RTDB / local historical records
  allReadings = await dbService.getHistory(patientId);
  applyFilterAndRender(allReadings, range);
  const srcBadge = document.getElementById('history-dataset-source');
  if (srcBadge) srcBadge.textContent = 'TELEMETRY ARCHIVE';
}

function applyFilterAndRender(dataset, range) {
  const now = Date.now();
  let filtered = dataset;

  if (range === 'daily') {
    filtered = dataset.filter(r => (now - r.timestamp) <= 24 * 60 * 60 * 1000);
  } else if (range === 'weekly') {
    filtered = dataset.filter(r => (now - r.timestamp) <= 7 * 24 * 60 * 60 * 1000);
  } else if (range === 'monthly') {
    filtered = dataset.filter(r => (now - r.timestamp) <= 30 * 24 * 60 * 60 * 1000);
  }

  if (filtered.length === 0) filtered = dataset.slice(-24);

  // Apply Zone Filter if selected
  if (currentZoneFilter && currentZoneFilter !== 'ALL') {
    filtered = filtered.filter(r => {
      const z = r.zone || zoneEngine.evaluate(r).overallZone;
      return z === currentZoneFilter;
    });
  }

  updateCharts(filtered.length > 0 ? filtered : dataset.slice(-20));
  renderTable(filtered);
}

function initCharts() {
  const bpCanvas = document.getElementById('chart-bp-history');
  const hrCanvas = document.getElementById('chart-hr-history');
  const spo2Canvas = document.getElementById('chart-spo2-history');
  const tempCanvas = document.getElementById('chart-temp-history');

  if (!window.Chart) return;

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } }
      },
      tooltip: {
        backgroundColor: 'rgba(6, 10, 18, 0.95)',
        borderColor: '#00f0ff',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', font: { family: 'monospace', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', font: { family: 'monospace', size: 10 } }
      }
    }
  };

  // 1. Blood Pressure Chart
  if (bpCanvas) {
    bpChart = new window.Chart(bpCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Systolic BP (mmHg)',
            data: [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Diastolic BP (mmHg)',
            data: [],
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderDash: [4, 4],
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { min: 50, max: 180, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
        }
      }
    });
  }

  // 2. Heart Rate Chart
  if (hrCanvas) {
    hrChart = new window.Chart(hrCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Heart Rate (BPM)',
          data: [],
          borderColor: '#ff4d6d',
          backgroundColor: 'rgba(255, 77, 109, 0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 3
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { min: 45, max: 130, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
        }
      }
    });
  }

  // 3. SpO2 Chart
  if (spo2Canvas) {
    spo2Chart = new window.Chart(spo2Canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'SpO2 (%)',
          data: [],
          borderColor: '#00f0ff',
          backgroundColor: 'rgba(0, 240, 255, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { min: 85, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
        }
      }
    });
  }

  // 4. Temperature Chart
  if (tempCanvas) {
    tempChart = new window.Chart(tempCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Temperature (°C)',
          data: [],
          borderColor: '#ffb703',
          backgroundColor: 'rgba(255, 183, 3, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { min: 35.0, max: 39.5, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
        }
      }
    });
  }
}

function updateCharts(data) {
  const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  if (bpChart) {
    bpChart.data.labels = labels;
    bpChart.data.datasets[0].data = data.map(d => d.bloodPressure?.systolic ?? 120);
    bpChart.data.datasets[1].data = data.map(d => d.bloodPressure?.diastolic ?? 80);
    bpChart.update();
  }

  if (hrChart) {
    hrChart.data.labels = labels;
    hrChart.data.datasets[0].data = data.map(d => d.heartRate?.value ?? d.heartRate ?? null);
    hrChart.update();
  }

  if (spo2Chart) {
    spo2Chart.data.labels = labels;
    spo2Chart.data.datasets[0].data = data.map(d => d.spo2?.value ?? d.spo2 ?? null);
    spo2Chart.update();
  }

  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = data.map(d => d.temperature?.celsius ?? d.temperature ?? null);
    tempChart.update();
  }
}

function renderTable(data) {
  const tbody = document.getElementById('history-table-tbody');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-subtle); padding:var(--space-lg);">No records match selected timeline and zone filters.</td></tr>`;
    return;
  }

  const sorted = [...data].reverse();

  tbody.innerHTML = sorted.map(r => {
    const timeStr = new Date(r.timestamp).toLocaleString();
    const zoneEval = zoneEngine.evaluate(r);
    const zone = r.zone || zoneEval.overallZone || 'GREEN';
    const state = r.emergencyState || (zone === 'RED' ? 'EMERGENCY' : (zone === 'YELLOW' ? 'WARNING' : 'NORMAL'));
    const badgeClass = state === 'EMERGENCY' ? 'emergency' : (state === 'WARNING' ? 'warning' : 'normal');

    const bpStr = r.bloodPressure?.systolic 
      ? `${r.bloodPressure.systolic}/${r.bloodPressure.diastolic} mmHg`
      : '120/80 mmHg';

    const hrVal = r.heartRate?.value ?? r.heartRate ?? '--';
    const spo2Val = r.spo2?.value ?? r.spo2 ?? '--';
    const tempVal = r.temperature?.celsius ?? r.temperature ?? '--';

    return `
      <tr>
        <td style="font-family:monospace; font-size:0.8rem; color:#cbd5e1;">${timeStr}</td>
        <td style="font-weight:700; color:#ef4444;">${bpStr}</td>
        <td style="font-weight:700; color:var(--vital-hr);">${hrVal} BPM</td>
        <td style="font-weight:700; color:var(--vital-spo2);">${spo2Val}%</td>
        <td style="font-weight:700; color:var(--vital-temp);">${typeof tempVal === 'number' ? tempVal.toFixed(1) : tempVal}°C</td>
        <td><span class="status-badge zone-${zone.toLowerCase()}">${zone} ZONE</span></td>
        <td><span class="status-badge ${badgeClass}">${state}</span></td>
      </tr>
    `;
  }).join('');
}
