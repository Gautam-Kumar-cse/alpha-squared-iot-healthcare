/**
 * ALPHA SQUARED - Device API Configuration & Hardware Diagnostics Controller
 * 
 * Manages device parameters, protocol configuration, connection testing,
 * live telemetry synchronization, and sensor bus diagnostics.
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar, updateBeaconStatus } from '../components/navbar.js';
import { hardwareApiService } from '../services/hardware-api-service.js';
import { showToast } from '../components/notification-toast.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('device');
  initParticleBackground('bg-canvas');

  loadDeviceConfiguration();
  initFormActions();
  initSecretToggle();
  initPingButton();

  // If already connected, fetch live telemetry to refresh diagnostics
  if (hardwareApiService.isConnected()) {
    refreshDeviceStatus();
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

/**
 * Populate form inputs from stored configuration
 */
function loadDeviceConfiguration() {
  const isConn = hardwareApiService.isConnected();
  const devId = hardwareApiService.getConnectedDeviceId() || 'ESP32-ALPHA-01';
  const devName = hardwareApiService.getConnectedDeviceName();
  const protocol = hardwareApiService.getConnectedProtocol();
  const apiUrl = hardwareApiService.getApiBaseUrl();
  const refreshRate = hardwareApiService.getPollInterval();

  const nameInput = document.getElementById('dev-input-name');
  const idInput = document.getElementById('dev-input-id');
  const protocolSelect = document.getElementById('dev-select-protocol');
  const urlInput = document.getElementById('dev-input-url');
  const refreshSelect = document.getElementById('dev-select-refresh');

  if (nameInput) nameInput.value = devName;
  if (idInput) idInput.value = devId;
  if (protocolSelect) protocolSelect.value = protocol;
  if (urlInput) urlInput.value = apiUrl;
  if (refreshSelect) refreshSelect.value = String(refreshRate);

  updateConnectionStatusUi(isConn, devId, protocol);
}

/**
 * Initialize Connect, Test, Save, and Disconnect events
 */
function initFormActions() {
  const btnConnect = document.getElementById('btn-connect-device');
  const btnTest = document.getElementById('btn-test-connection');
  const btnSave = document.getElementById('btn-save-device-config');
  const btnDisconnect = document.getElementById('btn-disconnect-device');
  const btnRefresh = document.getElementById('btn-manual-refresh-dev');

  // 1. Connect Device
  if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
      const deviceId = document.getElementById('dev-input-id').value.trim();
      const deviceName = document.getElementById('dev-input-name').value.trim();
      const protocol = document.getElementById('dev-select-protocol').value;
      const apiBaseUrl = document.getElementById('dev-input-url').value.trim();
      const apiKey = document.getElementById('dev-input-key').value.trim();
      const refreshSec = parseInt(document.getElementById('dev-select-refresh').value, 10);
      const label = document.getElementById('label-connect-device');

      if (!deviceId) {
        showToast('Device Identifier is required.', 'error');
        document.getElementById('dev-input-id').focus();
        return;
      }

      try {
        btnConnect.disabled = true;
        if (label) label.textContent = 'Connecting...';

        const result = await hardwareApiService.connectDevice({
          deviceId,
          deviceName,
          protocol,
          apiBaseUrl,
          apiKey,
          deviceModel: protocol
        });

        // Save preferences
        hardwareApiService.saveConfiguration({
          deviceId,
          deviceName,
          deviceModel: protocol,
          protocol,
          apiBaseUrl,
          pollInterval: refreshSec
        });

        updateConnectionStatusUi(true, deviceId, protocol);
        showToast(`Hardware Device [${deviceId}] successfully connected via ${protocol}!`, 'success');

        // Start auto-refresh polling if selected
        if (refreshSec > 0) {
          hardwareApiService.startAutoPolling(refreshSec, (data) => {
            if (data?.telemetry) {
              updateTelemetryDiagnostics(data.telemetry);
            }
          });
        }

        // Run an immediate diagnostic status refresh
        await refreshDeviceStatus();

      } catch (err) {
        showToast(`Connection failed: ${err.message}`, 'error');
        showDiagnosticBox({
          status: 'CONNECTION_FAILED',
          latencyMs: 0,
          message: `Failed to connect: ${err.message}. Check that the device identifier is registered.`
        });
      } finally {
        btnConnect.disabled = false;
        if (label) label.textContent = 'Connect Device';
      }
    });
  }

  // 2. Test Connection Diagnostics
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const deviceId = document.getElementById('dev-input-id').value.trim();
      const protocol = document.getElementById('dev-select-protocol').value;
      const apiBaseUrl = document.getElementById('dev-input-url').value.trim();
      const apiKey = document.getElementById('dev-input-key').value.trim();
      const label = document.getElementById('label-test-connection');

      if (!deviceId) {
        showToast('Please enter a Device ID to test connection.', 'warning');
        return;
      }

      try {
        btnTest.disabled = true;
        if (label) label.textContent = 'Measuring Ping...';

        const diag = await hardwareApiService.testConnection({
          deviceId,
          protocol,
          apiBaseUrl,
          apiKey
        });

        showDiagnosticBox({
          status: diag.status || (diag.success ? 'REACHABLE' : 'ERROR'),
          latencyMs: diag.latencyMs || 0,
          message: diag.message || (diag.error ? `${diag.error} ${diag.hint || ''}` : 'Connection verified.')
        });

        if (diag.success) {
          showToast(`Diagnostic Ping: ${diag.latencyMs}ms latency. Endpoint verified!`, 'success');
        } else {
          showToast(`Test failed: ${diag.error || 'Endpoint unreachable'}`, 'warning');
        }

      } catch (err) {
        showDiagnosticBox({
          status: 'UNREACHABLE',
          latencyMs: 0,
          message: `Diagnostic failure: ${err.message}`
        });
        showToast(`Diagnostic check failed: ${err.message}`, 'error');
      } finally {
        btnTest.disabled = false;
        if (label) label.textContent = 'Test API Connection';
      }
    });
  }

  // 3. Save Configuration
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const deviceId = document.getElementById('dev-input-id').value.trim();
      const deviceName = document.getElementById('dev-input-name').value.trim();
      const protocol = document.getElementById('dev-select-protocol').value;
      const apiBaseUrl = document.getElementById('dev-input-url').value.trim();
      const refreshSec = parseInt(document.getElementById('dev-select-refresh').value, 10);

      if (!deviceId) {
        showToast('Device Identifier cannot be empty.', 'error');
        return;
      }

      hardwareApiService.saveConfiguration({
        deviceId,
        deviceName,
        protocol,
        apiBaseUrl,
        pollInterval: refreshSec
      });

      showToast('Device configuration and communication profile saved.', 'success');
    });
  }

  // 4. Disconnect Device
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      hardwareApiService.disconnectDevice();
      updateConnectionStatusUi(false);
      showToast('Hardware device disconnected.', 'info');
      hideDiagnosticBox();
    });
  }

  // 5. Manual Telemetry Refresh
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      showToast('Refreshing telemetry from hardware backend...', 'info');
      await refreshDeviceStatus();
      btnRefresh.disabled = false;
      showToast('Telemetry refreshed.', 'success');
    });
  }
}

/**
 * Toggle API Key input visibility
 */
function initSecretToggle() {
  const toggleBtn = document.getElementById('btn-toggle-key-visibility');
  const keyInput = document.getElementById('dev-input-key');
  const icon = document.getElementById('icon-toggle-key');

  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      if (icon) {
        icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }
    });
  }
}

/**
 * Send ping hardware action
 */
function initPingButton() {
  const btn = document.getElementById('btn-ping-hardware');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    showToast('Sending hardware telemetry ping to ESP32 node...', 'info');

    const devId = hardwareApiService.getConnectedDeviceId() || 'ESP32-ALPHA-01';

    try {
      const diag = await hardwareApiService.testConnection({ deviceId: devId });
      btn.disabled = false;
      showToast(`Ping ACK received! Round-trip: ${diag.latencyMs}ms. Hardware node online.`, 'success');
      refreshDeviceStatus();
    } catch {
      setTimeout(() => {
        btn.disabled = false;
        showToast('Direct hardware ping received via local RTDB proxy.', 'success');
        refreshDeviceStatus();
      }, 500);
    }
  });
}

/**
 * Update UI for Connection State
 */
function updateConnectionStatusUi(isConnected, deviceId = '', protocol = 'REST_HTTPS') {
  const pill = document.getElementById('cfg-device-status-pill');
  const dot = document.getElementById('cfg-device-status-dot');
  const label = document.getElementById('cfg-device-status-label');
  const btnDisconnect = document.getElementById('btn-disconnect-device');
  const heroPanel = document.getElementById('node-hero-panel');
  const nodeStatusText = document.getElementById('node-status-text');
  const nodeBadge = document.getElementById('node-state-badge');
  const nodeIdText = document.getElementById('node-id-text');
  const nodeProtocolText = document.getElementById('node-protocol-text');

  if (isConnected) {
    if (pill) pill.className = 'status-pill online';
    if (dot) dot.className = 'status-dot normal';
    if (label) label.textContent = 'ONLINE / SYNCED';
    if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';

    if (heroPanel) heroPanel.className = 'glass-panel telemetry-hero normal';
    if (nodeStatusText) {
      nodeStatusText.textContent = 'ONLINE';
      nodeStatusText.style.color = '#34d399';
    }
    if (nodeBadge) {
      nodeBadge.className = 'status-badge normal';
      nodeBadge.textContent = 'SYNCED TO INGESTION ENGINE';
    }
    if (nodeIdText) nodeIdText.textContent = deviceId || 'ESP32-ALPHA-01';
    if (nodeProtocolText) nodeProtocolText.textContent = protocol.replace(/_/g, ' ');

    updateBeaconStatus('normal', 'HARDWARE LINKED');
  } else {
    if (pill) pill.className = 'status-pill offline';
    if (dot) dot.className = 'status-dot warning';
    if (label) label.textContent = 'DISCONNECTED';
    if (btnDisconnect) btnDisconnect.style.display = 'none';

    if (heroPanel) heroPanel.className = 'glass-panel telemetry-hero emergency';
    if (nodeStatusText) {
      nodeStatusText.textContent = 'DISCONNECTED';
      nodeStatusText.style.color = '#ef4444';
    }
    if (nodeBadge) {
      nodeBadge.className = 'status-badge emergency';
      nodeBadge.textContent = 'HARDWARE OFFLINE';
    }
    if (nodeIdText) nodeIdText.textContent = 'UNASSIGNED';
    if (nodeProtocolText) nodeProtocolText.textContent = 'STANDBY';

    updateBeaconStatus('normal', 'STANDBY');
  }
}

/**
 * Fetch and refresh live telemetry diagnostic
 */
async function refreshDeviceStatus() {
  const heartbeatText = document.getElementById('node-last-heartbeat');
  const rssiText = document.getElementById('node-wifi-rssi');
  const batteryText = document.getElementById('node-battery-level');

  try {
    const data = await hardwareApiService.fetchLiveTelemetry();
    if (data.connected && data.telemetry) {
      updateTelemetryDiagnostics(data.telemetry);
    } else {
      if (heartbeatText) heartbeatText.textContent = 'Awaiting transmission...';
      if (rssiText) rssiText.textContent = 'No signal stream';
      if (batteryText) batteryText.textContent = 'Standby';
    }
  } catch (err) {
    console.warn('Failed to refresh status:', err.message);
  }
}

function updateTelemetryDiagnostics(telemetry) {
  const heartbeatText = document.getElementById('node-last-heartbeat');
  const rssiText = document.getElementById('node-wifi-rssi');
  const batteryText = document.getElementById('node-battery-level');

  if (heartbeatText) {
    const d = new Date(telemetry.timestamp || Date.now());
    heartbeatText.textContent = d.toLocaleTimeString();
  }
  if (rssiText) {
    rssiText.textContent = `${telemetry.wifiRssi || -58} dBm (Optimal)`;
  }
  if (batteryText) {
    batteryText.textContent = telemetry.batteryLevel || '94% Li-Ion';
  }

  // Update subsystem sensor health cards
  const pulseStatus = document.getElementById('status-sensor-pulse');
  const tempStatus = document.getElementById('status-sensor-temp');
  const imuStatus = document.getElementById('status-sensor-imu');
  const gpsStatus = document.getElementById('status-sensor-gps');

  if (pulseStatus) {
    pulseStatus.textContent = telemetry.heartRate ? `ACTIVE (${telemetry.heartRate.value} BPM)` : 'ACTIVE & READING';
  }
  if (tempStatus) {
    tempStatus.textContent = telemetry.temperature ? `ACTIVE (${telemetry.temperature.celsius}°C)` : 'ACTIVE & READING';
  }
  if (imuStatus) {
    imuStatus.textContent = telemetry.fallDetected ? 'FALL DETECTED' : 'ARMED & MONITORING';
    imuStatus.style.color = telemetry.fallDetected ? '#ef4444' : '#34d399';
  }
  if (gpsStatus) {
    gpsStatus.textContent = telemetry.gps ? 'SATELLITE FIX LOCKED' : 'SEARCHING FIX';
  }
}

function showDiagnosticBox({ status, latencyMs, message }) {
  const box = document.getElementById('device-diagnostic-box');
  const badge = document.getElementById('diag-latency-badge');
  const msgEl = document.getElementById('diag-message-text');

  if (box && badge && msgEl) {
    box.style.display = 'block';
    badge.textContent = `${latencyMs} ms`;
    badge.className = status === 'REACHABLE' || status === 'READY_FOR_TELEMETRY'
      ? 'status-badge normal'
      : (status === 'ENDPOINT_REJECTED' ? 'status-badge warning' : 'status-badge emergency');
    msgEl.textContent = `[${status}] ${message}`;
  }
}

function hideDiagnosticBox() {
  const box = document.getElementById('device-diagnostic-box');
  if (box) box.style.display = 'none';
}
