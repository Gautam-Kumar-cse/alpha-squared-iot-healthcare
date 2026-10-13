/**
 * ALPHA SQUARED - Hackathon Demo & Simulation Engine
 * Completely isolated from real hardware telemetry.
 * Explicitly marks payloads with `isDemo: true` to guarantee zero fake data conflation.
 * Supports Green (Normal), Yellow (Warning), and Red (Critical) clinical zone demonstrations.
 */

import { dbService } from './db-service.js';
import { emergencyDetector } from './emergency-service.js';
import { zoneEngine, CLINICAL_ZONES } from './zone-engine.js';

export const DEMO_SCENARIOS = {
  NORMAL: {
    name: 'Green Zone: Nominal Resting Vitals',
    zone: CLINICAL_ZONES.GREEN,
    heartRate: 74,
    spo2: 98,
    temperature: 36.8,
    bloodPressure: { systolic: 118, diastolic: 76, pulse: 74, status: 'NORMAL' },
    respiratoryRate: 16,
    bloodGlucose: 95,
    fallDetected: false,
    sosPressed: false,
    description: 'Patient resting in stable condition. All parameters within safe physiological bounds.'
  },
  GREEN: {
    name: 'Green Zone: Optimal Cardiac & Respiratory Stability',
    zone: CLINICAL_ZONES.GREEN,
    heartRate: 72,
    spo2: 99,
    temperature: 36.6,
    bloodPressure: { systolic: 115, diastolic: 75, pulse: 72, status: 'NORMAL' },
    respiratoryRate: 15,
    bloodGlucose: 90,
    fallDetected: false,
    sosPressed: false,
    description: 'All vitals optimal. Background monitoring continuous. No SMS dispatched.'
  },
  WARNING: {
    name: 'Yellow Zone: Caution Vitals (Mild Pyrexia & Tachycardia)',
    zone: CLINICAL_ZONES.YELLOW,
    heartRate: 112,
    spo2: 93,
    temperature: 37.9,
    bloodPressure: { systolic: 132, diastolic: 84, pulse: 112, status: 'ELEVATED' },
    respiratoryRate: 22,
    bloodGlucose: 155,
    fallDetected: false,
    sosPressed: false,
    description: 'Caution thresholds exceeded. Automatic precautionary SMS sent to patient & caregiver.'
  },
  YELLOW: {
    name: 'Yellow Zone: Caution Vitals (Pre-Hypertension & Borderline Hypoxia)',
    zone: CLINICAL_ZONES.YELLOW,
    heartRate: 108,
    spo2: 92,
    temperature: 37.8,
    bloodPressure: { systolic: 135, diastolic: 86, pulse: 108, status: 'ELEVATED' },
    respiratoryRate: 23,
    bloodGlucose: 160,
    fallDetected: false,
    sosPressed: false,
    description: 'Caution alert dispatched. Patient advised to rest and hydrate.'
  },
  CRITICAL: {
    name: 'Red Zone: Critical Emergency (Hypoxia & High Fever)',
    zone: CLINICAL_ZONES.RED,
    heartRate: 135,
    spo2: 87,
    temperature: 39.2,
    bloodPressure: { systolic: 155, diastolic: 98, pulse: 135, status: 'STAGE 2 HYPERTENSION' },
    respiratoryRate: 28,
    bloodGlucose: 215,
    fallDetected: false,
    sosPressed: false,
    description: 'Severe hypoxia and dangerous fever. Emergency siren & immediate caregiver SMS triggered.'
  },
  RED: {
    name: 'Red Zone: Critical Emergency (Severe Tachycardia & Hypertension)',
    zone: CLINICAL_ZONES.RED,
    heartRate: 138,
    spo2: 88,
    temperature: 38.9,
    bloodPressure: { systolic: 160, diastolic: 102, pulse: 138, status: 'STAGE 2 HYPERTENSION' },
    respiratoryRate: 29,
    bloodGlucose: 230,
    fallDetected: false,
    sosPressed: false,
    description: 'Critical vital failure. Urgent caregiver dispatch and Google Maps location transmitted.'
  },
  FALL: {
    name: 'Red Zone: Sudden Fall Impact (IMU Vector Trigger)',
    zone: CLINICAL_ZONES.RED,
    heartRate: 124,
    spo2: 95,
    temperature: 36.7,
    bloodPressure: { systolic: 128, diastolic: 82, pulse: 124, status: 'ELEVATED' },
    respiratoryRate: 20,
    bloodGlucose: 105,
    fallDetected: true,
    sosPressed: false,
    description: 'Autonomous IMU jerk impact detected. Red Zone emergency siren & SMS active.'
  },
  SOS: {
    name: 'Red Zone: Deliberate Hardware SOS Distress Pushbutton',
    zone: CLINICAL_ZONES.RED,
    heartRate: 118,
    spo2: 96,
    temperature: 36.8,
    bloodPressure: { systolic: 130, diastolic: 85, pulse: 118, status: 'ELEVATED' },
    respiratoryRate: 21,
    bloodGlucose: 110,
    fallDetected: false,
    sosPressed: true,
    description: 'Physical hardware distress button pressed. Priority emergency SMS dispatched.'
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

    // Organic micro-variation
    const hrNoise = Math.round((Math.random() - 0.5) * 2);
    const spo2Noise = (Math.random() > 0.9) ? -1 : 0;
    const tempNoise = +(Math.sin(this.tickCount / 4) * 0.05).toFixed(1);

    const bpSys = scenario.bloodPressure?.systolic ?? 120;
    const bpDia = scenario.bloodPressure?.diastolic ?? 80;

    const telemetry = {
      patientId,
      patientName: 'Jane Doe',
      deviceId: 'ESP32-DEMO-SIM',
      heartRate: {
        value: Math.max(30, scenario.heartRate + hrNoise),
        unit: 'BPM',
        status: scenario.heartRate > 100 ? 'ELEVATED' : 'NORMAL'
      },
      spo2: {
        value: Math.min(100, Math.max(70, scenario.spo2 + spo2Noise)),
        unit: '%',
        status: scenario.spo2 < 90 ? 'CRITICAL' : (scenario.spo2 < 95 ? 'LOW' : 'OPTIMAL')
      },
      temperature: {
        celsius: +(scenario.temperature + tempNoise).toFixed(1),
        fahrenheit: +(((scenario.temperature + tempNoise) * 9/5) + 32).toFixed(1),
        unit: '°C'
      },
      bloodPressure: {
        systolic: bpSys,
        diastolic: bpDia,
        pulse: scenario.bloodPressure?.pulse ?? scenario.heartRate,
        unit: 'mmHg',
        status: scenario.bloodPressure?.status ?? 'NORMAL'
      },
      respiratoryRate: {
        value: scenario.respiratoryRate ?? 16,
        unit: 'breaths/min'
      },
      bloodGlucose: {
        value: scenario.bloodGlucose ?? 95,
        unit: 'mg/dL',
        mealContext: 'Fasting'
      },
      ecg: {
        rhythm: scenario.heartRate > 120 ? 'Sinus Tachycardia' : (scenario.fallDetected ? 'Motion Artifact / Arrhythmia' : 'Normal Sinus Rhythm'),
        leadsStatus: 'Connected (Lead I/II)',
        waveform: [0.1, 0.2, -0.1, 1.4, -0.5, 0.3, 0.1, 0.0]
      },
      activity: {
        steps: 6420 + (this.tickCount * 2),
        calories: 340,
        distanceKm: 4.8
      },
      sleep: {
        totalDurationHours: 7.4,
        deepSleepHours: 2.1,
        sleepScore: 88
      },
      fallDetected: scenario.fallDetected,
      sosPressed: scenario.sosPressed,
      batteryLevel: '89%',
      wifiRssi: -54,
      firmwareVersion: 'v2.4.0-DEMO',
      sensorStatus: {
        opticalPulse: 'ATTACHED',
        temperatureProbe: 'ATTACHED',
        imuMotion: 'ATTACHED',
        satelliteGps: 'LOCKED'
      },
      latitude: 24.7955 + (Math.sin(this.tickCount / 10) * 0.0003),
      longitude: 84.9995 + (Math.cos(this.tickCount / 10) * 0.0003),
      locationSource: 'SIMULATED GPS (DEMO)',
      timestamp: Date.now(),
      isDemo: true,
      isLive: false
    };

    // Run clinical zone evaluation
    const zoneEval = zoneEngine.evaluate(telemetry);
    telemetry.zone = zoneEval.overallZone;
    telemetry.overallZone = zoneEval.overallZone;
    telemetry.zoneLabel = zoneEval.zoneLabel;
    telemetry.zoneTriggers = zoneEval.triggers;
    telemetry.emergencyState = zoneEval.isEmergency ? 'EMERGENCY' : (zoneEval.isWarning ? 'WARNING' : 'NORMAL');
    telemetry.emergencyReason = zoneEval.triggers.length > 0 ? zoneEval.triggers.map(t => t.label).join('; ') : null;
    telemetry.disclaimer = zoneEval.disclaimer;

    // Update DB
    dbService.updateCurrentTelemetry(patientId, telemetry);

    // If emergency or warning, trigger workflow
    if (zoneEval.isEmergency || zoneEval.isWarning) {
      emergencyDetector.triggerEmergencyWorkflow(patientId, {
        eventType: zoneEval.isEmergency ? (telemetry.sosPressed ? 'MANUAL_SOS' : (telemetry.fallDetected ? 'FALL_EVENT' : 'CRITICAL_VITALS')) : 'WARNING_VITALS',
        zone: zoneEval.overallZone,
        reason: telemetry.emergencyReason || 'Threshold Deviation',
        vitalsAtEvent: {
          heartRate: telemetry.heartRate.value,
          spo2: telemetry.spo2.value,
          temperature: telemetry.temperature.celsius,
          bloodPressure: telemetry.bloodPressure
        },
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        locationSource: telemetry.locationSource,
        timestamp: telemetry.timestamp,
        isDemo: true,
        triggers: zoneEval.triggers
      });
    }

    return telemetry;
  }
}

export const demoSimulator = new DemoSimulator();
