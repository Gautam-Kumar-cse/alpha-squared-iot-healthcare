/**
 * ALPHA SQUARED - Hackathon Demo & Simulation Engine
 * Completely isolated from real hardware telemetry.
 * Explicitly marks payloads with `isDemo: true` to prevent fraudulent sensor data.
 */

import { dbService } from './db-service.js';
import { emergencyDetector } from './emergency-service.js';

export const DEMO_SCENARIOS = {
  NORMAL: {
    name: 'Normal Vitals',
    heartRate: 74,
    spo2: 98,
    temperature: 36.6,
    fallDetected: false,
    sosPressed: false,
    description: 'Patient resting in bed. All biometrics optimal.'
  },
  WARNING: {
    name: 'Warning / Elevated State',
    heartRate: 110,
    spo2: 93,
    temperature: 37.9,
    fallDetected: false,
    sosPressed: false,
    description: 'Mild pyrexia with elevated pulse rate and low SpO2.'
  },
  CRITICAL: {
    name: 'Critical Vital Emergency',
    heartRate: 138,
    spo2: 87,
    temperature: 39.1,
    fallDetected: false,
    sosPressed: false,
    description: 'Severe hypoxia and dangerous fever requiring rapid intervention.'
  },
  FALL: {
    name: 'Sudden Fall Impact',
    heartRate: 122,
    spo2: 95,
    temperature: 36.7,
    fallDetected: true,
    sosPressed: false,
    description: 'Accelerometer vector spike detected. Timed escalation initiated.'
  },
  SOS: {
    name: 'Deliberate SOS Trigger',
    heartRate: 115,
    spo2: 96,
    temperature: 36.8,
    fallDetected: false,
    sosPressed: true,
    description: 'Patient pressed wearable distress button.'
  }
};

class DemoSimulator {
  constructor() {
    this.intervalId = null;
    this.currentScenario = 'NORMAL';
    this.tickCount = 0;
  }

  isDemoActive() {
    return localStorage.getItem('alphasquared_demo_mode') === 'true';
  }

  setDemoActive(active) {
    localStorage.setItem('alphasquared_demo_mode', String(active));
    if (active) {
      this.start();
    } else {
      this.stop();
    }
  }

  setScenario(scenarioKey) {
    if (DEMO_SCENARIOS[scenarioKey]) {
      this.currentScenario = scenarioKey;
      this.emitTick();
    }
  }

  start(patientId = 'PATIENT-001', intervalMs = 3000) {
    this.stop();
    this.emitTick(patientId);
    this.intervalId = setInterval(() => {
      this.emitTick(patientId);
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  emitTick(patientId = 'PATIENT-001') {
    this.tickCount++;
    const scenario = DEMO_SCENARIOS[this.currentScenario] || DEMO_SCENARIOS.NORMAL;

    // Add gentle organic variation
    const hrNoise = Math.round((Math.random() - 0.5) * 4);
    const spo2Noise = (Math.random() > 0.85) ? -1 : 0;
    const tempNoise = +(Math.sin(this.tickCount / 4) * 0.1).toFixed(1);

    const telemetry = {
      patientId,
      patientName: 'Jane Doe',
      deviceId: 'ESP32-ALPHA-01',
      heartRate: Math.max(30, scenario.heartRate + hrNoise),
      spo2: Math.min(100, Math.max(70, scenario.spo2 + spo2Noise)),
      temperature: +(scenario.temperature + tempNoise).toFixed(1),
      fallDetected: scenario.fallDetected,
      sosPressed: scenario.sosPressed,
      latitude: 24.7955 + (Math.sin(this.tickCount / 10) * 0.0003),
      longitude: 84.9995 + (Math.cos(this.tickCount / 10) * 0.0003),
      locationSource: 'SIMULATED GPS (DEMO)',
      timestamp: Date.now(),
      isDemo: true
    };

    // Run evaluation
    const evalResult = emergencyDetector.evaluateTelemetry(telemetry);
    telemetry.emergencyState = evalResult.state;
    telemetry.emergencyReason = evalResult.reason;
    telemetry.eventType = evalResult.eventType;

    // Update DB
    dbService.updateCurrentTelemetry(patientId, telemetry);

    // If emergency, record incident
    if (evalResult.state === 'EMERGENCY') {
      emergencyDetector.triggerEmergencyWorkflow(patientId, {
        eventType: evalResult.eventType,
        reason: evalResult.reason,
        vitalsAtEvent: {
          heartRate: telemetry.heartRate,
          spo2: telemetry.spo2,
          temperature: telemetry.temperature
        },
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        locationSource: telemetry.locationSource,
        timestamp: telemetry.timestamp,
        isDemo: true
      });
    }

    return telemetry;
  }
}

export const demoSimulator = new DemoSimulator();

