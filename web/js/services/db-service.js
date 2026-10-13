/**
 * ALPHA SQUARED - Database & Realtime Synchronization Service
 * Interfaces with Firebase Realtime Database (RTDB) when active,
 * with reactive fallback to local state synchronization and listeners.
 */

import { getFirebaseConfig, isFirebaseConfigured } from '../config/firebase-config.js';

class RealtimeDatabaseService {
  constructor() {
    this.listeners = new Map();
    this.isFirebaseReady = false;
    this.initFirebase();
  }

  async initFirebase() {
    if (isFirebaseConfigured() && typeof window !== 'undefined') {
      try {
        // Dynamically import Firebase App and Database modules if in browser
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const { getDatabase, ref, onValue, set, push, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        
        const config = getFirebaseConfig();
        this.app = initializeApp(config);
        this.rtdb = getDatabase(this.app);
        this.fbRef = ref;
        this.fbOnValue = onValue;
        this.fbSet = set;
        this.fbPush = push;
        this.fbUpdate = update;
        this.isFirebaseReady = true;
        console.log('[ALPHA SQUARED] Connected to live Firebase Realtime Database:', config.databaseURL);
      } catch (err) {
        console.warn('[ALPHA SQUARED] Firebase RTDB init error (running in local prototype mode):', err);
        this.isFirebaseReady = false;
      }
    }
  }

  /**
   * Subscribe to the live vital telemetry of a patient
   */
  subscribeToPatientCurrent(patientId, callback) {
    if (this.isFirebaseReady && this.rtdb) {
      try {
        const currentRef = this.fbRef(this.rtdb, `patients/${patientId}/current`);
        const unsubscribe = this.fbOnValue(currentRef, (snapshot) => {
          const val = snapshot.val();
          if (val) callback(val);
        });
        return unsubscribe;
      } catch (e) {
        console.warn('Firebase listener error:', e);
      }
    }

    // Local reactive pub-sub fallback
    const key = `current_${patientId}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);

    // Initial check from localStorage
    const saved = localStorage.getItem(`rtdb_patients_${patientId}_current`);
    if (saved) {
      try { callback(JSON.parse(saved)); } catch {}
    }

    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  /**
   * Publish current telemetry payload (from ESP32 or Simulator)
   */
  async updateCurrentTelemetry(patientId, payload) {
    const fullPayload = {
      ...payload,
      timestamp: payload.timestamp || Date.now()
    };

    if (this.isFirebaseReady && this.rtdb) {
      try {
        const currentRef = this.fbRef(this.rtdb, `patients/${patientId}/current`);
        await this.fbSet(currentRef, fullPayload);
      } catch (e) {
        console.warn('Firebase RTDB write error:', e);
      }
    }

    // Save locally and trigger subscribers
    localStorage.setItem(`rtdb_patients_${patientId}_current`, JSON.stringify(fullPayload));
    const key = `current_${patientId}`;
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(fullPayload));
    }

    // Also append to history
    this.appendHistoryReading(patientId, fullPayload);
  }

  /**
   * Append a reading to patient history
   */
  async appendHistoryReading(patientId, reading) {
    const readingObj = {
      heartRate: reading.heartRate,
      spo2: reading.spo2,
      temperature: reading.temperature,
      emergencyState: reading.emergencyState || 'NORMAL',
      timestamp: reading.timestamp || Date.now()
    };

    if (this.isFirebaseReady && this.rtdb) {
      try {
        const historyRef = this.fbRef(this.rtdb, `patients/${patientId}/history`);
        const newReadingRef = this.fbPush(historyRef);
        await this.fbSet(newReadingRef, readingObj);
      } catch (e) {
        console.warn('Firebase history push error:', e);
      }
    }

    // Local storage history buffer (keep last 100 entries)
    const localHistKey = `rtdb_patients_${patientId}_history`;
    let hist = [];
    try {
      const existing = localStorage.getItem(localHistKey);
      if (existing) hist = JSON.parse(existing);
    } catch {}

    hist.push(readingObj);
    if (hist.length > 100) hist.shift();
    localStorage.setItem(localHistKey, JSON.stringify(hist));
  }

  /**
   * Retrieve historical readings
   */
  async getHistory(patientId) {
    if (this.isFirebaseReady && this.rtdb) {
      // Firebase snapshot if available
    }

    const localHistKey = `rtdb_patients_${patientId}_history`;
    try {
      const existing = localStorage.getItem(localHistKey);
      if (existing) return JSON.parse(existing);
    } catch {}

    // Return realistic seeded demo history if empty
    return this.generateSeedHistory();
  }

  generateSeedHistory() {
    const seed = [];
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const t = now - i * 15000;
      seed.push({
        heartRate: Math.round(72 + Math.sin(i / 2) * 5),
        spo2: Math.round(98 + (i % 4 === 0 ? -1 : 0)),
        temperature: +(36.5 + Math.sin(i / 3) * 0.2).toFixed(1),
        emergencyState: 'NORMAL',
        timestamp: t
      });
    }
    return seed;
  }

  /**
   * Emergency Incidents Management
   */
  subscribeToEmergencies(patientId, callback) {
    const key = `emergencies_${patientId}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);

    const saved = localStorage.getItem(`rtdb_patients_${patientId}_emergencies`);
    if (saved) {
      try { callback(JSON.parse(saved)); } catch {}
    } else {
      callback([]);
    }

    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  async recordEmergency(patientId, eventPayload) {
    const eventId = 'EMG-' + Date.now();
    const event = {
      eventId,
      ...eventPayload,
      timestamp: eventPayload.timestamp || Date.now(),
      status: 'TRIGGERED', // TRIGGERED -> ACKNOWLEDGED -> RESOLVED
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNotes: null,
      notificationStatus: 'DISPATCHED'
    };

    if (this.isFirebaseReady && this.rtdb) {
      try {
        const emgRef = this.fbRef(this.rtdb, `patients/${patientId}/emergencies/${eventId}`);
        await this.fbSet(emgRef, event);
      } catch (e) {
        console.warn('Firebase emergency record error:', e);
      }
    }

    // Local update
    const storageKey = `rtdb_patients_${patientId}_emergencies`;
    let list = [];
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) list = JSON.parse(existing);
    } catch {}

    list.unshift(event);
    localStorage.setItem(storageKey, JSON.stringify(list));

    const key = `emergencies_${patientId}`;
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(list));
    }

    return event;
  }

  async acknowledgeEmergency(patientId, eventId, caregiverName) {
    const storageKey = `rtdb_patients_${patientId}_emergencies`;
    let list = [];
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) list = JSON.parse(existing);
    } catch {}

    const target = list.find(e => e.eventId === eventId);
    if (target) {
      target.status = 'ACKNOWLEDGED';
      target.acknowledgedBy = caregiverName || 'Primary Caregiver';
      target.acknowledgedAt = Date.now();
      localStorage.setItem(storageKey, JSON.stringify(list));

      const key = `emergencies_${patientId}`;
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach(cb => cb(list));
      }
    }
  }

  async resolveEmergency(patientId, eventId, resolvedBy, notes) {
    const storageKey = `rtdb_patients_${patientId}_emergencies`;
    let list = [];
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) list = JSON.parse(existing);
    } catch {}

    const target = list.find(e => e.eventId === eventId);
    if (target) {
      target.status = 'RESOLVED';
      target.resolvedBy = resolvedBy || 'Attending Physician';
      target.resolvedAt = Date.now();
      target.resolutionNotes = notes || 'Vitals stabilized and verified by caregiver.';
      localStorage.setItem(storageKey, JSON.stringify(list));

      const key = `emergencies_${patientId}`;
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach(cb => cb(list));
      }
    }
  }

  /**
   * Device Heartbeat & Diagnostics
   */
  async updateDeviceHeartbeat(deviceId, diagnostics) {
    const payload = {
      deviceId,
      lastSeen: Date.now(),
      status: 'ONLINE',
      ...diagnostics
    };

    localStorage.setItem(`rtdb_device_${deviceId}`, JSON.stringify(payload));
    return payload;
  }

  getDeviceStatus(deviceId) {
    try {
      const data = localStorage.getItem(`rtdb_device_${deviceId}`);
      if (data) return JSON.parse(data);
    } catch {}
    return {
      deviceId,
      lastSeen: Date.now(),
      status: 'ONLINE',
      wifiRssi: -58,
      batteryLevel: '94%',
      sensors: {
        pulseOximeter: 'OK',
        temperature: 'OK',
        imu: 'OK',
        gps: 'LOCKED'
      }
    };
  }
  /**
   * Notification Logs Audit Trail
   */
  async recordNotificationLog(patientId = 'PATIENT-001', logEntry) {
    const logId = `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fullEntry = {
      id: logId,
      patientId,
      timestamp: logEntry.timestamp || Date.now(),
      zone: logEntry.zone || 'GREEN',
      reason: logEntry.reason || 'Telemetry Update',
      vitals: logEntry.vitals || {},
      recipients: logEntry.recipients || [],
      status: logEntry.status || 'DELIVERED', // DELIVERED, SIMULATED, SUPPRESSED, FAILED
      dataSource: logEntry.dataSource || 'DEMO', // DEMO or REAL
      locationIncluded: Boolean(logEntry.locationIncluded),
      mapsUrl: logEntry.mapsUrl || null,
      summary: logEntry.summary || '',
      isTest: Boolean(logEntry.isTest)
    };

    if (this.isFirebaseReady && this.rtdb) {
      try {
        const notifRef = this.fbRef(this.rtdb, `patients/${patientId}/notifications/${logId}`);
        await this.fbSet(notifRef, fullEntry);
      } catch (e) {
        console.warn('Firebase notification log error:', e);
      }
    }

    const storageKey = `rtdb_patients_${patientId}_notifications`;
    let list = [];
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) list = JSON.parse(existing);
    } catch {}

    list.unshift(fullEntry);
    if (list.length > 50) list = list.slice(0, 50); // Keep last 50
    localStorage.setItem(storageKey, JSON.stringify(list));

    const key = `notifications_${patientId}`;
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(list));
    }

    return fullEntry;
  }

  getNotificationLogs(patientId = 'PATIENT-001', limit = 20) {
    const storageKey = `rtdb_patients_${patientId}_notifications`;
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        const list = JSON.parse(existing);
        return Array.isArray(list) ? list.slice(0, limit) : [];
      }
    } catch {}
    return [];
  }

  subscribeToNotificationLogs(patientId = 'PATIENT-001', callback) {
    const key = `notifications_${patientId}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);

    callback(this.getNotificationLogs(patientId));

    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  /**
   * Phone Call Action Audit Logging
   */
  async recordCallAction(patientId = 'PATIENT-001', callEntry) {
    const callId = `CALL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fullEntry = {
      id: callId,
      patientId,
      timestamp: callEntry.timestamp || Date.now(),
      target: callEntry.target || 'EMERGENCY_CONTACT', // PARENT_GUARDIAN or EMERGENCY_CONTACT
      name: callEntry.name || 'Unknown Contact',
      phone: callEntry.phone || '',
      relation: callEntry.relation || 'Contact',
      status: callEntry.status || 'DIALER_LAUNCHED', // DIALER_LAUNCHED or CANCELLED
      confirmed: Boolean(callEntry.confirmed),
      vitalsSnapshot: callEntry.vitalsSnapshot || null,
      disclaimerAcknowledged: true
    };

    const storageKey = `rtdb_patients_${patientId}_call_actions`;
    let list = [];
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) list = JSON.parse(existing);
    } catch {}

    list.unshift(fullEntry);
    if (list.length > 50) list = list.slice(0, 50);
    localStorage.setItem(storageKey, JSON.stringify(list));

    return fullEntry;
  }

  getCallActions(patientId = 'PATIENT-001', limit = 20) {
    const storageKey = `rtdb_patients_${patientId}_call_actions`;
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        const list = JSON.parse(existing);
        return Array.isArray(list) ? list.slice(0, limit) : [];
      }
    } catch {}
    return [];
  }

  /**
   * Privacy & Location Consent Settings
   */
  getLocationSharingConsent(patientId = 'PATIENT-001') {
    const val = localStorage.getItem(`alphasquared_location_sharing_consent_${patientId}`);
    if (val === null) return true; // Default enabled for patient safety
    return val === 'true';
  }

  setLocationSharingConsent(patientId = 'PATIENT-001', enabled = true) {
    localStorage.setItem(`alphasquared_location_sharing_consent_${patientId}`, String(Boolean(enabled)));
  }

  getPhoneMaskingSetting() {
    const val = localStorage.getItem('alphasquared_phone_masking');
    if (val === null) return true; // Default masked for privacy protection
    return val === 'true';
  }

  setPhoneMaskingSetting(enabled = true) {
    localStorage.setItem('alphasquared_phone_masking', String(Boolean(enabled)));
  }

  /**
   * Mask phone number for display protection (e.g. +91 ••••• ••210)
   */
  maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return '';
    const clean = phone.trim();
    if (clean.length <= 4) return clean;
    // Keep first 3 chars (e.g. +91 or first 2) and last 3 chars
    const start = clean.slice(0, 4);
    const end = clean.slice(-3);
    const maskedLength = Math.max(3, clean.length - 7);
    return `${start} ${'•'.repeat(maskedLength)} ${end}`;
  }

  /**
   * Parent/Guardian & Emergency Contact Management
   */
  getParentGuardianContact() {
    try {
      const saved = localStorage.getItem('alphasquared_parent_guardian_contact');
      if (saved) return JSON.parse(saved);
      // Fallback check for legacy keys
      const legacyName = localStorage.getItem('alphasquared_primary_caregiver_name');
      const legacyPhone = localStorage.getItem('alphasquared_primary_caregiver_phone');
      if (legacyName || legacyPhone) {
        return {
          name: legacyName || '',
          phone: legacyPhone || '',
          relation: 'Parent / Guardian',
          email: localStorage.getItem('alphasquared_primary_caregiver_email') || ''
        };
      }
    } catch {}
    return null;
  }

  saveParentGuardianContact(contact) {
    const payload = {
      name: (contact.name || '').trim(),
      phone: (contact.phone || '').trim(),
      relation: (contact.relation || 'Parent / Guardian').trim(),
      email: (contact.email || '').trim(),
      updatedAt: Date.now()
    };
    localStorage.setItem('alphasquared_parent_guardian_contact', JSON.stringify(payload));
    // Mirror to legacy keys for compatibility
    if (payload.name) localStorage.setItem('alphasquared_primary_caregiver_name', payload.name);
    if (payload.phone) localStorage.setItem('alphasquared_primary_caregiver_phone', payload.phone);
    return payload;
  }

  removeParentGuardianContact() {
    localStorage.removeItem('alphasquared_parent_guardian_contact');
    localStorage.removeItem('alphasquared_primary_caregiver_name');
    localStorage.removeItem('alphasquared_primary_caregiver_phone');
  }

  getEmergencyContact() {
    try {
      const saved = localStorage.getItem('alphasquared_emergency_contact');
      if (saved) return JSON.parse(saved);
      // Fallback check for legacy keys
      const legacyName = localStorage.getItem('alphasquared_sec_contact_name');
      const legacyPhone = localStorage.getItem('alphasquared_sec_contact_phone');
      if (legacyName || legacyPhone) {
        return {
          name: legacyName || '',
          phone: legacyPhone || '',
          relation: 'Emergency Contact',
          email: localStorage.getItem('alphasquared_sec_contact_email') || ''
        };
      }
    } catch {}
    return null;
  }

  saveEmergencyContact(contact) {
    const payload = {
      name: (contact.name || '').trim(),
      phone: (contact.phone || '').trim(),
      relation: (contact.relation || 'Emergency Contact').trim(),
      email: (contact.email || '').trim(),
      updatedAt: Date.now()
    };
    localStorage.setItem('alphasquared_emergency_contact', JSON.stringify(payload));
    // Mirror to legacy keys for compatibility
    if (payload.name) localStorage.setItem('alphasquared_sec_contact_name', payload.name);
    if (payload.phone) localStorage.setItem('alphasquared_sec_contact_phone', payload.phone);
    return payload;
  }

  removeEmergencyContact() {
    localStorage.removeItem('alphasquared_emergency_contact');
    localStorage.removeItem('alphasquared_sec_contact_name');
    localStorage.removeItem('alphasquared_sec_contact_phone');
  }
}

export const dbService = new RealtimeDatabaseService();


