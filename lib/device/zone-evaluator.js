/**
 * ALPHA SQUARED - Clinical Zone Evaluation Engine (Backend)
 * 
 * Evaluates patient biometrics into three clinical health zones:
 * - GREEN ZONE (Normal / Stable): Within acceptable medical ranges. No SMS spam.
 * - YELLOW ZONE (Warning / Caution): Deviations requiring caregiver attention & SMS notice.
 * - RED ZONE (Critical Emergency): Severe vitals, Fall Detection, or physical SOS push.
 */

export const CLINICAL_ZONES = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  STANDBY: 'STANDBY'
};

export const CLINICAL_DISCLAIMER = 'Normal readings indicate current physiological stability but do not substitute professional medical diagnosis or clinical prescription.';

export function evaluatePatientZones(telemetry = {}) {
  const triggers = [];
  const measurementZones = {};
  let highestZone = CLINICAL_ZONES.GREEN;
  let hasAnyReading = false;

  const hr = telemetry.heartRate?.value ?? (typeof telemetry.heartRate === 'number' ? telemetry.heartRate : null);
  const spo2 = telemetry.spo2?.value ?? (typeof telemetry.spo2 === 'number' ? telemetry.spo2 : null);
  const tempC = telemetry.temperature?.celsius ?? (typeof telemetry.temperature === 'number' ? telemetry.temperature : null);
  const bpSys = telemetry.bloodPressure?.systolic ?? null;
  const bpDia = telemetry.bloodPressure?.diastolic ?? null;
  const rr = telemetry.respiratoryRate?.value ?? (typeof telemetry.respiratoryRate === 'number' ? telemetry.respiratoryRate : null);
  const glucose = telemetry.bloodGlucose?.value ?? (typeof telemetry.bloodGlucose === 'number' ? telemetry.bloodGlucose : null);
  const fallDetected = Boolean(telemetry.fallDetected);
  const sosPressed = Boolean(telemetry.sosPressed);

  // 1. Hardware Interrupts (Instant RED Zone)
  if (sosPressed) {
    hasAnyReading = true;
    highestZone = CLINICAL_ZONES.RED;
    measurementZones.sos = CLINICAL_ZONES.RED;
    triggers.push({
      parameter: 'sos',
      zone: CLINICAL_ZONES.RED,
      label: 'Hardware Physical SOS Button Pressed',
      value: 'ACTIVE_DISTRESS',
      severity: 'CRITICAL',
      recommendedAction: 'Immediate emergency rescue contact and on-site check required.'
    });
  }

  if (fallDetected) {
    hasAnyReading = true;
    highestZone = CLINICAL_ZONES.RED;
    measurementZones.fall = CLINICAL_ZONES.RED;
    triggers.push({
      parameter: 'fall',
      zone: CLINICAL_ZONES.RED,
      label: 'Autonomous Fall Impact Detected by Wearable IMU',
      value: 'IMPACT_DETECTED',
      severity: 'CRITICAL',
      recommendedAction: 'Verify patient consciousness; deploy emergency caregiver or ambulance.'
    });
  }

  // 2. Heart Rate / Pulse
  // Normal: 60 - 100 BPM
  // Yellow: 50 - 59 BPM (Mild Bradycardia) or 101 - 120 BPM (Mild Tachycardia)
  // Red: < 50 BPM (Severe Bradycardia) or > 120 BPM (Severe Tachycardia)
  if (hr != null && !isNaN(hr)) {
    hasAnyReading = true;
    if (hr < 50) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.heartRate = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'heartRate',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Bradycardia',
        value: `${hr} BPM`,
        severity: 'CRITICAL',
        recommendedAction: 'Immediate cardiac assessment required; check airway and responsiveness.'
      });
    } else if (hr > 120) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.heartRate = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'heartRate',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Tachycardia',
        value: `${hr} BPM`,
        severity: 'CRITICAL',
        recommendedAction: 'Immediate rest required; evaluate for cardiac arrhythmia or acute distress.'
      });
    } else if (hr >= 50 && hr < 60) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.heartRate = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'heartRate',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Mild Bradycardia',
        value: `${hr} BPM`,
        severity: 'WARNING',
        recommendedAction: 'Rest quietly, stay warm, and recheck heart rate in 10 minutes.'
      });
    } else if (hr > 100 && hr <= 120) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.heartRate = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'heartRate',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Mild Tachycardia',
        value: `${hr} BPM`,
        severity: 'WARNING',
        recommendedAction: 'Sit down, hydrate with water, practice slow breathing, and recheck vitals.'
      });
    } else {
      measurementZones.heartRate = CLINICAL_ZONES.GREEN;
    }
  }

  // 3. Blood Oxygen (SpO2 %)
  // Normal: 95% - 100%
  // Yellow: 90% - 94% (Mild Hypoxia)
  // Red: < 90% (Severe Hypoxia / Respiratory Distress)
  if (spo2 != null && !isNaN(spo2)) {
    hasAnyReading = true;
    if (spo2 < 90) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.spo2 = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'spo2',
        zone: CLINICAL_ZONES.RED,
        label: 'Critical Hypoxia (Severe Oxygen Desaturation)',
        value: `${spo2}%`,
        severity: 'CRITICAL',
        recommendedAction: 'Administer supplemental oxygen if available; call emergency services immediately.'
      });
    } else if (spo2 >= 90 && spo2 < 95) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.spo2 = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'spo2',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Mild Hypoxia (Borderline Oxygen Saturation)',
        value: `${spo2}%`,
        severity: 'WARNING',
        recommendedAction: 'Ensure good ventilation, sit upright, take slow deep breaths, and retest probe placement.'
      });
    } else {
      measurementZones.spo2 = CLINICAL_ZONES.GREEN;
    }
  }

  // 4. Body Temperature (°C)
  // Normal: 36.5°C - 37.5°C
  // Yellow: 37.6°C - 38.4°C (Low-grade fever) or 35.5°C - 36.4°C (Mild Hypothermia)
  // Red: > 38.5°C (High Fever) or < 35.0°C (Hypothermia)
  if (tempC != null && !isNaN(tempC)) {
    hasAnyReading = true;
    if (tempC > 38.5) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.temperature = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'temperature',
        zone: CLINICAL_ZONES.RED,
        label: 'High Fever (Severe Pyrexia)',
        value: `${tempC.toFixed(1)}°C (${((tempC * 9/5) + 32).toFixed(1)}°F)`,
        severity: 'CRITICAL',
        recommendedAction: 'Apply cool damp compress, hydrate, and seek medical urgent care.'
      });
    } else if (tempC < 35.0) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.temperature = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'temperature',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Hypothermia',
        value: `${tempC.toFixed(1)}°C (${((tempC * 9/5) + 32).toFixed(1)}°F)`,
        severity: 'CRITICAL',
        recommendedAction: 'Warm patient actively with blankets; avoid rapid friction; contact emergency.'
      });
    } else if (tempC >= 37.6 && tempC <= 38.4) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.temperature = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'temperature',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Low-Grade Fever (Mild Pyrexia)',
        value: `${tempC.toFixed(1)}°C (${((tempC * 9/5) + 32).toFixed(1)}°F)`,
        severity: 'WARNING',
        recommendedAction: 'Rest, drink oral rehydration fluids, monitor every 30 minutes.'
      });
    } else if (tempC >= 35.5 && tempC < 36.5) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.temperature = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'temperature',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Mild Hypothermia / Subnormal Temp',
        value: `${tempC.toFixed(1)}°C (${((tempC * 9/5) + 32).toFixed(1)}°F)`,
        severity: 'WARNING',
        recommendedAction: 'Add warm layer, drink warm fluids, and recheck sensor placement.'
      });
    } else {
      measurementZones.temperature = CLINICAL_ZONES.GREEN;
    }
  }

  // 5. Blood Pressure (Systolic and Diastolic mmHg)
  // Normal: Systolic < 120 and Diastolic < 80 mmHg
  // Yellow: Systolic 120 - 139 or Diastolic 80 - 89 mmHg (Pre-hypertension / Elevated)
  // Red: Systolic >= 140 or Diastolic >= 90 mmHg (Hypertension Stage 2 / Crisis >= 180/120) or Systolic < 90 mmHg (Hypotension)
  if (bpSys != null && bpDia != null && !isNaN(bpSys) && !isNaN(bpDia)) {
    hasAnyReading = true;
    if (bpSys >= 180 || bpDia >= 120) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.bloodPressure = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'bloodPressure',
        zone: CLINICAL_ZONES.RED,
        label: 'Hypertensive Emergency Crisis',
        value: `${bpSys}/${bpDia} mmHg`,
        severity: 'CRITICAL',
        recommendedAction: 'Immediate emergency room evaluation required; risk of acute organ injury.'
      });
    } else if (bpSys >= 140 || bpDia >= 90) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.bloodPressure = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'bloodPressure',
        zone: CLINICAL_ZONES.RED,
        label: 'Hypertension Stage 2 (Severe Elevation)',
        value: `${bpSys}/${bpDia} mmHg`,
        severity: 'CRITICAL',
        recommendedAction: 'Patient must rest in sitting position; notify primary physician immediately.'
      });
    } else if (bpSys < 90 || bpDia < 60) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.bloodPressure = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'bloodPressure',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Hypotension (Low Blood Pressure)',
        value: `${bpSys}/${bpDia} mmHg`,
        severity: 'CRITICAL',
        recommendedAction: 'Lie patient flat with legs elevated; hydrate; seek medical triage.'
      });
    } else if ((bpSys >= 120 && bpSys < 140) || (bpDia >= 80 && bpDia < 90)) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.bloodPressure = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'bloodPressure',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Elevated Blood Pressure / Pre-Hypertension',
        value: `${bpSys}/${bpDia} mmHg`,
        severity: 'WARNING',
        recommendedAction: 'Avoid caffeine or stress; rest quietly for 15 minutes and repeat cuff reading.'
      });
    } else {
      measurementZones.bloodPressure = CLINICAL_ZONES.GREEN;
    }
  }

  // 6. Respiratory Rate (breaths/min)
  // Normal: 12 - 20 breaths/min
  // Yellow: 21 - 25 breaths/min or 9 - 11 breaths/min
  // Red: > 25 breaths/min or < 9 breaths/min
  if (rr != null && !isNaN(rr)) {
    hasAnyReading = true;
    if (rr > 25) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.respiratoryRate = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'respiratoryRate',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Tachypnea (Respiratory Distress)',
        value: `${rr} breaths/min`,
        severity: 'CRITICAL',
        recommendedAction: 'Check for airway obstruction; evaluate oxygenation; call for urgent medical assistance.'
      });
    } else if (rr < 9) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.respiratoryRate = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'respiratoryRate',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Bradypnea (Respiratory Depression)',
        value: `${rr} breaths/min`,
        severity: 'CRITICAL',
        recommendedAction: 'Stimulate patient; verify airway and call emergency services.'
      });
    } else if (rr >= 21 && rr <= 25) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.respiratoryRate = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'respiratoryRate',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Elevated Respiratory Rate (Mild Tachypnea)',
        value: `${rr} breaths/min`,
        severity: 'WARNING',
        recommendedAction: 'Rest in an upright position; practice controlled pursed-lip breathing.'
      });
    } else if (rr >= 9 && rr <= 11) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.respiratoryRate = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'respiratoryRate',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Low Respiratory Rate (Mild Bradypnea)',
        value: `${rr} breaths/min`,
        severity: 'WARNING',
        recommendedAction: 'Check alertness and posture; monitor closely.'
      });
    } else {
      measurementZones.respiratoryRate = CLINICAL_ZONES.GREEN;
    }
  }

  // 7. Blood Glucose (mg/dL)
  // Normal: 70 - 140 mg/dL
  // Yellow: 141 - 199 mg/dL or 60 - 69 mg/dL
  // Red: >= 200 mg/dL or < 60 mg/dL
  if (glucose != null && !isNaN(glucose)) {
    hasAnyReading = true;
    if (glucose >= 200) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.bloodGlucose = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'bloodGlucose',
        zone: CLINICAL_ZONES.RED,
        label: 'Severe Hyperglycemia',
        value: `${glucose} mg/dL`,
        severity: 'CRITICAL',
        recommendedAction: 'Follow diabetic emergency protocol; check ketones; contact healthcare provider.'
      });
    } else if (glucose < 60) {
      escalateZone(CLINICAL_ZONES.RED);
      measurementZones.bloodGlucose = CLINICAL_ZONES.RED;
      triggers.push({
        parameter: 'bloodGlucose',
        zone: CLINICAL_ZONES.RED,
        label: 'Critical Hypoglycemia',
        value: `${glucose} mg/dL`,
        severity: 'CRITICAL',
        recommendedAction: 'Consume fast-acting carbohydrates (15-20g glucose / fruit juice) immediately; recheck in 15 min.'
      });
    } else if (glucose >= 141 && glucose < 200) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.bloodGlucose = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'bloodGlucose',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Elevated Glucose (Pre-Diabetes / Postprandial High)',
        value: `${glucose} mg/dL`,
        severity: 'WARNING',
        recommendedAction: 'Drink water, avoid sugary food, and log meal context.'
      });
    } else if (glucose >= 60 && glucose < 70) {
      escalateZone(CLINICAL_ZONES.YELLOW);
      measurementZones.bloodGlucose = CLINICAL_ZONES.YELLOW;
      triggers.push({
        parameter: 'bloodGlucose',
        zone: CLINICAL_ZONES.YELLOW,
        label: 'Borderline Low Glucose',
        value: `${glucose} mg/dL`,
        severity: 'WARNING',
        recommendedAction: 'Have a light snack and recheck in 20 minutes.'
      });
    } else {
      measurementZones.bloodGlucose = CLINICAL_ZONES.GREEN;
    }
  }

  function escalateZone(targetZone) {
    if (targetZone === CLINICAL_ZONES.RED) {
      highestZone = CLINICAL_ZONES.RED;
    } else if (targetZone === CLINICAL_ZONES.YELLOW && highestZone !== CLINICAL_ZONES.RED) {
      highestZone = CLINICAL_ZONES.YELLOW;
    }
  }

  // Zone metadata
  const zoneSummary = {
    overallZone: highestZone,
    zoneLabel: highestZone === CLINICAL_ZONES.RED
      ? 'RED ZONE — CRITICAL EMERGENCY'
      : (highestZone === CLINICAL_ZONES.YELLOW
        ? 'YELLOW ZONE — CAUTION REQUIRED'
        : 'GREEN ZONE — NOMINAL & STABLE'),
    isEmergency: highestZone === CLINICAL_ZONES.RED,
    isWarning: highestZone === CLINICAL_ZONES.YELLOW,
    isNormal: highestZone === CLINICAL_ZONES.GREEN,
    triggers,
    measurementZones,
    requiresSms: highestZone === CLINICAL_ZONES.RED || highestZone === CLINICAL_ZONES.YELLOW,
    smsPriority: highestZone === CLINICAL_ZONES.RED ? 'URGENT' : (highestZone === CLINICAL_ZONES.YELLOW ? 'CAUTION' : 'NONE'),
    disclaimer: CLINICAL_DISCLAIMER,
    evaluatedAt: Date.now(),
    hasAnyReading
  };

  return zoneSummary;
}

export default {
  CLINICAL_ZONES,
  CLINICAL_DISCLAIMER,
  evaluatePatientZones
};
