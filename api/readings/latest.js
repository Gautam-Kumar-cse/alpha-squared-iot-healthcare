/**
 * ALPHA SQUARED - Latest Health Readings Endpoint
 * GET /api/readings/latest
 * 
 * Returns the latest verified Heart Rate and Body Temperature readings
 * from connected IoT hardware or the persistent database.
 * 
 * Strict Constraint: Never generates fake or random readings.
 */

import deviceStore from '../device/device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use GET to fetch latest readings.'
    });
  }

  try {
    const queryDeviceId = req.query?.deviceId?.trim();
    const queryPatientId = req.query?.patientId?.trim();

    const latest = await deviceStore.getLatestReadings(queryDeviceId, queryPatientId);

    if (!latest) {
      return res.status(200).json({
        success: true,
        status: 'NO_READINGS',
        message: 'No recorded health telemetry found in database. Connect your ESP32 device to stream live readings.',
        deviceId: queryDeviceId || process.env.ESP32_DEVICE_ID || 'ESP32-ALPHA-01',
        heartRate: null,
        temperature: null,
        timestamp: null,
        source: 'NONE'
      });
    }

    return res.status(200).json({
      success: true,
      status: 'OK',
      deviceId: latest.deviceId,
      patientId: latest.patientId,
      patientName: latest.patientName,
      timestamp: latest.timestamp,
      receivedAt: latest.receivedAt,
      source: latest.source, // 'REAL' or 'DEMO'
      isDemo: latest.isDemo,
      isTestFixture: Boolean(latest.isTestFixture),
      testTag: latest.testTag || (latest.isTestFixture ? 'AUTOMATED_TEST_FIXTURE' : undefined),
      zone: latest.zone,
      zoneLabel: latest.zoneLabel,
      heartRate: latest.heartRate, // { value, unit: 'BPM', status }
      temperature: latest.temperature, // { celsius, fahrenheit, unit: '°C', status }
      emergencyDetected: latest.emergencyDetected,
      gps: latest.gps || null
    });

  } catch (err) {
    console.error('[API_READINGS_LATEST_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve latest health readings.',
      details: err.message
    });
  }
}

