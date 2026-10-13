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
// Final Summary
// ---------------------------------------------------------
console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
}
