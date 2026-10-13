/**
 * ALPHA SQUARED - Emergency Detection & Vital Assessment Service
 * Upgraded with Clinical Green, Yellow, and Red Zone Engine & Automated SMS Dispatch
 *
 * DISCLAIMER: Clinical prototype algorithm for hackathon demonstration. Not a certified medical device.
 */

import { dbService } from './db-service.js';
import { showToast } from '../components/notification-toast.js';
import { zoneEngine, CLINICAL_ZONES } from './zone-engine.js';

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
   * Evaluate a full telemetry frame using Centralized Zone Engine
   */
  evaluateTelemetry(reading) {
    const zoneEval = zoneEngine.evaluate(reading);

    const issues = zoneEval.triggers.map(t => `${t.label} (${t.value})`);
    const state = zoneEval.overallZone === CLINICAL_ZONES.RED 
      ? 'EMERGENCY' 
      : (zoneEval.overallZone === CLINICAL_ZONES.YELLOW ? 'WARNING' : 'NORMAL');

    if (reading.sosPressed) {
      return {
        state: 'EMERGENCY',
        zone: CLINICAL_ZONES.RED,
        zoneLabel: zoneEval.zoneLabel,
        reason: 'Manual SOS Emergency Signal Triggered',
        eventType: 'MANUAL_SOS',
        escalateImmediately: true,
        triggers: zoneEval.triggers
      };
    }

    if (reading.fallDetected) {
      return {
        state: 'EMERGENCY',
        zone: CLINICAL_ZONES.RED,
        zoneLabel: zoneEval.zoneLabel,
        reason: 'Sudden Impact / Fall Detected',
        eventType: 'FALL_EVENT',
        escalateImmediately: true,
        triggers: zoneEval.triggers
      };
    }

    return {
      state,
      zone: zoneEval.overallZone,
      zoneLabel: zoneEval.zoneLabel,
      reason: issues.join('; ') || 'Nominal readings within acceptable limits',
      eventType: state === 'EMERGENCY' ? 'CRITICAL_VITALS' : (state === 'WARNING' ? 'WARNING_VITALS' : 'NORMAL_MONITOR'),
      escalateImmediately: zoneEval.isEmergency,
      triggers: zoneEval.triggers,
      requiresSms: zoneEval.requiresSms
    };
  }

  /**
   * Process and log emergency or warning event with duplicate suppression
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
    if (eventPayload.state === 'EMERGENCY' || eventPayload.zone === 'RED') {
      showToast(`🚨 RED ZONE EMERGENCY: ${eventPayload.reason}`, 'error', 8000);
    } else if (eventPayload.state === 'WARNING' || eventPayload.zone === 'YELLOW') {
      showToast(`⚠️ YELLOW ZONE WARNING: ${eventPayload.reason}`, 'warning', 6000);
    }

    // Trigger serverless caregiver SMS & Email notifications
    this.dispatchServerlessSms(patientId, recordedEvent, eventPayload.zone || (eventPayload.state === 'EMERGENCY' ? 'RED' : 'YELLOW'), eventPayload.triggers || []);
    this.dispatchServerlessEmail(patientId, recordedEvent);

    return recordedEvent;
  }

  async dispatchServerlessSms(patientId, event, zone = 'YELLOW', triggers = []) {
    try {
      const parentContact = dbService.getParentGuardianContact();
      const emergencyContact = dbService.getEmergencyContact();
      const locationSharingConsent = dbService.getLocationSharingConsent(patientId);
      const patientPhone = localStorage.getItem('alphasquared_patient_phone') || null;

      const contacts = [];
      if (parentContact && parentContact.phone) {
        contacts.push({
          name: parentContact.name || 'Parent / Guardian',
          phone: parentContact.phone,
          role: 'PARENT_GUARDIAN',
          relation: parentContact.relation || 'Parent / Guardian'
        });
      }
      if (emergencyContact && emergencyContact.phone) {
        contacts.push({
          name: emergencyContact.name || 'Emergency Contact',
          phone: emergencyContact.phone,
          role: 'EMERGENCY_CONTACT',
          relation: emergencyContact.relation || 'Emergency Contact'
        });
      }

      // Fallback if contacts not configured yet
      if (contacts.length === 0) {
        const legacyPrimaryPhone = localStorage.getItem('alphasquared_primary_caregiver_phone');
        if (legacyPrimaryPhone) {
          contacts.push({
            name: localStorage.getItem('alphasquared_primary_caregiver_name') || 'Primary Caregiver',
            phone: legacyPrimaryPhone,
            role: 'PARENT_GUARDIAN'
          });
        }
      }

      const isDemoActive = localStorage.getItem('alphasquared_demo_active') === 'true' ||
                           sessionStorage.getItem('alphasquared_demo_active') === 'true';
      const dataSource = event.dataSource || (isDemoActive ? 'DEMO' : 'REAL');

      const response = await fetch('/api/alerts/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          patientName: event.patientName || 'Jane Doe',
          zone,
          triggers,
          vitals: event.vitalsAtEvent || {},
          location: {
            latitude: event.latitude,
            longitude: event.longitude,
            source: event.locationSource
          },
          locationSharingConsent,
          patientPhone,
          contacts,
          dataSource
        })
      });

      const data = await response.json().catch(() => ({}));

      // Log notification to database audit trail
      if (data && data.success !== undefined) {
        await dbService.recordNotificationLog(patientId, {
          timestamp: Date.now(),
          zone,
          reason: event.reason || (triggers.length ? triggers.map(t => t.label).join(', ') : 'Alert Triggered'),
          vitals: event.vitalsAtEvent || {},
          recipients: data.recipients || contacts.map(c => `${c.name} (${c.phone})`),
          status: data.isLiveGateway ? 'DELIVERED' : (data.simulated ? 'SIMULATED' : (data.suppressed ? 'SUPPRESSED' : 'DELIVERED')),
          dataSource,
          locationIncluded: Boolean(data.location && locationSharingConsent),
          mapsUrl: (data.location && locationSharingConsent) ? `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}` : null,
          summary: data.notice || (data.suppressed ? `Suppressed: ${data.reason}` : `Dispatched via ${data.provider || 'Gateway'}`)
        });
      }

      if (data.success) {
        console.log('[SMS DISPATCH REPORT]', data);
      }
      return data;
    } catch (err) {
      console.warn('[SMS DISPATCH WARN]', err.message);
      return null;
    }
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
      console.log('[ALPHA SQUARED Alerts] Local mode: Email dispatch endpoint queued.');
    }
  }
}

export const emergencyDetector = new EmergencyDetector();
