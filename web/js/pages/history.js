/**
 * ALPHA SQUARED - Health History Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';

let hrChart, spo2Chart, tempChart;
const patientId = 'PATIENT-001';
let allReadings = [];
let currentFilter = '15m';

document.addEventListener('DOMContentLoaded', async () => {
  renderNavbar('history');
  initParticleBackground('bg-canvas');

  initFilterButtons();
  allReadings = await dbService.getHistory(patientId);

  initCharts();
  applyFilter(currentFilter);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function initFilterButtons() {
  const buttons = document.querySelectorAll('.time-filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.range;
      applyFilter(currentFilter);
    });
  });
}

function applyFilter(range) {
  const now = Date.now();
  let filtered = allReadings;

  if (range === '15m') {
    filtered = allReadings.filter(r => (now - r.timestamp) <= 15 * 60 * 1000);
  } else if (range === '1h') {
    filtered = allReadings.filter(r => (now - r.timestamp) <= 60 * 60 * 1000);
  } else if (range === '24h') {
    filtered = allReadings.filter(r => (now - r.timestamp) <= 24 * 60 * 60 * 1000);
  }

  // Ensure minimum points if empty
  if (filtered.length === 0) filtered = allReadings.slice(-15);

  updateCharts(filtered);
  renderTable(filtered);
}

function initCharts() {
  const hrCanvas = document.getElementById('chart-hr-history');
  const spo2Canvas = document.getElementById('chart-spo2-history');
  const tempCanvas = document.getElementById('chart-temp-history');

  if (!window.Chart) return;

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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

  if (hrCanvas) {
    hrChart = new window.Chart(hrCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
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

  if (spo2Canvas) {
    spo2Chart = new window.Chart(spo2Canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
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

  if (tempCanvas) {
    tempChart = new window.Chart(tempCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
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
  const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  if (hrChart) {
    hrChart.data.labels = labels;
    hrChart.data.datasets[0].data = data.map(d => d.heartRate);
    hrChart.update();
  }

  if (spo2Chart) {
    spo2Chart.data.labels = labels;
    spo2Chart.data.datasets[0].data = data.map(d => d.spo2);
    spo2Chart.update();
  }

  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = data.map(d => d.temperature);
    tempChart.update();
  }
}

function renderTable(data) {
  const tbody = document.getElementById('history-table-tbody');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-subtle); padding:var(--space-lg);">No records match selected filter.</td></tr>`;
    return;
  }

  // Show newest on top
  const sorted = [...data].reverse();

  tbody.innerHTML = sorted.map(r => {
    const timeStr = new Date(r.timestamp).toLocaleString();
    const state = r.emergencyState || 'NORMAL';
    const badgeClass = state === 'EMERGENCY' ? 'emergency' : (state === 'WARNING' ? 'warning' : 'normal');

    return `
      <tr>
        <td style="font-family:monospace; font-size:0.8rem; color:#cbd5e1;">${timeStr}</td>
        <td style="font-weight:700; color:var(--vital-hr);">${r.heartRate} BPM</td>
        <td style="font-weight:700; color:var(--vital-spo2);">${r.spo2}%</td>
        <td style="font-weight:700; color:var(--vital-temp);">${typeof r.temperature === 'number' ? r.temperature.toFixed(1) : r.temperature}°C</td>
        <td><span class="status-badge ${badgeClass}">${state}</span></td>
      </tr>
    `;
  }).join('');
}

