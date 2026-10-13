/**
 * ALPHA SQUARED - Automated Verification & Test Suite
 * Validates algorithmic logic, threshold bounds, payload contracts,
 * hardware API ingestion, connection testing, data models, and security rules.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import deviceStore from '../api/device/device-store.js';
import ingestHandler from '../api/device/ingest.js';
import testHandler from '../api/device/test.js';
import connectHandler, { isSafeUrl } from '../api/device/connect.js';
import { evaluatePatientZones, CLINICAL_ZONES } from '../api/device/zone-evaluator.js';
import sendSmsHandler from '../api/alerts/send-sms.js';
import { zoneEngine, ZoneEngine } from '../web/js/services/zone-engine.js';
import healthHandler from '../api/health.js';
import latestReadingsHandler from '../api/readings/latest.js';
import historyReadingsHandler from '../api/readings/history.js';
import rootIngestHandler, { validateIngestionData, DEFAULT_DEV_API_KEY } from '../api/ingest.js';
import deviceStatusHandler from '../api/device/status.js';
import mongoClient, { MONGO_STATUS } from '../api/db/mongo-client.js';
import migrationService from '../api/db/migration.js';

console.log('====================================================');
console.log('  ALPHA SQUARED IoT HEALTHCARE — VERIFICATION SUITE ');
console.log('  Government Polytechnic Gaya                        ');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failCount++;
  }
}

// ---------------------------------------------------------
// 1. Threshold Evaluator Test
// ---------------------------------------------------------
const DEFAULT_THRESHOLDS = {
  hrLowWarning: 55,
  hrLowCritical: 50,
  hrHighWarning: 105,
  hrHighCritical: 120,
  spo2LowWarning: 94,
  spo2LowCritical: 90,
  tempHighWarning: 37.5,
  tempHighCritical: 38.5,
  tempLowWarning: 35.5,
  tempLowCritical: 35.0
};

function evaluateTelemetry(reading, th = DEFAULT_THRESHOLDS) {
  const issues = [];
  let state = 'NORMAL';
  const { heartRate, spo2, temperature, fallDetected, sosPressed } = reading;

  if (sosPressed) {
    return { state: 'EMERGENCY', reason: 'SOS', eventType: 'MANUAL_SOS' };
  }
  if (fallDetected) {
    issues.push('Fall');
    state = 'EMERGENCY';
  }
  if (heartRate != null) {
    if (heartRate >= th.hrHighCritical || heartRate <= th.hrLowCritical) {
      issues.push('Critical HR');
      state = 'EMERGENCY';
    } else if (heartRate >= th.hrHighWarning || heartRate <= th.hrLowWarning) {
      issues.push('Warning HR');
      if (state !== 'EMERGENCY') state = 'WARNING';
    }
  }
  if (spo2 != null) {
    if (spo2 <= th.spo2LowCritical) {
      issues.push('Critical SpO2');
      state = 'EMERGENCY';
    } else if (spo2 <= th.spo2LowWarning) {
      issues.push('Warning SpO2');
      if (state !== 'EMERGENCY') state = 'WARNING';
    }
  }
  return { state, reason: issues.join('; ') };
}

runTest('Vital Evaluation: Nominal resting readings result in NORMAL', () => {
  const res = evaluateTelemetry({ heartRate: 72, spo2: 98, temperature: 36.6, fallDetected: false, sosPressed: false });
  assert.strictEqual(res.state, 'NORMAL');
});

runTest('Vital Evaluation: Elevated pulse (110 BPM) results in WARNING', () => {
  const res = evaluateTelemetry({ heartRate: 110, spo2: 98, temperature: 36.6, fallDetected: false, sosPressed: false });
  assert.strictEqual(res.state, 'WARNING');
});

runTest('Vital Evaluation: Hypoxia (SpO2 88%) results in EMERGENCY', () => {
  const res = evaluateTelemetry({ heartRate: 85, spo2: 88, temperature: 36.6, fallDetected: false, sosPressed: false });
  assert.strictEqual(res.state, 'EMERGENCY');
});

runTest('Vital Evaluation: Fall detected triggers EMERGENCY immediately', () => {
  const res = evaluateTelemetry({ heartRate: 80, spo2: 98, temperature: 36.6, fallDetected: true, sosPressed: false });
  assert.strictEqual(res.state, 'EMERGENCY');
});

runTest('Vital Evaluation: SOS button triggers immediate EMERGENCY override', () => {
  const res = evaluateTelemetry({ heartRate: 75, spo2: 99, temperature: 36.5, fallDetected: false, sosPressed: true });
  assert.strictEqual(res.state, 'EMERGENCY');
  assert.strictEqual(res.eventType, 'MANUAL_SOS');
});

// ---------------------------------------------------------
// 2. File and Architecture Presence Checks
// ---------------------------------------------------------
const requiredFiles = [
  'web/index.html',
  'web/dashboard.html',
  'web/emergency.html',
  'web/location.html',
  'web/history.html',
  'web/settings.html',
  'web/device.html',
  'web/login.html',
  'web/register.html',
  'web/about.html',
  'web/css/design-system.css',
  'web/css/layout.css',
  'web/css/components.css',
  'web/css/pages.css',
  'web/js/components/particle-background.js',
  'web/js/components/navbar.js',
  'web/js/components/notification-toast.js',
  'web/js/components/sos-modal.js',
  'web/js/pages/about.js',
  'web/js/services/auth-service.js',
  'web/js/services/db-service.js',
  'web/js/services/emergency-service.js',
  'web/js/services/demo-simulator.js',
  'hardware/esp32/esp32_firmware.ino',
  'hardware/esp32/SensorDrivers.h',
  'hardware/esp32/hardware_config.h',
  'hardware/esp32/config.h.example',
  'hardware/esp32/README_HARDWARE.md',
  'api/alerts/send-emergency-email.js',
  'api/device/connect.js',
  'api/device/telemetry.js',
  'api/device/history.js',
  'api/device/ingest.js',
  'api/device/test.js',
  'api/device/device-store.js',
  'web/js/services/hardware-api-service.js',
  'database.rules.json',
  'vercel.json',
  '.env.example'
];

requiredFiles.forEach(fileRel => {
  runTest(`System File Integrity: ${fileRel} exists and is populated`, () => {
    const fullPath = path.resolve(process.cwd(), fileRel);
    assert.ok(fs.existsSync(fullPath), `File missing: ${fileRel}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 20, `File appears empty: ${fileRel}`);
  });
});

// ---------------------------------------------------------
// 3. Security Rule & Credentials Leak Inspection
// ---------------------------------------------------------
runTest('Security: database.rules.json blocks public unauthenticated read access', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'database.rules.json'), 'utf-8');
  assert.ok(!content.includes('".read": true'), 'Security violation: Public read is exposed!');
  assert.ok(!content.includes('".write": true'), 'Security violation: Public write is exposed!');
});

runTest('Security: Frontend JS files do not leak private server secrets or hardcoded passwords', () => {
  const jsFiles = ['web/js/services/hardware-api-service.js', 'web/js/pages/device.js', 'web/js/pages/settings.js'];
  for (const f of jsFiles) {
    const content = fs.readFileSync(path.resolve(process.cwd(), f), 'utf-8');
    assert.ok(!content.includes('process.env.SMTP_PASS'), `Secret leak detected in ${f}`);
    assert.ok(!content.includes('process.env.HARDWARE_CLIENT_SECRET'), `Secret leak detected in ${f}`);
  }
});

// ---------------------------------------------------------
// 4. Hardware API Endpoint & Normalizer Logic Tests
// ---------------------------------------------------------
function classifyBloodPressure(sys, dia) {
  if (sys >= 140 || dia >= 90) return 'STAGE 2 HYPERTENSION';
  if (sys >= 130 || dia >= 80) return 'STAGE 1 HYPERTENSION';
  if (sys >= 120 && dia < 80) return 'ELEVATED';
  return 'NORMAL';
}

runTest('Hardware API: Blood Pressure classification works accurately', () => {
  assert.strictEqual(classifyBloodPressure(118, 76), 'NORMAL');
  assert.strictEqual(classifyBloodPressure(125, 78), 'ELEVATED');
  assert.strictEqual(classifyBloodPressure(135, 85), 'STAGE 1 HYPERTENSION');
  assert.strictEqual(classifyBloodPressure(150, 95), 'STAGE 2 HYPERTENSION');
});

function convertCelsiusToFahrenheit(c) {
  return Number((c * 9 / 5 + 32).toFixed(1));
}

runTest('Hardware API: Temperature dual conversion (°C to °F) is exact', () => {
  assert.strictEqual(convertCelsiusToFahrenheit(36.6), 97.9);
  assert.strictEqual(convertCelsiusToFahrenheit(37.0), 98.6);
  assert.strictEqual(convertCelsiusToFahrenheit(38.5), 101.3);
});

// ---------------------------------------------------------
// 5. In-Memory Device Store Logic Tests
// ---------------------------------------------------------
runTest('DeviceStore: Registers device and manages status state correctly', () => {
  const testDevId = 'TEST-NODE-UNIT-01';
  deviceStore.registerDevice(testDevId, { status: 'ONLINE', protocol: 'REST_HTTPS' });
  const status = deviceStore.getDeviceStatus(testDevId);
  assert.strictEqual(status.deviceId, testDevId);
  assert.strictEqual(status.status, 'ONLINE');
});

runTest('DeviceStore: Stores and retrieves normalized telemetry snapshots', () => {
  const testDevId = 'TEST-NODE-UNIT-02';
  const sampleTelemetry = {
    heartRate: { value: 76, unit: 'BPM', status: 'NORMAL' },
    spo2: { value: 99, unit: '%', status: 'OPTIMAL' },
    temperature: { celsius: 36.6, fahrenheit: 97.9, unit: '°C', status: 'NORMAL' }
  };
  deviceStore.setLatestTelemetry(testDevId, sampleTelemetry);
  const fetched = deviceStore.getLatestTelemetry(testDevId);
  assert.ok(fetched);
  assert.strictEqual(fetched.heartRate.value, 76);
  assert.strictEqual(fetched.spo2.value, 99);
  assert.strictEqual(fetched.temperature.celsius, 36.6);
  assert.strictEqual(fetched.temperature.fahrenheit, 97.9);
});

runTest('DeviceStore: Appends history and handles range filtering', () => {
  const testDevId = 'TEST-NODE-UNIT-03';
  deviceStore.clearDevice(testDevId);
  deviceStore.setLatestTelemetry(testDevId, { heartRate: { value: 80 }, timestamp: Date.now() });
  deviceStore.setLatestTelemetry(testDevId, { heartRate: { value: 82 }, timestamp: Date.now() });
  const history = deviceStore.getHistory(testDevId, 'daily');
  assert.ok(Array.isArray(history));
  assert.strictEqual(history.length, 2);
});

// ---------------------------------------------------------
// 6. Data Ingestion Endpoint Integration Tests
// ---------------------------------------------------------
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    }
  };
}

await runAsyncTest('Ingestion API: Rejects non-POST requests with 405 Method Not Allowed', async () => {
  const req = { method: 'GET', headers: {}, body: {} };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.success, false);
});

await runAsyncTest('Ingestion API: Validates missing device ID with 400 Bad Request', async () => {
  const req = { method: 'POST', headers: {}, body: { heartRate: 75 } };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.error.includes('deviceId'));
});

await runAsyncTest('Ingestion API: Successfully ingests multi-parameter biometrics and GPS', async () => {
  const req = {
    method: 'POST',
    headers: {},
    body: {
      deviceId: 'ESP32-ALPHA-TEST-INGEST',
      patientId: 'PATIENT-001',
      heartRate: 84,
      spo2: 97,
      temperature: 37.2,
      bloodPressure: { systolic: 124, diastolic: 82, pulse: 80 },
      respiratoryRate: 18,
      bloodGlucose: 102,
      gps: { latitude: 24.7955, longitude: 84.9995, altitude: 120, accuracy: 4.8, satellites: 9 },
      fallDetected: false,
      sosPressed: false,
      timestamp: Date.now()
    }
  };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.ingestedParameters.includes('heartRate'));
  assert.ok(res.body.ingestedParameters.includes('spo2'));
  assert.ok(res.body.ingestedParameters.includes('temperature'));
  assert.ok(res.body.ingestedParameters.includes('bloodPressure'));
  assert.ok(res.body.ingestedParameters.includes('gps'));
  assert.strictEqual(res.body.telemetry.temperature.fahrenheit, 99.0);
  assert.strictEqual(res.body.telemetry.bloodPressure.status, 'STAGE 1 HYPERTENSION');
  assert.strictEqual(res.body.telemetry.gps.locationSource, 'HARDWARE_GPS (NEO-6M)');
  assert.strictEqual(res.body.telemetry.isDemo, false);
});

await runAsyncTest('Ingestion API: Flags emergency immediately upon hardware SOS or fall trigger', async () => {
  const req = {
    method: 'POST',
    headers: {},
    body: {
      deviceId: 'ESP32-ALPHA-TEST-INGEST',
      sosPressed: true,
      fallDetected: true
    }
  };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.emergencyDetected, true);
  assert.strictEqual(res.body.telemetry.emergencyState, 'EMERGENCY');
});

// ---------------------------------------------------------
// 7. Connection Diagnostic Test Endpoint
// ---------------------------------------------------------
await runAsyncTest('Diagnostic Test API: Rejects missing device ID with 400', async () => {
  const req = { method: 'POST', body: {} };
  const res = createMockRes();
  await testHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await runAsyncTest('Diagnostic Test API: Successfully reports status and measures latency', async () => {
  const req = {
    method: 'POST',
    body: {
      deviceId: 'ESP32-ALPHA-01',
      protocol: 'REST_HTTPS'
    }
  };
  const res = createMockRes();
  await testHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, 'READY_FOR_TELEMETRY');
  assert.ok(typeof res.body.latencyMs === 'number');
  assert.strictEqual(res.body.protocol, 'REST_HTTPS');
});

// ---------------------------------------------------------
// 8. Location Separation & Integrity Contract
// ---------------------------------------------------------
runTest('Location Isolation Contract: Hardware GPS and Browser Geolocation schemas are distinct', () => {
  const hwGps = {
    latitude: 24.7955,
    longitude: 84.9995,
    altitude: 120,
    accuracyMeters: 4.5,
    satellites: 8,
    locationSource: 'HARDWARE_GPS (NEO-6M)'
  };

  const browserLoc = {
    latitude: 24.7960,
    longitude: 84.9990,
    accuracy: 8.2,
    locationSource: 'BROWSER_GEOLOCATION (Live)'
  };

  assert.notStrictEqual(hwGps.locationSource, browserLoc.locationSource);
  assert.ok(hwGps.locationSource.startsWith('HARDWARE_GPS'));
  assert.ok(browserLoc.locationSource.startsWith('BROWSER_GEOLOCATION'));
});

// ---------------------------------------------------------
// 9. About Us Page & Core Capabilities Migration Tests
// ---------------------------------------------------------
runTest('Migration: Core Capabilities section is completely removed from Home Page (index.html)', () => {
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/index.html'), 'utf-8');
  assert.ok(!indexHtml.includes('Comprehensive Patient Safety Ecosystem'), 'index.html must not contain the heading');
  assert.ok(!indexHtml.includes('CORE CAPABILITIES'), 'index.html must not contain CORE CAPABILITIES badge');
  assert.ok(!indexHtml.includes('Real-Time Vitals Tracking'), 'index.html must not contain Real-Time Vitals Tracking');
  assert.ok(!indexHtml.includes('Autonomous Fall Detection'), 'index.html must not contain Autonomous Fall Detection');
  assert.ok(!indexHtml.includes('Immediate Caregiver SOS'), 'index.html must not contain Immediate Caregiver SOS');
});

runTest('Migration: About Us page (about.html) exists and contains full introduction and 6 capability cards', () => {
  const aboutHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/about.html'), 'utf-8');
  assert.ok(aboutHtml.includes('Comprehensive Patient Safety Ecosystem'), 'about.html must contain heading');
  assert.ok(aboutHtml.includes('Real-Time Vitals Tracking'), 'about.html must contain Card 1');
  assert.ok(aboutHtml.includes('Autonomous Fall Detection'), 'about.html must contain Card 2');
  assert.ok(aboutHtml.includes('Immediate Caregiver SOS'), 'about.html must contain Card 3');
  assert.ok(aboutHtml.includes('Live Geolocation Tracking'), 'about.html must contain Card 4');
  assert.ok(aboutHtml.includes('Longitudinal Health Analytics'), 'about.html must contain Card 5');
  assert.ok(aboutHtml.includes('Role-Based Security Rules'), 'about.html must contain Card 6');
  assert.ok(aboutHtml.includes('features-grid'), 'about.html must contain responsive features-grid');
  assert.ok(aboutHtml.includes('improve patient safety through IoT-based health monitoring'), 'about.html must contain professional intro');
});

runTest('Navigation: Global navbar includes About Us link for desktop and mobile drawer', () => {
  const navbarJs = fs.readFileSync(path.resolve(process.cwd(), 'web/js/components/navbar.js'), 'utf-8');
  assert.ok(navbarJs.includes('href="about.html"'), 'navbar.js must contain href="about.html"');
  assert.ok(navbarJs.includes('activePage === \'about\''), 'navbar.js must support activePage === "about"');
});

// ---------------------------------------------------------
// 10. Clinical Zone Evaluation Engine Tests (GREEN, YELLOW, RED)
// ---------------------------------------------------------
runTest('Zone Evaluator: Nominal resting biometrics classify as GREEN (Normal & Stable)', () => {
  const result = evaluatePatientZones({
    heartRate: 72,
    spo2: 98,
    temperature: { celsius: 36.8, fahrenheit: 98.24 },
    bloodPressure: { systolic: 118, diastolic: 76 },
    respiratoryRate: 16,
    bloodGlucose: 95
  });

  assert.strictEqual(result.overallZone, CLINICAL_ZONES.GREEN);
  assert.strictEqual(result.isNormal, true);
  assert.strictEqual(result.isWarning, false);
  assert.strictEqual(result.isEmergency, false);
  assert.strictEqual(result.requiresSms, false);
  assert.strictEqual(result.smsPriority, 'NONE');
  assert.strictEqual(result.triggers.length, 0);
  assert.ok(result.disclaimer.includes('Normal readings indicate'));
});

runTest('Zone Evaluator: Moderate deviations escalate to YELLOW (Caution & SMS notice)', () => {
  // Test mild tachycardia
  const tachy = evaluatePatientZones({ heartRate: 108 });
  assert.strictEqual(tachy.overallZone, CLINICAL_ZONES.YELLOW);
  assert.strictEqual(tachy.requiresSms, true);
  assert.strictEqual(tachy.smsPriority, 'CAUTION');
  assert.ok(tachy.triggers.some(t => t.parameter === 'heartRate'));

  // Test mild bradycardia
  const brady = evaluatePatientZones({ heartRate: 54 });
  assert.strictEqual(brady.overallZone, CLINICAL_ZONES.YELLOW);

  // Test mild hypoxia
  const hypoxia = evaluatePatientZones({ spo2: 92 });
  assert.strictEqual(hypoxia.overallZone, CLINICAL_ZONES.YELLOW);

  // Test low-grade fever
  const fever = evaluatePatientZones({ temperature: 37.9 });
  assert.strictEqual(fever.overallZone, CLINICAL_ZONES.YELLOW);

  // Test Stage 1 hypertension
  const bp = evaluatePatientZones({ bloodPressure: { systolic: 132, diastolic: 84 } });
  assert.strictEqual(bp.overallZone, CLINICAL_ZONES.YELLOW);

  // Test tachypnea
  const rr = evaluatePatientZones({ respiratoryRate: 23 });
  assert.strictEqual(rr.overallZone, CLINICAL_ZONES.YELLOW);

  // Test borderline hyperglycemia
  const glucose = evaluatePatientZones({ bloodGlucose: 165 });
  assert.strictEqual(glucose.overallZone, CLINICAL_ZONES.YELLOW);
});

runTest('Zone Evaluator: Critical biometric anomalies escalate to RED (Critical Emergency)', () => {
  // Critical tachycardia
  const critTachy = evaluatePatientZones({ heartRate: 135 });
  assert.strictEqual(critTachy.overallZone, CLINICAL_ZONES.RED);
  assert.strictEqual(critTachy.isEmergency, true);
  assert.strictEqual(critTachy.requiresSms, true);
  assert.strictEqual(critTachy.smsPriority, 'URGENT');

  // Severe hypoxia
  const critHypox = evaluatePatientZones({ spo2: 86 });
  assert.strictEqual(critHypox.overallZone, CLINICAL_ZONES.RED);

  // Hyperpyrexia
  const critTemp = evaluatePatientZones({ temperature: 39.5 });
  assert.strictEqual(critTemp.overallZone, CLINICAL_ZONES.RED);

  // Hypertensive Crisis
  const critBp = evaluatePatientZones({ bloodPressure: { systolic: 185, diastolic: 125 } });
  assert.strictEqual(critBp.overallZone, CLINICAL_ZONES.RED);

  // Severe Hypotension
  const critHypo = evaluatePatientZones({ bloodPressure: { systolic: 82, diastolic: 55 } });
  assert.strictEqual(critHypo.overallZone, CLINICAL_ZONES.RED);

  // Critical respiratory rate
  const critRr = evaluatePatientZones({ respiratoryRate: 7 });
  assert.strictEqual(critRr.overallZone, CLINICAL_ZONES.RED);

  // Critical hypoglycemia
  const critSugar = evaluatePatientZones({ bloodGlucose: 45 });
  assert.strictEqual(critSugar.overallZone, CLINICAL_ZONES.RED);
});

runTest('Zone Evaluator: Autonomous IMU Fall Detection instantly triggers RED Zone override', () => {
  const result = evaluatePatientZones({
    heartRate: 72,
    spo2: 98,
    fallDetected: true
  });
  assert.strictEqual(result.overallZone, CLINICAL_ZONES.RED);
  assert.strictEqual(result.isEmergency, true);
  assert.strictEqual(result.requiresSms, true);
  assert.ok(result.triggers.some(t => t.parameter === 'fall'));
});

runTest('Zone Evaluator: Hardware Physical SOS Button push instantly triggers RED Zone override', () => {
  const result = evaluatePatientZones({
    heartRate: 74,
    spo2: 99,
    sosPressed: true
  });
  assert.strictEqual(result.overallZone, CLINICAL_ZONES.RED);
  assert.strictEqual(result.isEmergency, true);
  assert.strictEqual(result.requiresSms, true);
  assert.ok(result.triggers.some(t => t.parameter === 'sos'));
});

// ---------------------------------------------------------
// 11. Serverless SMS Gateway Dispatcher & Anti-Spam Cooldown Tests
// ---------------------------------------------------------
await runAsyncTest('SMS Dispatcher: Rejects non-POST requests with 405 Method Not Allowed', async () => {
  const req = { method: 'GET', body: {} };
  const res = createMockRes();
  await sendSmsHandler(req, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.success, false);
});

await runAsyncTest('SMS Dispatcher: Correctly builds RED Zone emergency alert with location and vitals snapshot', async () => {
  const req = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-TEST-01',
      patientName: 'Rahul Verma',
      zone: 'RED',
      triggers: [{ parameter: 'heartRate', label: 'Critical Tachycardia', value: '142 BPM' }],
      vitals: {
        heartRate: 142,
        spo2: 89,
        temperature: { celsius: 38.6 },
        bloodPressure: { systolic: 160, diastolic: 100 }
      },
      location: { latitude: 24.7955, longitude: 84.9995 },
      bypassCooldown: true
    }
  };
  const res = createMockRes();
  await sendSmsHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.zone, 'RED');
  assert.ok(res.body.smsBody.includes('Rahul Verma'));
  assert.ok(res.body.smsBody.includes('RED ZONE (Critical)'));
  assert.ok(res.body.smsBody.includes('https://maps.google.com/?q=24.7955,84.9995'));
  assert.ok(res.body.smsBody.includes('142 BPM'));
  assert.ok(res.body.smsBody.includes('89%'));
  assert.ok(res.body.smsBody.includes('38.6°C'));
  assert.ok(res.body.smsBody.includes('160/100 mmHg'));
});

await runAsyncTest('SMS Dispatcher: Correctly builds YELLOW Zone cautionary alert with advice', async () => {
  const req = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-TEST-02',
      patientName: 'Priya Sharma',
      zone: 'YELLOW',
      triggers: [{
        parameter: 'bloodPressure',
        label: 'Pre-Hypertension',
        value: '132/86 mmHg',
        recommendedAction: 'Rest in quiet room and re-measure in 15 minutes.'
      }],
      bypassCooldown: true
    }
  };
  const res = createMockRes();
  await sendSmsHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.zone, 'YELLOW');
  assert.ok(res.body.smsBody.includes('Priya Sharma'));
  assert.ok(res.body.smsBody.includes('YELLOW ZONE (Warning)'));
  assert.ok(res.body.smsBody.includes('Pre-Hypertension: 132/86 mmHg'));
  assert.ok(res.body.smsBody.includes('Rest in quiet room and re-measure in 15 minutes.'));
});

await runAsyncTest('SMS Dispatcher: Verifies test SMS trigger mode', async () => {
  const req = {
    method: 'POST',
    body: {
      isTest: true,
      patientName: 'Test Patient',
      patientPhone: '+919999988888'
    }
  };
  const res = createMockRes();
  await sendSmsHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.smsBody.includes('[ALPHA SQUARED TEST SMS]'));
  assert.ok(res.body.smsBody.includes('SMS Gateway is verified and functional'));
});

await runAsyncTest('SMS Dispatcher: Enforces cooldown suppression against caregiver notification spam', async () => {
  const reqPayload = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-COOLDOWN-TEST',
      patientName: 'Cooldown Subject',
      zone: 'YELLOW',
      triggers: [{ parameter: 'heartRate', zone: 'YELLOW', label: 'Tachycardia', value: '112 BPM' }],
      cooldownSeconds: 300
    }
  };

  // 1st dispatch should succeed
  const res1 = createMockRes();
  await sendSmsHandler(reqPayload, res1);
  assert.strictEqual(res1.statusCode, 200);
  assert.strictEqual(res1.body.success, true);
  assert.ok(res1.body.status === 'SIMULATED_DISPATCH' || res1.body.status === 'DISPATCHED_LIVE');

  // Immediate 2nd dispatch for same patient and trigger should enter COOLDOWN_ACTIVE
  const res2 = createMockRes();
  await sendSmsHandler(reqPayload, res2);
  assert.strictEqual(res2.statusCode, 200);
  assert.strictEqual(res2.body.status, 'COOLDOWN_ACTIVE');
  assert.ok(res2.body.cooldownRemainingSeconds > 0);
  assert.ok(res2.body.message.includes('Alert suppressed to prevent caregiver SMS fatigue'));

  // 3rd dispatch with bypassCooldown: true should successfully dispatch
  const bypassPayload = {
    method: 'POST',
    body: {
      ...reqPayload.body,
      bypassCooldown: true
    }
  };
  const res3 = createMockRes();
  await sendSmsHandler(bypassPayload, res3);
  assert.strictEqual(res3.statusCode, 200);
  assert.ok(res3.body.status === 'SIMULATED_DISPATCH' || res3.body.status === 'DISPATCHED_LIVE');
});

// ---------------------------------------------------------
// 12. SSRF Protection & Hardware API Security Tests
// ---------------------------------------------------------
runTest('SSRF Defense: isSafeUrl strictly rejects cloud instance metadata service (169.254.169.254)', () => {
  const test1 = isSafeUrl('http://169.254.169.254/latest/meta-data/');
  assert.strictEqual(test1.safe, false);
  assert.ok(test1.reason.includes('metadata service is strictly prohibited'));

  const test2 = isSafeUrl('http://169.254.0.1/sensitive');
  assert.strictEqual(test2.safe, false);

  const test3 = isSafeUrl('https://metadata.google.internal/computeMetadata/v1/');
  assert.strictEqual(test3.safe, false);
  assert.ok(test3.reason.includes('internal cloud metadata domain'));
});

runTest('SSRF Defense: isSafeUrl rejects forbidden non-HTTP protocols', () => {
  const ftp = isSafeUrl('ftp://192.168.1.100/data');
  assert.strictEqual(ftp.safe, false);
  assert.ok(ftp.reason.includes('Only HTTP and HTTPS are permitted'));

  const file = isSafeUrl('file:///etc/passwd');
  assert.strictEqual(file.safe, false);

  const gopher = isSafeUrl('gopher://evil.com');
  assert.strictEqual(gopher.safe, false);
});

runTest('SSRF Defense: isSafeUrl approves valid HTTP/HTTPS endpoints', () => {
  const localGw = isSafeUrl('http://192.168.1.120:8080/api/vitals');
  assert.strictEqual(localGw.safe, true);

  const secureGateway = isSafeUrl('https://iot-gateway.gp-gaya.edu/telemetry');
  assert.strictEqual(secureGateway.safe, true);
});

await runAsyncTest('Hardware Connect API: Actively blocks metadata SSRF attempts via HTTP endpoint', async () => {
  const req = {
    method: 'POST',
    body: {
      deviceId: 'ESP32-SSRF-ATTACK',
      apiKey: 'test-key-123',
      apiBaseUrl: 'http://169.254.169.254/latest/meta-data/'
    }
  };
  const res = createMockRes();
  await connectHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('Insecure Hardware API URL rejected'));
});

// ---------------------------------------------------------
// 13. Dynamic Custom Metrics & Sensor Extensibility Tests
// ---------------------------------------------------------
await runAsyncTest('Ingestion API: Captures dynamic unmapped sensor metrics into customMetrics', async () => {
  const req = {
    method: 'POST',
    body: {
      deviceId: 'ESP32-EXTENSIBLE-TEST',
      patientId: 'PATIENT-001',
      heartRate: 76,
      galvanicSkinResponse: 420,
      ambientHumidity: 65,
      airQualityPpm: 18,
      extendedParameters: {
        skinTempArm: 35.4
      }
    }
  };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.telemetry.customMetrics != null);
  assert.strictEqual(res.body.telemetry.customMetrics.galvanicSkinResponse.value, 420);
  assert.strictEqual(res.body.telemetry.customMetrics.ambientHumidity.value, 65);
  assert.strictEqual(res.body.telemetry.customMetrics.airQualityPpm.value, 18);
  assert.strictEqual(res.body.telemetry.customMetrics.skinTempArm, 35.4);
});

await runAsyncTest('Ingestion API: Automatically executes clinical zone evaluation and records SMS audit', async () => {
  const req = {
    method: 'POST',
    body: {
      deviceId: 'ESP32-ZONE-INGEST-CRITICAL',
      patientId: 'PATIENT-001',
      patientName: 'Jane Doe',
      heartRate: 145,
      spo2: 88,
      patientPhone: '+919999900000'
    }
  };
  const res = createMockRes();
  await ingestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.zone, 'RED');
  assert.strictEqual(res.body.requiresSms, true);
  assert.strictEqual(res.body.emergencyDetected, true);
  assert.ok(res.body.smsDispatch != null);
  assert.strictEqual(res.body.smsDispatch.zone, 'RED');
});

// ---------------------------------------------------------
// 14. Client-Side Zone Engine Consistency Tests
// ---------------------------------------------------------
runTest('Client Zone Engine: Mirrors backend clinical boundaries accurately', () => {
  // Green
  const green = zoneEngine.evaluate({ heartRate: 72, spo2: 98, temperature: 36.8 });
  assert.strictEqual(green.overallZone, CLINICAL_ZONES.GREEN);
  assert.strictEqual(green.isNormal, true);
  assert.strictEqual(green.requiresSms, false);

  // Yellow
  const yellow = zoneEngine.evaluate({ heartRate: 112, spo2: 97 });
  assert.strictEqual(yellow.overallZone, CLINICAL_ZONES.YELLOW);
  assert.strictEqual(yellow.isWarning, true);
  assert.strictEqual(yellow.requiresSms, true);

  // Red vitals
  const redVitals = zoneEngine.evaluate({ heartRate: 46, spo2: 96 });
  assert.strictEqual(redVitals.overallZone, CLINICAL_ZONES.RED);
  assert.strictEqual(redVitals.isEmergency, true);

  // Red Fall
  const redFall = zoneEngine.evaluate({ fallDetected: true });
  assert.strictEqual(redFall.overallZone, CLINICAL_ZONES.RED);

  // Red SOS
  const redSos = zoneEngine.evaluate({ sosPressed: true });
  assert.strictEqual(redSos.overallZone, CLINICAL_ZONES.RED);
});

// ---------------------------------------------------------
// 15. Dashboard Cards Modernization & Dual-Card Layout Tests
// ---------------------------------------------------------
runTest('Dashboard HTML: Keeps exclusively Heart Rate and Body Temperature cards in vital-cards-grid', () => {
  const dashboardHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/dashboard.html'), 'utf-8');
  
  // Must contain Heart Rate and Body Temp
  assert.ok(dashboardHtml.includes('id="card-heart-rate"'), 'Must contain card-heart-rate');
  assert.ok(dashboardHtml.includes('id="val-heart-rate"'), 'Must contain val-heart-rate');
  assert.ok(dashboardHtml.includes('id="badge-heart-rate"'), 'Must contain badge-heart-rate');
  assert.ok(dashboardHtml.includes('id="card-temp"'), 'Must contain card-temp');
  assert.ok(dashboardHtml.includes('id="val-temp"'), 'Must contain val-temp');
  assert.ok(dashboardHtml.includes('id="badge-temp"'), 'Must contain badge-temp');
  assert.ok(dashboardHtml.includes('id="btn-unit-celsius"'), 'Must contain btn-unit-celsius');
  assert.ok(dashboardHtml.includes('id="btn-unit-fahrenheit"'), 'Must contain btn-unit-fahrenheit');
  assert.ok(dashboardHtml.includes('dual-cards-layout'), 'Must use dual-cards-layout');

  // Must NOT contain removed cards
  assert.ok(!dashboardHtml.includes('id="card-bp"'), 'Must not contain card-bp');
  assert.ok(!dashboardHtml.includes('id="card-spo2"'), 'Must not contain card-spo2');
  assert.ok(!dashboardHtml.includes('id="card-rr"'), 'Must not contain card-rr');
  assert.ok(!dashboardHtml.includes('id="card-glucose"'), 'Must not contain card-glucose');
  assert.ok(!dashboardHtml.includes('id="card-ecg"'), 'Must not contain card-ecg');
  assert.ok(!dashboardHtml.includes('id="card-activity"'), 'Must not contain card-activity');
  assert.ok(!dashboardHtml.includes('id="card-sleep"'), 'Must not contain card-sleep');
  assert.ok(!dashboardHtml.includes('id="card-fall"'), 'Must not contain card-fall');
});

runTest('Dashboard CSS: Implements responsive dual-cards-layout grid with mobile stacking', () => {
  const componentsCss = fs.readFileSync(path.resolve(process.cwd(), 'web/css/components.css'), 'utf-8');
  assert.ok(componentsCss.includes('.vital-cards-grid.dual-cards-layout'), 'components.css must define dual-cards-layout');
  assert.ok(componentsCss.includes('repeat(2,'), 'dual-cards-layout must use 2-column repeat');
  assert.ok(componentsCss.includes('@media (max-width: 680px)'), 'dual-cards-layout must have responsive mobile media query');
});

await runAsyncTest('Dashboard Controller: renderTelemetryData updates HR and Temp with zero JS errors', async () => {
  const dom = {
    'val-heart-rate': { textContent: '' },
    'badge-heart-rate': { textContent: '', className: '' },
    'card-heart-rate': { className: '', classList: { remove: () => {} } },
    'val-temp': { textContent: '' },
    'badge-temp': { textContent: '', className: '' },
    'card-temp': { className: '', classList: { remove: () => {} } },
    'unit-temp-display': { textContent: '' },
    'temp-range-label': { textContent: '' },
    'last-update-time': { textContent: '' },
    'patient-data-source-badge': { style: {}, className: '', textContent: '' },
    'overall-status-text': { textContent: '', style: {} },
    'status-description': { textContent: '' },
    'zone-badge-indicator': { textContent: '', className: '' },
    'zone-triggers-summary': { style: {}, textContent: '' },
    'zone-action-recommendation': { style: {}, textContent: '' },
    'zone-sms-audit-bar': { style: {} },
    'telemetry-hero-card': { className: '' },
    'fall-hero-status': { textContent: '', style: {} }
  };

  globalThis.window = { addEventListener: () => {} };
  globalThis.document = { 
    addEventListener: () => {}, 
    getElementById: (id) => dom[id] || null 
  };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };

  const { renderTelemetryData } = await import('../web/js/pages/dashboard.js');

  // 1. Nominal Green update
  renderTelemetryData({ heartRate: 72, temperature: 36.8 });
  assert.strictEqual(dom['val-heart-rate'].textContent, 72);
  assert.strictEqual(dom['val-temp'].textContent, '36.8');
  assert.ok(dom['card-heart-rate'].className.includes('card-zone-green'));
  assert.ok(dom['card-temp'].className.includes('card-zone-green'));

  // 2. Elevated Yellow update
  renderTelemetryData({ heartRate: 110, temperature: 37.8 });
  assert.strictEqual(dom['val-heart-rate'].textContent, 110);
  assert.ok(dom['badge-heart-rate'].textContent.includes('TACHYCARDIA'));
  assert.strictEqual(dom['val-temp'].textContent, '37.8');
  assert.ok(dom['badge-temp'].textContent.includes('FEVER'));
  assert.ok(dom['card-heart-rate'].className.includes('card-zone-yellow'));
  assert.ok(dom['card-temp'].className.includes('card-zone-yellow'));
});

// ---------------------------------------------------------
// 16. Health Notification & Parent/Emergency Calling System Tests
// ---------------------------------------------------------
runTest('Settings HTML: Eliminates hardcoded personal phone numbers and provides validated contact managers & privacy toggles', () => {
  const settingsHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/settings.html'), 'utf-8');

  // Hardcoded personal phone numbers must NOT exist in value attributes
  assert.ok(!settingsHtml.includes('value="+91 99887 76655"'), 'Patient personal phone must not be hardcoded in value attribute');
  assert.ok(!settingsHtml.includes('value="+91 98765 43210"'), 'Caregiver phone must not be hardcoded in value attribute');
  assert.ok(!settingsHtml.includes('value="+91 91234 56789"'), 'Secondary phone must not be hardcoded in value attribute');

  // Parent / Guardian & Emergency contact fields and remove buttons must exist
  assert.ok(settingsHtml.includes('id="contact-parent-name"'), 'Must have contact-parent-name input');
  assert.ok(settingsHtml.includes('id="contact-parent-phone"'), 'Must have contact-parent-phone input');
  assert.ok(settingsHtml.includes('id="btn-remove-parent-contact"'), 'Must have btn-remove-parent-contact button');

  assert.ok(settingsHtml.includes('id="contact-emergency-name"'), 'Must have contact-emergency-name input');
  assert.ok(settingsHtml.includes('id="contact-emergency-phone"'), 'Must have contact-emergency-phone input');
  assert.ok(settingsHtml.includes('id="btn-remove-emergency-contact"'), 'Must have btn-remove-emergency-contact button');

  assert.ok(settingsHtml.includes('id="btn-clear-patient-phone"'), 'Must have btn-clear-patient-phone button');

  // Privacy and location consent toggles
  assert.ok(settingsHtml.includes('id="toggle-location-consent"'), 'Must have toggle-location-consent checkbox');
  assert.ok(settingsHtml.includes('id="toggle-phone-masking"'), 'Must have toggle-phone-masking checkbox');
});

runTest('Phone Number Validation: Correctly validates standard 7-15 digit formats and rejects invalid numbers', () => {
  const isValidPhone = (phone) => {
    if (!phone) return false;
    const clean = phone.replace(/[\s\-\(\)\.]/g, '');
    return /^\+?[1-9]\d{6,14}$/.test(clean);
  };

  assert.strictEqual(isValidPhone('+919876543210'), true);
  assert.strictEqual(isValidPhone('+1 415 555 2671'), true);
  assert.strictEqual(isValidPhone('9876543210'), true);
  assert.strictEqual(isValidPhone('+44 20 7946 0991'), true);

  // Invalid numbers
  assert.strictEqual(isValidPhone(''), false);
  assert.strictEqual(isValidPhone('12345'), false); // less than 7 digits
  assert.strictEqual(isValidPhone('abcdefgh'), false);
  assert.strictEqual(isValidPhone('+0123456789'), false); // starts with 0 after +
});

await runAsyncTest('Database Service: Manages contacts, location consent, masking, and logs audit entries', async () => {
  // In-memory mock storage
  const mockStorage = new Map();
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k)
  };

  const { dbService } = await import('../web/js/services/db-service.js');

  // 1. Parent Guardian contact
  dbService.saveParentGuardianContact({
    name: 'Martha Wayne',
    phone: '+1 555 019 4432',
    relation: 'Mother'
  });
  const savedParent = dbService.getParentGuardianContact();
  assert.strictEqual(savedParent.name, 'Martha Wayne');
  assert.strictEqual(savedParent.phone, '+1 555 019 4432');

  // 2. Emergency contact
  dbService.saveEmergencyContact({
    name: 'Alfred Pennyworth',
    phone: '+1 555 019 8899',
    relation: 'Emergency Guardian'
  });
  const savedEmg = dbService.getEmergencyContact();
  assert.strictEqual(savedEmg.name, 'Alfred Pennyworth');
  assert.strictEqual(savedEmg.phone, '+1 555 019 8899');

  // 3. Phone masking
  assert.strictEqual(dbService.maskPhoneNumber('+1 555 019 4432'), '+1 5 •••••••• 432');
  assert.strictEqual(dbService.maskPhoneNumber('+91 98765 43210'), '+91  •••••••• 210');

  // 4. Location sharing consent
  assert.strictEqual(dbService.getLocationSharingConsent('PATIENT-001'), true);
  dbService.setLocationSharingConsent('PATIENT-001', false);
  assert.strictEqual(dbService.getLocationSharingConsent('PATIENT-001'), false);

  // 5. Notification logging
  const notif = await dbService.recordNotificationLog('PATIENT-001', {
    zone: 'YELLOW',
    reason: 'Mild Tachycardia',
    vitals: { heartRate: 112, temperature: 37.1 },
    status: 'DELIVERED',
    dataSource: 'REAL',
    locationIncluded: false
  });
  assert.ok(notif.id.startsWith('NOTIF-'));
  const logs = dbService.getNotificationLogs('PATIENT-001');
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].reason, 'Mild Tachycardia');

  // 6. Call action audit
  const callAction = await dbService.recordCallAction('PATIENT-001', {
    target: 'PARENT_GUARDIAN',
    name: 'Martha Wayne',
    phone: '+1 555 019 4432',
    relation: 'Mother',
    confirmed: true,
    status: 'DIALER_LAUNCHED'
  });
  assert.ok(callAction.id.startsWith('CALL-'));
  const callLogs = dbService.getCallActions('PATIENT-001');
  assert.strictEqual(callLogs.length, 1);
  assert.strictEqual(callLogs[0].status, 'DIALER_LAUNCHED');

  // 7. Remove contacts
  dbService.removeParentGuardianContact();
  assert.strictEqual(dbService.getParentGuardianContact(), null);
  dbService.removeEmergencyContact();
  assert.strictEqual(dbService.getEmergencyContact(), null);
});

await runAsyncTest('SMS Dispatcher API: Formats Yellow and Red notifications with HR, Temp, Source, and Location privacy', async () => {
  // Test Yellow Zone
  const reqYellow = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-FORMAT-01',
      patientName: 'John Doe',
      zone: 'YELLOW',
      triggers: [{ parameter: 'heartRate', zone: 'YELLOW', label: 'Tachycardia', value: '110 BPM' }],
      vitals: { heartRate: 110, temperature: 37.4 },
      contacts: [{ name: 'Sarah Doe', phone: '+15551234567', role: 'PARENT_GUARDIAN' }],
      dataSource: 'REAL',
      location: { latitude: 24.7955, longitude: 84.9995 },
      locationSharingConsent: true,
      bypassCooldown: true
    }
  };
  const resYellow = createMockRes();
  await sendSmsHandler(reqYellow, resYellow);
  assert.strictEqual(resYellow.statusCode, 200);
  assert.strictEqual(resYellow.body.zone, 'YELLOW');
  assert.ok(resYellow.body.smsBody.includes('Heart Rate: 110 BPM'));
  assert.ok(resYellow.body.smsBody.includes('Body Temp: 37.4°C'));
  assert.ok(resYellow.body.smsBody.includes('Device Source: REAL'));
  assert.ok(resYellow.body.smsBody.includes('maps.google.com/?q=24.7955,84.9995'));

  // Test Yellow Zone with Location Privacy Consent Disabled
  const reqYellowPrivate = {
    method: 'POST',
    body: {
      ...reqYellow.body,
      locationSharingConsent: false,
      bypassCooldown: true
    }
  };
  const resYellowPrivate = createMockRes();
  await sendSmsHandler(reqYellowPrivate, resYellowPrivate);
  assert.strictEqual(resYellowPrivate.statusCode, 200);
  assert.ok(resYellowPrivate.body.smsBody.includes('Location: Disabled by user privacy consent'));
  assert.ok(!resYellowPrivate.body.smsBody.includes('maps.google.com'));

  // Test Red Zone
  const reqRed = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-FORMAT-02',
      patientName: 'Jane Smith',
      zone: 'RED',
      triggers: [{ parameter: 'heartRate', zone: 'RED', label: 'Extreme Tachycardia', value: '135 BPM' }],
      vitals: { heartRate: 135, temperature: 38.6 },
      contacts: [{ name: 'Emergency Doc', phone: '+15559876543', role: 'EMERGENCY_CONTACT' }],
      dataSource: 'DEMO',
      location: { latitude: 24.7955, longitude: 84.9995 },
      locationSharingConsent: true,
      bypassCooldown: true
    }
  };
  const resRed = createMockRes();
  await sendSmsHandler(reqRed, resRed);
  assert.strictEqual(resRed.statusCode, 200);
  assert.strictEqual(resRed.body.zone, 'RED');
  assert.ok(resRed.body.smsBody.includes('[SIMULATED DEMO NOTIFICATION]'));
  assert.ok(resRed.body.smsBody.includes('HR: 135 BPM'));
  assert.ok(resRed.body.smsBody.includes('Temp: 38.6°C'));
  assert.ok(resRed.body.smsBody.includes('Device Source: DEMO'));
  assert.ok(resRed.body.smsBody.includes('maps.google.com/?q=24.7955,84.9995'));

  // Test Green Zone (Normal Status - Suppressed)
  const reqGreen = {
    method: 'POST',
    body: {
      patientId: 'PATIENT-FORMAT-03',
      zone: 'GREEN',
      vitals: { heartRate: 72, temperature: 36.8 }
    }
  };
  const resGreen = createMockRes();
  await sendSmsHandler(reqGreen, resGreen);
  assert.strictEqual(resGreen.statusCode, 200);
  assert.strictEqual(resGreen.body.status, 'NORMAL_STATUS');
  assert.ok(resGreen.body.message.includes('Green Zone (Normal)'));
});

runTest('Emergency & Dashboard Pages: Call buttons and Notification log tables integrated cleanly', () => {
  const emgHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/emergency.html'), 'utf-8');
  assert.ok(emgHtml.includes('id="btn-call-parent"'), 'emergency.html must have btn-call-parent');
  assert.ok(emgHtml.includes('id="btn-call-emergency"'), 'emergency.html must have btn-call-emergency');
  assert.ok(emgHtml.includes('id="notif-history-tbody"'), 'emergency.html must have notif-history-tbody');

  const dashHtml = fs.readFileSync(path.resolve(process.cwd(), 'web/dashboard.html'), 'utf-8');
  assert.ok(dashHtml.includes('id="dash-btn-call-parent"'), 'dashboard.html must have dash-btn-call-parent');
  assert.ok(dashHtml.includes('id="dash-btn-call-emergency"'), 'dashboard.html must have dash-btn-call-emergency');

  // Verify dashboard preserves dual-card layout (only HR and Temp)
  assert.ok(dashHtml.includes('id="card-heart-rate"'));
  assert.ok(dashHtml.includes('id="card-temp"'));
  assert.ok(!dashHtml.includes('id="card-spo2"'));
  assert.ok(!dashHtml.includes('id="card-bp"'));
});

// ---------------------------------------------------------
// 17. Complete Health Telemetry & Ingestion API Integration Tests
// ---------------------------------------------------------
await runAsyncTest('Health Check API: GET /api/health reports backend and storage status', async () => {
  const req = { method: 'GET', headers: {} };
  const res = createMockRes();
  await healthHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, 'OK');
  assert.strictEqual(res.body.database.type, 'Persistent File-Backed JSON Store & Firebase RTDB Sync');
  assert.strictEqual(res.body.database.status, 'HEALTHY');
  assert.ok(typeof res.body.uptimeSeconds === 'number');
  assert.ok(res.body.endpoints.health);
  assert.ok(res.body.endpoints.latestReadings);
  assert.ok(res.body.endpoints.historyReadings);
  assert.ok(res.body.endpoints.deviceIngest);
  assert.ok(res.body.endpoints.deviceStatus);
});

await runAsyncTest('Ingestion API: POST /api/ingest requires device authentication', async () => {
  // Test missing auth header
  const reqNoAuth = {
    method: 'POST',
    headers: {},
    body: { deviceId: 'ESP32-AUTH-TEST', heartRate: 72 }
  };
  const resNoAuth = createMockRes();
  await rootIngestHandler(reqNoAuth, resNoAuth);
  assert.strictEqual(resNoAuth.statusCode, 401);
  assert.strictEqual(resNoAuth.body.success, false);
  assert.ok(resNoAuth.body.error.includes('Unauthorized'));

  // Test invalid auth key
  const reqBadAuth = {
    method: 'POST',
    headers: { 'x-api-key': 'INVALID_HARDWARE_KEY_12345' },
    body: { deviceId: 'ESP32-AUTH-TEST', heartRate: 72 }
  };
  const resBadAuth = createMockRes();
  await rootIngestHandler(reqBadAuth, resBadAuth);
  assert.strictEqual(resBadAuth.statusCode, 401);
});

await runAsyncTest('Ingestion API: POST /api/ingest validates biometric physiological bounds and timestamps', async () => {
  // Validation: Missing deviceId
  const missingDev = validateIngestionData({ heartRate: 75 });
  assert.strictEqual(missingDev.isValid, false);
  assert.ok(missingDev.errors.some(e => e.includes('deviceId')));

  // Validation: Heart Rate out of realistic bounds (<20 or >300)
  const lowHr = validateIngestionData({ deviceId: 'ESP32-BOUNDS', heartRate: 15 });
  assert.strictEqual(lowHr.isValid, false);
  assert.ok(lowHr.errors.some(e => e.includes('Heart Rate reading out of realistic bounds')));

  const highHr = validateIngestionData({ deviceId: 'ESP32-BOUNDS', heartRate: 350 });
  assert.strictEqual(highHr.isValid, false);
  assert.ok(highHr.errors.some(e => e.includes('Heart Rate reading out of realistic bounds')));

  // Validation: Body Temperature out of realistic bounds (<25 or >45°C)
  const lowTemp = validateIngestionData({ deviceId: 'ESP32-BOUNDS', temperature: 22.0 });
  assert.strictEqual(lowTemp.isValid, false);
  assert.ok(lowTemp.errors.some(e => e.includes('Body Temperature out of realistic bounds')));

  const highTemp = validateIngestionData({ deviceId: 'ESP32-BOUNDS', temperature: 48.0 });
  assert.strictEqual(highTemp.isValid, false);
  assert.ok(highTemp.errors.some(e => e.includes('Body Temperature out of realistic bounds')));

  // Validation: Invalid timestamp (NaN or > 24 hours into future)
  const badTs = validateIngestionData({ deviceId: 'ESP32-BOUNDS', heartRate: 75, timestamp: 'NOT_A_TIMESTAMP' });
  assert.strictEqual(badTs.isValid, false);

  const futureTs = validateIngestionData({ deviceId: 'ESP32-BOUNDS', heartRate: 75, timestamp: Date.now() + 48 * 60 * 60 * 1000 });
  assert.strictEqual(futureTs.isValid, false);
  assert.ok(futureTs.errors.some(e => e.includes('future beyond 24 hours')));
});

await runAsyncTest('Ingestion API: Ingests REAL hardware data and persistently stores in database', async () => {
  const devId = 'ESP32-ALPHA-REAL-01';
  const req = {
    method: 'POST',
    headers: { 'x-api-key': DEFAULT_DEV_API_KEY },
    body: {
      deviceId: devId,
      patientId: 'PATIENT-API-TEST-001',
      patientName: '[TEST] Alice Green',
      isTestFixture: true,
      testTag: 'AUTOMATED_TEST_FIXTURE',
      heartRate: 78,
      temperature: 36.8,
      isDemo: false,
      suppressSms: true,
      timestamp: Date.now(),
      batteryLevel: '94%',
      wifiRssi: -52
    }
  };
  const res = createMockRes();
  await rootIngestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.source, 'REAL');
  assert.strictEqual(res.body.isDemo, false);
  assert.strictEqual(res.body.telemetry.isTestFixture, true);
  assert.strictEqual(res.body.telemetry.testTag, 'AUTOMATED_TEST_FIXTURE');
  assert.strictEqual(res.body.heartRate.value, 78);
  assert.strictEqual(res.body.temperature.celsius, 36.8);

  // Check persistent storage file exists and contains the ingested reading
  const diskFilePath = path.resolve(process.cwd(), 'data/readings.json');
  assert.ok(fs.existsSync(diskFilePath), 'data/readings.json file must exist');
  const fileContent = JSON.parse(fs.readFileSync(diskFilePath, 'utf-8'));
  const foundInFile = (fileContent.readingsHistory && fileContent.readingsHistory.some(r => r.deviceId === devId && r.heartRate?.value === 78))
    || (fileContent.telemetryLatest && fileContent.telemetryLatest[devId]?.heartRate?.value === 78);
  assert.ok(foundInFile, 'Real hardware reading must be persistently committed to data/readings.json');
});

await runAsyncTest('Ingestion API: Distinguishes DEMO data source tag accurately', async () => {
  const devId = 'ESP32-ALPHA-DEMO-01';
  const req = {
    method: 'POST',
    headers: { 'authorization': `Bearer ${DEFAULT_DEV_API_KEY}` },
    body: {
      deviceId: devId,
      patientId: 'PATIENT-DEMO-TEST-001',
      isTestFixture: true,
      testTag: 'AUTOMATED_TEST_FIXTURE',
      heartRate: 85,
      temperature: 37.1,
      isDemo: true,
      suppressSms: true,
      timestamp: Date.now()
    }
  };
  const res = createMockRes();
  await rootIngestHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.source, 'DEMO');
  assert.strictEqual(res.body.isDemo, true);
  assert.strictEqual(res.body.telemetry.isTestFixture, true);
});

await runAsyncTest('Latest Readings API: GET /api/readings/latest returns latest Heart Rate and Body Temperature', async () => {
  const devId = 'ESP32-ALPHA-REAL-01';
  const req = {
    method: 'GET',
    headers: {},
    query: { deviceId: devId }
  };
  const res = createMockRes();
  await latestReadingsHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, 'OK');
  assert.strictEqual(res.body.deviceId, devId);
  assert.strictEqual(res.body.source, 'REAL');
  assert.ok(res.body.heartRate);
  assert.strictEqual(res.body.heartRate.value, 78);
  assert.strictEqual(res.body.heartRate.unit, 'BPM');
  assert.ok(res.body.temperature);
  assert.strictEqual(res.body.temperature.celsius, 36.8);
  assert.strictEqual(res.body.temperature.unit, '°C');
});

await runAsyncTest('Historical Readings API: GET /api/readings/history filters records and validates queries', async () => {
  // Test invalid startDate format
  const reqBadDate = {
    method: 'GET',
    headers: {},
    query: { startDate: 'INVALID_DATE' }
  };
  const resBadDate = createMockRes();
  await historyReadingsHandler(reqBadDate, resBadDate);
  assert.strictEqual(resBadDate.statusCode, 400);
  assert.strictEqual(resBadDate.body.success, false);

  // Test valid query with range
  const reqHistory = {
    method: 'GET',
    headers: {},
    query: { deviceId: 'ESP32-ALPHA-REAL-01', range: 'daily', limit: '10' }
  };
  const resHistory = createMockRes();
  await historyReadingsHandler(reqHistory, resHistory);
  assert.strictEqual(resHistory.statusCode, 200);
  assert.strictEqual(resHistory.body.success, true);
  assert.ok(Array.isArray(resHistory.body.readings));
  assert.ok(resHistory.body.count >= 1);
  assert.strictEqual(resHistory.body.range, 'daily');
});

await runAsyncTest('Device Status API: GET /api/device/status reports connection and telemetry metadata', async () => {
  const devId = 'ESP32-ALPHA-REAL-01';
  const req = {
    method: 'GET',
    headers: {},
    query: { deviceId: devId }
  };
  const res = createMockRes();
  await deviceStatusHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.deviceId, devId);
  assert.strictEqual(res.body.connected, true);
  assert.strictEqual(res.body.status, 'ONLINE');
  assert.ok(res.body.lastDataTime);
  assert.strictEqual(res.body.batteryLevel, '94%');
  assert.strictEqual(res.body.wifiRssi, -52);
  assert.strictEqual(res.body.dataSource, 'REAL');
});

// ---------------------------------------------------------
// 18. MongoDB Atlas Primary Database & Safe Migration Tests
// ---------------------------------------------------------
runTest('MongoDB Atlas: Client initializes with safe UNCONFIGURED status when MONGODB_URI is absent', () => {
  const status = mongoClient.getStatus();
  assert.strictEqual(typeof status.configured, 'boolean');
  assert.ok(['UNCONFIGURED', 'CONNECTED', 'DISCONNECTED', 'ERROR'].includes(status.status));
});

await runAsyncTest('MongoDB Atlas: Rejects inserts cleanly with descriptive error when unconfigured', async () => {
  const origUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  await mongoClient.disconnect();

  try {
    let threw = false;
    try {
      await mongoClient.insertReading({ deviceId: 'TEST-DEV', heartRate: 75 });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('MongoDB Atlas is not configured'));
    }
    assert.strictEqual(threw, true, 'insertReading must reject when MONGODB_URI is absent');
  } finally {
    if (origUri) process.env.MONGODB_URI = origUri;
  }
});

await runAsyncTest('MongoDB Atlas: Catches cluster connection timeouts without unhandled exceptions', async () => {
  const origUri = process.env.MONGODB_URI;
  // Point to a non-existent port with small timeout
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27099/test_db?serverSelectionTimeoutMS=200';
  await mongoClient.disconnect();

  let threw = false;
  try {
    await mongoClient.connect();
  } catch (err) {
    threw = true;
    assert.ok(err.message);
  }
  assert.strictEqual(threw, true);
  assert.strictEqual(mongoClient.getStatus().status, MONGO_STATUS.ERROR);
  assert.ok(mongoClient.getStatus().lastError);

  // Restore
  await mongoClient.disconnect();
  if (origUri) {
    process.env.MONGODB_URI = origUri;
  } else {
    delete process.env.MONGODB_URI;
  }
});

runTest('MongoDB Atlas: Never exposes MONGODB_URI or credentials in frontend code', () => {
  const webDir = path.resolve(process.cwd(), 'web');
  const files = [];
  function collectFiles(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) collectFiles(full);
      else if (f.endsWith('.js') || f.endsWith('.html')) files.push(full);
    }
  }
  collectFiles(webDir);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8');
    assert.ok(!text.includes('MONGODB_URI'), `MONGODB_URI must not appear in frontend file: ${path.basename(file)}`);
    assert.ok(!text.includes('mongodb+srv://'), `MongoDB connection string must not appear in frontend file: ${path.basename(file)}`);
  }
});

await runAsyncTest('Health API: Reports MongoDB Atlas as primary database and reflects configuration state', async () => {
  const req = { method: 'GET', headers: {} };
  const res = createMockRes();
  await healthHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.database.primaryDatabase, 'MongoDB Atlas');
  assert.ok(res.body.database.mongoAtlas);
  assert.strictEqual(typeof res.body.database.mongoAtlas.configured, 'boolean');
});

runTest('Safe Migration Service: Inspects local data without modifying data/readings.json', () => {
  const inspection = migrationService.inspectLocalData();
  assert.strictEqual(inspection.exists, true);
  assert.ok(inspection.totalReadings >= 40);
  assert.ok(inspection.composition.realHardware >= 1);
  assert.ok(typeof inspection.composition.demoSimulated === 'number');
  assert.ok(typeof inspection.composition.testFixtures === 'number');

  // Verify file has not been altered or deleted
  const diskPath = path.resolve(process.cwd(), 'data/readings.json');
  assert.ok(fs.existsSync(diskPath));
});

await runAsyncTest('Safe Migration Service: Dry run completes safely with zero database writes', async () => {
  const plan = await migrationService.planOrMigrate({ dryRun: true });
  assert.strictEqual(plan.success, true);
  assert.strictEqual(plan.dryRun, true);
  assert.ok(plan.totalLocalReadings >= 40);
  assert.ok(plan.message.includes('Dry run completed'));
});

// ---------------------------------------------------------
// Final Summary
// ---------------------------------------------------------
console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
}


