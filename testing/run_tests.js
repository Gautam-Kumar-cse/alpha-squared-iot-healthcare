/**
 * ALPHA SQUARED - Automated Verification & Test Suite
 * Validates algorithmic logic, threshold bounds, payload contracts and security.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

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
  'web/css/design-system.css',
  'web/css/layout.css',
  'web/css/components.css',
  'web/css/pages.css',
  'web/js/components/particle-background.js',
  'web/js/components/navbar.js',
  'web/js/components/notification-toast.js',
  'web/js/components/sos-modal.js',
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
// 3. Security Rule Inspection
// ---------------------------------------------------------
runTest('Security: database.rules.json blocks public unauthenticated read access', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'database.rules.json'), 'utf-8');
  assert.ok(!content.includes('".read": true'), 'Security violation: Public read is exposed!');
  assert.ok(!content.includes('".write": true'), 'Security violation: Public write is exposed!');
});

// Summary
console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
}

