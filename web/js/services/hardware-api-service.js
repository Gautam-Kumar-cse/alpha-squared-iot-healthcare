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
   * Check backend health and persistent database status
   * GET /api/health
   */
  async fetchHealth() {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message, status: 'DOWN' };
    }
  }

  /**
   * Fetch latest Heart Rate and Body Temperature readings
   * GET /api/readings/latest
   */
  async fetchLatestReadings(deviceId = null, patientId = null) {
    const devId = deviceId || this.getConnectedDeviceId();
    const query = new URLSearchParams();
    if (devId) query.set('deviceId', devId);
    if (patientId) query.set('patientId', patientId);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    try {
      const response = await fetch(`/api/readings/latest${queryString}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message, status: 'NETWORK_ERROR' };
    }
  }

  /**
   * Fetch historical readings with range and date filtering
   * GET /api/readings/history
   */
  async fetchReadingsHistory({ range = 'all', startDate = null, endDate = null, limit = 100, deviceId = null, patientId = null, source = 'ALL' } = {}) {
    const devId = deviceId || this.getConnectedDeviceId();
    const query = new URLSearchParams();
    if (range) query.set('range', range);
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);
    if (limit) query.set('limit', String(limit));
    if (devId) query.set('deviceId', devId);
    if (patientId) query.set('patientId', patientId);
    if (source && source !== 'ALL') query.set('source', source);

    try {
      const response = await fetch(`/api/readings/history?${query.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message, readings: [] };
    }
  }

  /**
   * Fetch device connection and hardware status
   * GET /api/device/status
   */
  async fetchDeviceStatus(deviceId = null) {
    const devId = deviceId || this.getConnectedDeviceId();
    const query = devId ? `?deviceId=${encodeURIComponent(devId)}` : '';
    try {
      const response = await fetch(`/api/device/status${query}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message, status: 'OFFLINE', connected: false };
    }
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
