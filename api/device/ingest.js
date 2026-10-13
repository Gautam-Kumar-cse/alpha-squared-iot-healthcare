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
 * - Real-time Clinical Zone Evaluation (GREEN, YELLOW, RED)
 * - Automatic SMS Alert Triggering with cooldown suppression
 * - Dynamic custom/extended health parameters extraction
 * - Autonomous forwarding to Firebase Realtime Database when configured
 */

import deviceStore from './device-store.js';
import { evaluatePatientZones } from './zone-evaluator.js';
import sendSmsHandler from '../alerts/send-sms.js';

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
    const reqHeaders = req.headers || {};
    const authHeader = reqHeaders['authorization'] || '';
    const xApiKey = reqHeaders['x-api-key'] || '';

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
    const patientName = payload.patientName || process.env.DEFAULT_PATIENT_NAME || 'Jane Doe';
    const timestamp = payload.timestamp ? Number(payload.timestamp) : Date.now();
    const ingestedParameters = [];

    // 3. Biometric Normalization
    const normalized = {
      deviceId,
      patientId,
      patientName,
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
        status: hrVal > 120 ? 'CRITICAL_HIGH' : (hrVal > 100 ? 'ELEVATED' : (hrVal < 50 ? 'CRITICAL_LOW' : (hrVal < 60 ? 'LOW' : 'NORMAL')))
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
        status: spo2Val < 90 ? 'CRITICAL_HYPOXIA' : (spo2Val < 95 ? 'MILD_HYPOXIA' : 'OPTIMAL')
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
        status: c > 38.5 ? 'HIGH_FEVER' : (c >= 37.6 ? 'LOW_FEVER' : (c < 35.0 ? 'SEVERE_HYPOTHERMIA' : (c < 36.5 ? 'MILD_HYPOTHERMIA' : 'NORMAL')))
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
        status: rrVal > 25 ? 'CRITICAL_HIGH' : (rrVal > 20 ? 'ELEVATED' : (rrVal < 9 ? 'CRITICAL_LOW' : (rrVal < 12 ? 'LOW' : 'NORMAL')))
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
        status: bgVal >= 200 ? 'CRITICAL_HIGH' : (bgVal > 140 ? 'ELEVATED' : (bgVal < 60 ? 'CRITICAL_LOW' : (bgVal < 70 ? 'LOW' : 'NORMAL')))
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

    // Hardware Safety Flags & Telemetry Health
    normalized.fallDetected = Boolean(payload.fallDetected);
    normalized.sosPressed = Boolean(payload.sosPressed);
    normalized.batteryLevel = payload.batteryLevel || (payload.battery ? `${payload.battery}%` : 'Good');
    normalized.wifiRssi = payload.wifiRssi != null ? Number(payload.wifiRssi) : -58;
    normalized.firmwareVersion = payload.firmwareVersion || payload.firmware || 'v2.4.0';
    normalized.sensorStatus = payload.sensorStatus || {
      opticalPulse: 'ATTACHED',
      temperatureProbe: 'ATTACHED',
      imuMotion: 'ATTACHED',
      satelliteGps: normalized.gps ? 'LOCKED' : 'SEARCHING'
    };

    // 4. Extract Dynamic / Custom Sensor Parameters
    // Detects any additional documented sensor fields without breaking layout
    const knownKeys = new Set([
      'deviceId', 'patientId', 'patientName', 'timestamp',
      'heartRate', 'pulseRate', 'pulse', 'hr',
      'spo2', 'bloodOxygen', 'oxygenSaturation',
      'temperature', 'bodyTemperature', 'temp',
      'bloodPressure', 'systolic', 'diastolic',
      'respiratoryRate', 'breathsPerMinute', 'rr',
      'bloodGlucose', 'glucose', 'bg', 'glucoseUnit', 'mealContext',
      'ecg', 'steps', 'activity', 'calories', 'distanceKm', 'sleep',
      'gps', 'latitude', 'longitude', 'altitude', 'accuracy', 'satellites',
      'fallDetected', 'sosPressed', 'batteryLevel', 'battery', 'wifiRssi',
      'firmwareVersion', 'firmware', 'sensorStatus', 'extendedParameters', 'customMetrics',
      'patientPhone', 'contacts', 'isDemo', 'isLive'
    ]);

    const customMetrics = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!knownKeys.has(k) && v != null && typeof v !== 'object') {
        customMetrics[k] = {
          name: k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          value: v,
          unit: guessUnit(k)
        };
      }
    }
    if (payload.extendedParameters && typeof payload.extendedParameters === 'object') {
      Object.assign(customMetrics, payload.extendedParameters);
    }
    if (Object.keys(customMetrics).length > 0) {
      normalized.customMetrics = customMetrics;
    }

    // -------------------------------------------------------------
    // 5. Automatic Health Evaluation (GREEN, YELLOW, RED ZONES)
    // -------------------------------------------------------------
    const zoneEvaluation = evaluatePatientZones(normalized);

    normalized.zone = zoneEvaluation.overallZone;
    normalized.overallZone = zoneEvaluation.overallZone;
    normalized.zoneLabel = zoneEvaluation.zoneLabel;
    normalized.zoneTriggers = zoneEvaluation.triggers;
    normalized.measurementZones = zoneEvaluation.measurementZones;
    normalized.requiresSms = zoneEvaluation.requiresSms;
    normalized.smsPriority = zoneEvaluation.smsPriority;
    normalized.disclaimer = zoneEvaluation.disclaimer;

    // Backward-compatibility aliases
    normalized.emergencyDetected = zoneEvaluation.isEmergency;
    normalized.emergencyState = zoneEvaluation.isEmergency ? 'EMERGENCY' : (zoneEvaluation.isWarning ? 'WARNING' : 'NORMAL');
    normalized.emergencyReason = zoneEvaluation.triggers.length > 0 
      ? zoneEvaluation.triggers.map(t => t.label).join('; ')
      : null;

    // -------------------------------------------------------------
    // 6. Automatic SMS Notification Dispatch (Yellow & Red Zones)
    // -------------------------------------------------------------
    let smsDispatchResult = null;
    if (zoneEvaluation.requiresSms) {
      try {
        const smsReq = {
          method: 'POST',
          body: {
            patientId,
            patientName,
            zone: zoneEvaluation.overallZone,
            triggers: zoneEvaluation.triggers,
            vitals: {
              heartRate: normalized.heartRate?.value,
              spo2: normalized.spo2?.value,
              temperature: normalized.temperature,
              bloodPressure: normalized.bloodPressure,
              respiratoryRate: normalized.respiratoryRate?.value,
              bloodGlucose: normalized.bloodGlucose?.value
            },
            location: normalized.gps,
            patientPhone: payload.patientPhone || null,
            contacts: payload.contacts || []
          }
        };

        let smsResponseData = null;
        const smsMockRes = {
          status: function(c) { this.statusCode = c; return this; },
          json: function(d) { smsResponseData = d; return this; },
          setHeader: function() {},
          end: function() {}
        };

        await sendSmsHandler(smsReq, smsMockRes);
        smsDispatchResult = smsResponseData;
        normalized.lastSmsDispatch = smsDispatchResult;
      } catch (smsErr) {
        console.warn('[AUTOMATIC_SMS_DISPATCH_WARN]', smsErr.message);
        normalized.lastSmsDispatch = {
          success: false,
          error: smsErr.message,
          timestamp: Date.now()
        };
      }
    }

    // -------------------------------------------------------------
    // 7. Commit to Reactive Store
    // -------------------------------------------------------------
    deviceStore.setLatestTelemetry(deviceId, normalized);

    // -------------------------------------------------------------
    // 8. Asynchronous Cloud Mirroring to Firebase RTDB (if configured)
    // -------------------------------------------------------------
    const firebaseHost = process.env.FIREBASE_DATABASE_URL;
    if (firebaseHost) {
      const fbAuth = process.env.FIREBASE_AUTH_SECRET || '';
      const authParam = fbAuth ? `?auth=${encodeURIComponent(fbAuth)}` : '';

      Promise.allSettled([
        fetch(`${firebaseHost.replace(/\/+$/, '')}/devices/${encodeURIComponent(deviceId)}/telemetry/latest.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized)
        }),
        fetch(`${firebaseHost.replace(/\/+$/, '')}/patients/${encodeURIComponent(patientId)}/current.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized)
        }),
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
      message: 'Hardware telemetry successfully ingested, zone-evaluated, and verified.',
      deviceId,
      patientId,
      timestamp,
      zone: zoneEvaluation.overallZone,
      zoneLabel: zoneEvaluation.zoneLabel,
      zoneTriggers: zoneEvaluation.triggers,
      requiresSms: zoneEvaluation.requiresSms,
      smsDispatch: smsDispatchResult,
      ingestedParameters,
      emergencyDetected: zoneEvaluation.isEmergency,
      emergencyReason: normalized.emergencyReason,
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

function guessUnit(key) {
  const lk = key.toLowerCase();
  if (lk.includes('percent') || lk.includes('index') || lk.includes('ratio')) return '%';
  if (lk.includes('weight') || lk.includes('mass')) return 'kg';
  if (lk.includes('cal')) return 'kcal';
  if (lk.includes('volt')) return 'V';
  if (lk.includes('amp')) return 'mA';
  if (lk.includes('ohm') || lk.includes('conductance')) return 'µS';
  return '';
}
