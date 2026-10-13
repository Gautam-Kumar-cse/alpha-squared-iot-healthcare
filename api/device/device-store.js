/**
 * ALPHA SQUARED - Protected Hardware Device Reactive In-Memory & Cache Store
 * 
 * Manages telemetry snapshots, historical ring-buffer, and device states for
 * local development and serverless invocations.
 * 
 * Strictly adheres to rule:
 * - NO fake or randomly generated health data when real hardware is disconnected.
 * - Stores real ingested biometric & GPS payloads from ESP32 / wearable gateways.
 */

class DeviceStore {
  constructor() {
    this.devices = new Map(); // deviceId -> metadata & status
    this.telemetryLatest = new Map(); // deviceId -> normalized latest telemetry
    this.telemetryHistory = new Map(); // deviceId -> Array of historical snapshots
    this.maxHistoryPerDevice = 500;
  }

  registerDevice(deviceId, metadata = {}) {
    const existing = this.devices.get(deviceId) || {};
    const updated = {
      ...existing,
      ...metadata,
      deviceId,
      lastSeen: Date.now(),
      status: metadata.status || 'ONLINE'
    };
    this.devices.set(deviceId, updated);
    return updated;
  }

  getDeviceStatus(deviceId) {
    return this.devices.get(deviceId) || {
      deviceId,
      status: 'OFFLINE',
      lastSeen: null,
      supportedParameters: []
    };
  }

  setLatestTelemetry(deviceId, telemetry) {
    const record = {
      ...telemetry,
      deviceId,
      timestamp: telemetry.timestamp || Date.now(),
      receivedAt: Date.now()
    };

    this.telemetryLatest.set(deviceId, record);

    // Append to historical ring buffer
    if (!this.telemetryHistory.has(deviceId)) {
      this.telemetryHistory.set(deviceId, []);
    }
    const history = this.telemetryHistory.get(deviceId);
    history.push(record);
    if (history.length > this.maxHistoryPerDevice) {
      history.shift();
    }

    // Update device status to ONLINE
    this.registerDevice(deviceId, {
      status: 'ONLINE',
      lastSeen: Date.now(),
      battery: telemetry.batteryLevel || telemetry.battery || 'Good'
    });

    return record;
  }

  getLatestTelemetry(deviceId) {
    return this.telemetryLatest.get(deviceId) || null;
  }

  getHistory(deviceId, range = 'daily') {
    const list = this.telemetryHistory.get(deviceId) || [];
    const now = Date.now();
    let filterMs = 24 * 60 * 60 * 1000; // daily default

    if (range === 'weekly') {
      filterMs = 7 * 24 * 60 * 60 * 1000;
    } else if (range === 'monthly') {
      filterMs = 30 * 24 * 60 * 60 * 1000;
    }

    const filtered = list.filter(r => (now - (r.timestamp || r.receivedAt)) <= filterMs);
    return filtered.length > 0 ? filtered : list.slice(-50);
  }

  clearDevice(deviceId) {
    this.telemetryLatest.delete(deviceId);
    this.telemetryHistory.delete(deviceId);
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.status = 'DISCONNECTED';
      this.devices.set(deviceId, dev);
    }
  }
}

// Global singleton instance across module imports in same Node process
const globalKey = Symbol.for('alphasquared.device.store');
const globalStore = globalThis[globalKey] || new DeviceStore();
globalThis[globalKey] = globalStore;

export default globalStore;

