/**
 * ALPHA SQUARED - Hardware Device Status Endpoint
 * GET /api/device/status
 * 
 * Reports hardware device connection state, last data transmission time,
 * battery health, RSSI signal, firmware, and sensor subsystems status.
 */

import deviceStore from '../../lib/device/device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use GET to check device status.'
    });
  }

  try {
    const queryDeviceId = req.query?.deviceId?.trim();
    const targetDeviceId = queryDeviceId || process.env.ESP32_DEVICE_ID || 'ESP32-ALPHA-01';

    const status = deviceStore.getDeviceStatus(targetDeviceId);

    return res.status(200).json({
      success: true,
      deviceId: status.deviceId,
      status: status.status, // 'ONLINE', 'STANDBY', 'OFFLINE'
      connected: status.connected,
      lastDataTime: status.lastDataTime,
      lastSeen: status.lastSeen,
      batteryLevel: status.batteryLevel,
      wifiRssi: status.wifiRssi,
      firmwareVersion: status.firmwareVersion,
      sensors: status.sensors,
      dataSource: status.dataSource
    });

  } catch (err) {
    console.error('[API_DEVICE_STATUS_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve device status.',
      details: err.message
    });
  }
}

