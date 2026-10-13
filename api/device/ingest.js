/**
 * ALPHA SQUARED - Protected Hardware Data Ingestion Endpoint
 * 
 * Secure ingestion target for ESP32 firmware, Arduino devices, BLE gateways,
 * and external IoT cloud webhooks.
 * 
 * Supports:
 * - Bearer Token or X-API-Key authentication
 * - High-precision biometrics (HR, SpO2, Dual-unit Temp, Blood Pressure, RR, Glucose, ECG)
 * - Hardware GPS coordinates & satellite fix status
 * - Fall detection & SOS hardware button interrupt flags
 * - Autonomous forwarding to Firebase Realtime Database when configured
 */

import deviceStore from './device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use POST to transmit hardware telemetry.'
    });
  }

  try {
    // 1. Secure Authentication Verification
    const configuredApiKey = process.env.HARDWARE_API_KEY;
    const authHeader = req.headers['authorization'] || '';
    const xApiKey = req.headers['x-api-key'] || '';

    const providedKey = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (xApiKey || '').trim();

    if (configuredApiKey) {
      if (!providedKey || providedKey !== configuredApiKey) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized. Invalid or missing hardware API key.',
          hint: 'Include X-API-Key or Authorization: Bearer <key> in your HTTP request headers.'
        });
      }
    }

    // 2. Payload Extraction & Validation
    const payload = req.body || {};
    const deviceId = (payload.deviceId || req.query?.deviceId || process.env.ESP32_DEVICE_ID || '').trim();

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required device identifier: "deviceId".'
      });
    }

    const patientId = (payload.patientId || process.env.DEFAULT_PATIENT_ID || 'PATIENT-001').trim();
    const timestamp = payload.timestamp ? Number(payload.timestamp) : Date.now();
    const ingestedParameters = [];

    // 3. Biometric Normalization
    const normalized = {
      deviceId,
      patientId,
      timestamp,
      isLive: true,
      isDemo: false
    };

    // Heart Rate
    const hr = payload.heartRate ?? payload.pulseRate ?? payload.pulse ?? payload.hr;
    if (hr != null && !isNaN(Number(hr))) {
      const hrVal = Number(hr);
      normalized.heartRate = {
        value: hrVal,
        unit: 'BPM',
        status: hrVal > 105 ? 'ELEVATED' : (hrVal < 55 ? 'LOW' : 'NORMAL')
      };
      ingestedParameters.push('heartRate');
    }

    // SpO2
    const spo2 = payload.spo2 ?? payload.bloodOxygen ?? payload.oxygenSaturation;
    if (spo2 != null && !isNaN(Number(spo2))) {
      const spo2Val = Number(spo2);
      normalized.spo2 = {
        value: spo2Val,
        unit: '%',
        status: spo2Val < 92 ? 'LOW' : 'OPTIMAL'
      };
      ingestedParameters.push('spo2');
    }

    // Body Temperature (both Celsius & Fahrenheit)
    const rawTemp = payload.temperature ?? payload.bodyTemperature ?? payload.temp;
    if (rawTemp != null && !isNaN(Number(rawTemp))) {
      const c = Number(rawTemp);
      const f = Number((c * 9 / 5 + 32).toFixed(1));
      normalized.temperature = {
        celsius: c,
        fahrenheit: f,
        unit: '°C',
        status: c > 37.5 ? 'FEVER' : (c < 35.5 ? 'HYPOTHERMIC' : 'NORMAL')
      };
      ingestedParameters.push('temperature');
    }

    // Blood Pressure
    const bpObj = payload.bloodPressure;
    const sys = bpObj?.systolic ?? payload.systolic;
    const dia = bpObj?.diastolic ?? payload.diastolic;
    if (sys != null && dia != null && !isNaN(Number(sys)) && !isNaN(Number(dia))) {
      const sysNum = Number(sys);
      const diaNum = Number(dia);
      normalized.bloodPressure = {
        systolic: sysNum,
        diastolic: diaNum,
        unit: 'mmHg',
        pulse: bpObj?.pulse ?? payload.pulse ?? null,
        status: classifyBloodPressure(sysNum, diaNum)
      };
      ingestedParameters.push('bloodPressure');
    }

    // Respiratory Rate
    const rr = payload.respiratoryRate ?? payload.breathsPerMinute ?? payload.rr;
    if (rr != null && !isNaN(Number(rr))) {
      const rrVal = Number(rr);
      normalized.respiratoryRate = {
        value: rrVal,
        unit: 'breaths/min',
        status: rrVal > 22 ? 'HIGH' : (rrVal < 12 ? 'LOW' : 'NORMAL')
      };
      ingestedParameters.push('respiratoryRate');
    }

    // Blood Glucose
    const glucose = payload.bloodGlucose ?? payload.glucose ?? payload.bg;
    if (glucose != null && !isNaN(Number(glucose))) {
      const bgVal = Number(glucose);
      normalized.bloodGlucose = {
        value: bgVal,
        unit: payload.glucoseUnit || 'mg/dL',
        mealContext: payload.mealContext || 'Fasting',
        status: bgVal > 140 ? 'HIGH' : (bgVal < 70 ? 'LOW' : 'NORMAL')
      };
      ingestedParameters.push('bloodGlucose');
    }

    // ECG & Cardiac Waveform
    if (payload.ecg) {
      const ecg = payload.ecg;
      normalized.ecg = {
        rhythm: ecg.rhythm || ecg.classification || 'Normal Sinus Rhythm',
        leadsStatus: ecg.leadsConnected ? 'Connected (Good Signal)' : 'Single Lead Active',
        waveformSamples: Array.isArray(ecg.waveform) ? ecg.waveform.slice(-60) : []
      };
      ingestedParameters.push('ecg');
    }

    // Steps & Activity
    const steps = payload.steps ?? payload.activity?.steps;
    if (steps != null && !isNaN(Number(steps))) {
      normalized.activity = {
        steps: Number(steps),
        calories: Number(payload.calories ?? payload.activity?.calories ?? 0),
        distanceKm: Number(payload.distanceKm ?? payload.activity?.distanceKm ?? 0)
      };
      ingestedParameters.push('activity');
    }

    // Sleep Metrics
    if (payload.sleep) {
      normalized.sleep = {
        totalDurationHours: Number(payload.sleep.durationHours ?? (payload.sleep.totalMinutes ? (payload.sleep.totalMinutes / 60).toFixed(1) : 0)),
        deepSleepHours: Number(payload.sleep.deepSleepHours ?? 0),
        sleepScore: Number(payload.sleep.score ?? 85)
      };
      ingestedParameters.push('sleep');
    }

    // Hardware GPS Location
    const gps = payload.gps || (payload.latitude && payload.longitude ? payload : null);
    if (gps && gps.latitude != null && gps.longitude != null) {
      normalized.gps = {
        latitude: Number(gps.latitude),
        longitude: Number(gps.longitude),
        altitude: gps.altitude != null ? Number(gps.altitude) : null,
        accuracyMeters: gps.accuracy != null ? Number(gps.accuracy) : null,
        satellites: gps.satellites != null ? Number(gps.satellites) : 8,
        locationSource: 'HARDWARE_GPS (NEO-6M)',
        lastFixTimestamp: timestamp
      };
      // Top-level aliases for backward compatibility with existing map listeners
      normalized.latitude = normalized.gps.latitude;
      normalized.longitude = normalized.gps.longitude;
      normalized.locationSource = normalized.gps.locationSource;
      ingestedParameters.push('gps');
    }

    // Hardware Safety Flags
    normalized.fallDetected = Boolean(payload.fallDetected);
    normalized.sosPressed = Boolean(payload.sosPressed);
    normalized.batteryLevel = payload.batteryLevel || (payload.battery ? `${payload.battery}%` : 'Good');
    normalized.wifiRssi = payload.wifiRssi != null ? Number(payload.wifiRssi) : -58;

    // 4. Critical Emergency Evaluation
    let emergencyDetected = false;
    let emergencyReason = null;

    if (normalized.sosPressed) {
      emergencyDetected = true;
      emergencyReason = 'Hardware Physical SOS Pushbutton Triggered';
    } else if (normalized.fallDetected) {
      emergencyDetected = true;
      emergencyReason = 'IMU Abrupt Impact & Free-fall Spike Detected';
    } else if (normalized.spo2?.value && normalized.spo2.value < 88) {
      emergencyDetected = true;
      emergencyReason = `Severe Hypoxia Detected (${normalized.spo2.value}% SpO2)`;
    } else if (normalized.heartRate?.value && (normalized.heartRate.value > 140 || normalized.heartRate.value < 40)) {
      emergencyDetected = true;
      emergencyReason = `Critical Cardiac Rate (${normalized.heartRate.value} BPM)`;
    }

    normalized.emergencyState = emergencyDetected ? 'EMERGENCY' : 'NORMAL';
    normalized.emergencyReason = emergencyReason;

    // 5. Commit to Reactive Store
    deviceStore.setLatestTelemetry(deviceId, normalized);

    // 6. Asynchronous Cloud Mirroring to Firebase RTDB (if configured)
    const firebaseHost = process.env.FIREBASE_DATABASE_URL;
    if (firebaseHost) {
      const fbAuth = process.env.FIREBASE_AUTH_SECRET || '';
      const authParam = fbAuth ? `?auth=${encodeURIComponent(fbAuth)}` : '';

      // Non-blocking background sync
      Promise.allSettled([
        // Update device telemetry
        fetch(`${firebaseHost.replace(/\/+$/, '')}/devices/${encodeURIComponent(deviceId)}/telemetry/latest.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized)
        }),
        // Update patient current view
        fetch(`${firebaseHost.replace(/\/+$/, '')}/patients/${encodeURIComponent(patientId)}/current.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized)
        }),
        // Append to history
        fetch(`${firebaseHost.replace(/\/+$/, '')}/devices/${encodeURIComponent(deviceId)}/history.json${authParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized)
        })
      ]).catch(fbErr => {
        console.warn('[FIREBASE_MIRROR_WARN]', fbErr.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Hardware telemetry successfully ingested and verified.',
      deviceId,
      patientId,
      timestamp,
      ingestedParameters,
      emergencyDetected,
      emergencyReason,
      telemetry: normalized
    });

  } catch (err) {
    console.error('[INGESTION_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to process hardware telemetry ingestion.',
      details: err.message
    });
  }
}

function classifyBloodPressure(sys, dia) {
  if (sys >= 140 || dia >= 90) return 'STAGE 2 HYPERTENSION';
  if (sys >= 130 || dia >= 80) return 'STAGE 1 HYPERTENSION';
  if (sys >= 120 && dia < 80) return 'ELEVATED';
  return 'NORMAL';
}

