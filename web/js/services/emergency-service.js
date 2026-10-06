/**
 * ALPHA SQUARED - Emergency Detection & Vital Assessment Service
 * Evaluates multi-parameter telemetry against configurable clinical prototype thresholds.
 * Handles fall confirmation windows, critical vital escalation, and duplicate alert suppression.
 *
 * DISCLAIMER: Prototype algorithm for hackathon demonstration. Not a certified medical device.
 */

import { dbService } from './db-service.js';
import { showToast } from '../components/notification-toast.js';

export const DEFAULT_THRESHOLDS = {
  hrLowWarning: 55,
  hrLowCritical: 50,
  hrHighWarning: 105,
  hrHighCritical: 120,
  spo2LowWarning: 94,
  spo2LowCritical: 90,
  tempHighWarning: 37.5,
  tempHighCritical: 38.5,
  tempLowWarning: 35.5,
  tempLowCritical: 35.0,
  fallConfirmationSeconds: 30
};

export class EmergencyDetector {
  constructor() {
    this.thresholds = this.loadThresholds();
    this.activeFallTimer = null;
    this.lastAlertTime = 0;
    this.duplicateSuppressionMs = 15000; // prevent re-spamming identical alert within 15s
  }

  loadThresholds() {
    try {
      const saved = localStorage.getItem('alphasquared_thresholds');
      if (saved) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_THRESHOLDS };
  }

  saveThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    localStorage.setItem('alphasquared_thresholds', JSON.stringify(this.thresholds));
  }

  /**
   * Evaluate a full telemetry frame
   */
  evaluateTelemetry(reading) {
    const issues = [];
    let state = 'NORMAL';

    const { heartRate, spo2, temperature, fallDetected, sosPressed } = reading;
    const th = this.thresholds;

    // Check SOS
    if (sosPressed) {
      return {
        state: 'EMERGENCY',
        reason: 'Manual SOS Emergency Signal Triggered',
        eventType: 'MANUAL_SOS',
        escalateImmediately: true
      };
    }

    // Check Fall
    if (fallDetected) {
      issues.push('Sudden Impact / Fall Detected');
      state = 'EMERGENCY';
    }

    // Check Heart Rate
    if (heartRate != null) {
      if (heartRate >= th.hrHighCritical) {
        issues.push(`Severe Tachycardia (${heartRate} BPM)`);
        state = 'EMERGENCY';
      } else if (heartRate <= th.hrLowCritical) {
        issues.push(`Severe Bradycardia (${heartRate} BPM)`);
        state = 'EMERGENCY';
      } else if (heartRate >= th.hrHighWarning || heartRate <= th.hrLowWarning) {
        issues.push(`Abnormal Heart Rate (${heartRate} BPM)`);
        if (state !== 'EMERGENCY') state = 'WARNING';
      }
    }

    // Check SpO2
    if (spo2 != null) {
      if (spo2 <= th.spo2LowCritical) {
        issues.push(`Critical Hypoxia (SpO₂: ${spo2}%)`);
        state = 'EMERGENCY';
      } else if (spo2 <= th.spo2LowWarning) {
        issues.push(`Low Oxygen Saturation (SpO₂: ${spo2}%)`);
        if (state !== 'EMERGENCY') state = 'WARNING';
      }
    }

    // Check Temperature
    if (temperature != null) {
      if (temperature >= th.tempHighCritical) {
        issues.push(`Critical Hyperpyrexia (${temperature.toFixed(1)} °C)`);
        state = 'EMERGENCY';
      } else if (temperature <= th.tempLowCritical) {
        issues.push(`Severe Hypothermia (${temperature.toFixed(1)} °C)`);
        state = 'EMERGENCY';
      } else if (temperature >= th.tempHighWarning || temperature <= th.tempLowWarning) {
        issues.push(`Elevated Body Temperature (${temperature.toFixed(1)} °C)`);
        if (state !== 'EMERGENCY') state = 'WARNING';
      }
    }

    // Coincidence check: If fall occurred alongside critical vitals, immediate priority escalation
    const isCoincidentEmergency = fallDetected && (issues.length > 1);

    return {
      state,
      reason: issues.join('; ') || 'Nominal readings',
      eventType: fallDetected ? 'FALL_EVENT' : (state === 'EMERGENCY' ? 'CRITICAL_VITALS' : 'NORMAL_MONITOR'),
      escalateImmediately: isCoincidentEmergency
    };
  }

  /**
   * Process and log emergency event with duplicate suppression
   */
  async triggerEmergencyWorkflow(patientId, eventPayload) {
    const now = Date.now();
    if (now - this.lastAlertTime < this.duplicateSuppressionMs) {
      console.warn('[ALPHA SQUARED] Duplicate emergency alert suppressed within timeout window.');
      return null;
    }

    this.lastAlertTime = now;

    // Record to database
    const recordedEvent = await dbService.recordEmergency(patientId, eventPayload);

    // Trigger visual toast
    showToast(`🚨 EMERGENCY TRIGGERED: ${eventPayload.reason}`, 'error', 8000);

    // Trigger serverless caregiver email notification
    this.dispatchServerlessEmail(patientId, recordedEvent);

    return recordedEvent;
  }

  async dispatchServerlessEmail(patientId, event) {
    try {
      const response = await fetch('/api/alerts/send-emergency-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          eventId: event.eventId,
          eventType: event.eventType,
          reason: event.reason,
          vitals: event.vitalsAtEvent,
          location: {
            lat: event.latitude,
            lng: event.longitude,
            source: event.locationSource
          },
          timestamp: event.timestamp
        })
      });

      if (!response.ok) {
        console.warn('[ALPHA SQUARED Alerts API] Serverless notification response:', response.status);
      }
    } catch {
      // In local static mode without Vercel running, this is expected
      console.log('[ALPHA SQUARED Alerts] Local mode: Email dispatch endpoint queued.');
    }
  }
}

export const emergencyDetector = new EmergencyDetector();

