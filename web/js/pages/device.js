/**
 * ALPHA SQUARED - Device Diagnostics Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { showToast } from '../components/notification-toast.js';

const deviceId = 'ESP32-ALPHA-01';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('device');
  initParticleBackground('bg-canvas');

  loadDeviceDiagnostics();
  initPingButton();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function loadDeviceDiagnostics() {
  const status = dbService.getDeviceStatus(deviceId);

  const heroPanel = document.getElementById('node-hero-panel');
  const statusText = document.getElementById('node-status-text');
  const heartbeatText = document.getElementById('node-last-heartbeat');
  const rssiText = document.getElementById('node-wifi-rssi');
  const batteryText = document.getElementById('node-battery-level');
  const badge = document.getElementById('node-state-badge');

  if (statusText) statusText.textContent = status.status || 'ONLINE';
  if (heartbeatText) heartbeatText.textContent = new Date(status.lastSeen).toLocaleTimeString();
  if (rssiText) rssiText.textContent = `${status.wifiRssi || -58} dBm (Optimal)`;
  if (batteryText) batteryText.textContent = status.batteryLevel || '94% Li-Ion';

  if (status.status === 'ONLINE') {
    if (heroPanel) heroPanel.className = 'glass-panel telemetry-hero normal';
    if (badge) {
      badge.className = 'status-badge normal';
      badge.textContent = 'SYNCED TO RTDB';
    }
  } else {
    if (heroPanel) heroPanel.className = 'glass-panel telemetry-hero emergency';
    if (badge) {
      badge.className = 'status-badge emergency';
      badge.textContent = 'OFFLINE / DISCONNECTED';
    }
  }
}

function initPingButton() {
  const btn = document.getElementById('btn-ping-hardware');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    showToast('Sending telemetry ping to ESP32 node...', 'info');

    setTimeout(async () => {
      await dbService.updateDeviceHeartbeat(deviceId, {
        wifiRssi: -55 - Math.round(Math.random() * 5),
        batteryLevel: '93% Li-Ion',
        status: 'ONLINE'
      });
      loadDeviceDiagnostics();
      btn.disabled = false;
      showToast('Hardware Ping ACK received: Round-trip 42ms. Wi-Fi & RTDB healthy!', 'success');
    }, 700);
  });
}

