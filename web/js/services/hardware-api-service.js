/**
 * ALPHA SQUARED - Hardware API Integration Client Service
 * Communicates with the secure backend API proxy to connect to real health devices,
 * stream live multi-parameter biometrics, test connections, and fetch historical trends.
 *
 * Strictly adheres to rule: NO fake or randomly generated health data.
 */

const STORAGE_KEYS = {
  DEVICE_ID: 'alphasquared_hw_device_id',
  DEVICE_NAME: 'alphasquared_hw_device_name',
  DEVICE_MODEL: 'alphasquared_hw_device_model',
  DEVICE_PROTOCOL: 'alphasquared_hw_protocol',
  DEVICE_API_URL: 'alphasquared_hw_api_url',
  DEVICE_CONNECTED: 'alphasquared_hw_is_connected',
  DEVICE_METADATA: 'alphasquared_hw_metadata',
  POLL_INTERVAL: 'alphasquared_hw_poll_interval'
};

class HardwareApiService {
  constructor() {
    this.pollTimer = null;
    this.activeCallbacks = new Set();
    this.lastReading = null;
    this.lastSyncTime = null;
    this.isPolling = false;
  }

  isConnected() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_CONNECTED) === 'true';
  }

  getConnectedDeviceId() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_ID) || null;
  }

  getConnectedDeviceName() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_NAME) || 'Alpha Wearable Node 01';
  }

  getConnectedDeviceModel() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_MODEL) || 'GENERIC_HEALTH_DEVICE';
  }

  getConnectedProtocol() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_PROTOCOL) || 'REST_HTTPS';
  }

  getApiBaseUrl() {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_API_URL) || '';
  }

  getPollInterval() {
    return parseInt(localStorage.getItem(STORAGE_KEYS.POLL_INTERVAL) || '15', 10);
  }

  getDeviceMetadata() {
    try {
      const meta = localStorage.getItem(STORAGE_KEYS.DEVICE_METADATA);
      return meta ? JSON.parse(meta) : null;
    } catch {
      return null;
    }
  }

  /**
   * Test Hardware API Connection Diagnostics
   */
  async testConnection({ deviceId, apiKey = '', apiBaseUrl = '', protocol = 'REST_HTTPS', provider = '' }) {
    if (!deviceId || !deviceId.trim()) {
      throw new Error('Device Identifier is required to run diagnostic test.');
    }

    const payload = {
      deviceId: deviceId.trim(),
      apiKey: apiKey.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      protocol,
      provider: provider.trim()
    };

    const response = await fetch('/api/device/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Diagnostic test failed with HTTP ${response.status}`);
    }

    return result;
  }

  /**
   * Connect to hardware device via secure backend
   */
  async connectDevice({ deviceId, deviceName = '', apiKey = '', apiBaseUrl = '', deviceModel = '', protocol = 'REST_HTTPS' }) {
    if (!deviceId || !deviceId.trim()) {
      throw new Error('Device ID or identifier is required.');
    }

    const payload = {
      deviceId: deviceId.trim(),
      apiKey: apiKey.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      deviceModel: deviceModel.trim() || 'GENERIC_HEALTH_DEVICE',
      protocol
    };

    const response = await fetch('/api/device/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Connection failed with HTTP ${response.status}.`);
    }

    // Persist device session
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, result.deviceId);
    if (deviceName) localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, deviceName.trim());
    localStorage.setItem(STORAGE_KEYS.DEVICE_MODEL, result.deviceModel);
    localStorage.setItem(STORAGE_KEYS.DEVICE_PROTOCOL, result.protocol || protocol);
    if (apiBaseUrl) localStorage.setItem(STORAGE_KEYS.DEVICE_API_URL, apiBaseUrl.trim());
    localStorage.setItem(STORAGE_KEYS.DEVICE_CONNECTED, 'true');
    if (result.deviceMetadata) {
      localStorage.setItem(STORAGE_KEYS.DEVICE_METADATA, JSON.stringify(result.deviceMetadata));
    }

    return result;
  }

  /**
   * Save configuration metadata without private secrets
   */
  saveConfiguration({ deviceId, deviceName = '', deviceModel = '', protocol = 'REST_HTTPS', apiBaseUrl = '', pollInterval = 15 }) {
    if (deviceId) localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId.trim());
    if (deviceName) localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, deviceName.trim());
    if (deviceModel) localStorage.setItem(STORAGE_KEYS.DEVICE_MODEL, deviceModel.trim());
    if (protocol) localStorage.setItem(STORAGE_KEYS.DEVICE_PROTOCOL, protocol);
    if (apiBaseUrl !== undefined) localStorage.setItem(STORAGE_KEYS.DEVICE_API_URL, apiBaseUrl.trim());
    localStorage.setItem(STORAGE_KEYS.POLL_INTERVAL, String(pollInterval));
  }

  /**
   * Disconnect the hardware device
   */
  disconnectDevice() {
    this.stopAutoPolling();
    localStorage.setItem(STORAGE_KEYS.DEVICE_CONNECTED, 'false');
    this.lastReading = null;
    this.lastSyncTime = null;
  }

  /**
   * Fetch current live telemetry from the connected device
   */
  async fetchLiveTelemetry() {
    const deviceId = this.getConnectedDeviceId();
    if (!deviceId) {
      return {
        connected: false,
        status: 'DEVICE_NOT_CONNECTED',
        message: 'No hardware device is currently connected.'
      };
    }

    const response = await fetch(`/api/device/telemetry?deviceId=${encodeURIComponent(deviceId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const result = await response.json().catch(() => ({}));

    if (result.connected && result.telemetry) {
      this.lastReading = result.telemetry;
      this.lastSyncTime = result.lastSync || Date.now();
    }

    return result;
  }

  /**
   * Fetch historical records (daily, weekly, monthly)
   */
  async fetchHistory(range = 'daily') {
    const deviceId = this.getConnectedDeviceId();
    if (!deviceId) {
      return { hasData: false, records: [] };
    }

    const response = await fetch(`/api/device/history?deviceId=${encodeURIComponent(deviceId)}&range=${encodeURIComponent(range)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    return await response.json().catch(() => ({ hasData: false, records: [] }));
  }

  /**
   * Start periodic auto-refresh polling
   */
  startAutoPolling(intervalSeconds = 15, onUpdateCallback) {
    this.stopAutoPolling();
    if (typeof onUpdateCallback === 'function') {
      this.activeCallbacks.add(onUpdateCallback);
    }

    const poll = async () => {
      try {
        const data = await this.fetchLiveTelemetry();
        this.activeCallbacks.forEach(cb => cb(data));
      } catch (err) {
        this.activeCallbacks.forEach(cb => cb({ error: err.message, status: 'POLL_ERROR' }));
      }
    };

    // Immediate first fetch
    poll();

    // Periodic timer
    const ms = Math.max(5000, intervalSeconds * 1000);
    this.pollTimer = setInterval(poll, ms);
    this.isPolling = true;
  }

  stopAutoPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
  }
}

export const hardwareApiService = new HardwareApiService();
