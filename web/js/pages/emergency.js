/**
 * ALPHA SQUARED - Emergency Center Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { initSosModal } from '../components/sos-modal.js';
import { showToast } from '../components/notification-toast.js';
import { openCallConfirmationModal } from '../components/call-modal.js';

let currentEmergencies = [];
let activeIncident = null;
let latestTelemetry = { heartRate: null, temperature: null, spo2: null };
const patientId = 'PATIENT-001';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('emergency');
  initParticleBackground('bg-canvas');

  initSosButton();
  initResolutionModal();
  renderCaregiverContacts();
  initCallingHandlers();

  // Subscribe to live telemetry
  dbService.subscribeToPatientCurrent(patientId, (current) => {
    if (current) {
      latestTelemetry = {
        heartRate: current.heartRate,
        temperature: current.temperature,
        spo2: current.spo2
      };
      updateTelemetryView(current);
    }
  });

  // Subscribe to emergency incident log
  dbService.subscribeToEmergencies(patientId, (list) => {
    currentEmergencies = list || [];
    renderIncidentView();
  });

  // Subscribe to Dispatched Health Notifications Log
  dbService.subscribeToNotificationLogs(patientId, (list) => {
    renderNotificationLogs(list || []);
  });

  const refreshBtn = document.getElementById('btn-refresh-history');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderIncidentView();
      showToast('Incident audit log refreshed.', 'info');
    });
  }

  const refreshNotifsBtn = document.getElementById('btn-refresh-notifs');
  if (refreshNotifsBtn) {
    refreshNotifsBtn.addEventListener('click', () => {
      renderNotificationLogs(dbService.getNotificationLogs(patientId));
      showToast('Dispatched notification log refreshed.', 'info');
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function renderCaregiverContacts() {
  const isMasked = dbService.getPhoneMaskingSetting();
  
  // 1. Parent / Guardian
  const parentContact = dbService.getParentGuardianContact();
  const parentNameEl = document.getElementById('parent-contact-display-name');
  const parentRelEl = document.getElementById('parent-contact-display-relation');
  const parentPhoneEl = document.getElementById('parent-contact-display-phone');
  
  if (parentContact && parentContact.phone) {
    if (parentNameEl) parentNameEl.textContent = parentContact.name || 'Parent / Guardian';
    if (parentRelEl) parentRelEl.textContent = parentContact.relation || 'Primary Guardian';
    if (parentPhoneEl) {
      parentPhoneEl.textContent = isMasked ? dbService.maskPhoneNumber(parentContact.phone) : parentContact.phone;
      parentPhoneEl.style.color = 'var(--cyan-primary)';
    }
  } else {
    if (parentNameEl) parentNameEl.textContent = 'Parent / Guardian (Not Configured)';
    if (parentPhoneEl) {
      parentPhoneEl.textContent = 'Please configure in Settings';
      parentPhoneEl.style.color = 'var(--text-subtle)';
    }
  }

  // 2. Emergency Contact
  const emgContact = dbService.getEmergencyContact();
  const emgNameEl = document.getElementById('emergency-contact-display-name');
  const emgRelEl = document.getElementById('emergency-contact-display-relation');
  const emgPhoneEl = document.getElementById('emergency-contact-display-phone');

  if (emgContact && emgContact.phone) {
    if (emgNameEl) emgNameEl.textContent = emgContact.name || 'Emergency Contact';
    if (emgRelEl) emgRelEl.textContent = emgContact.relation || 'Emergency Response';
    if (emgPhoneEl) {
      emgPhoneEl.textContent = isMasked ? dbService.maskPhoneNumber(emgContact.phone) : emgContact.phone;
      emgPhoneEl.style.color = '#fca5a5';
    }
  } else {
    if (emgNameEl) emgNameEl.textContent = 'Emergency Contact (Not Configured)';
    if (emgPhoneEl) {
      emgPhoneEl.textContent = 'Please configure in Settings';
      emgPhoneEl.style.color = 'var(--text-subtle)';
    }
  }
}

function initCallingHandlers() {
  const triggerParentCall = () => {
    const parentContact = dbService.getParentGuardianContact();
    if (!parentContact || !parentContact.phone) {
      showToast('No Parent/Guardian phone number configured. Please update in Settings.', 'warning');
      return;
    }
    openCallConfirmationModal({
      target: 'PARENT_GUARDIAN',
      name: parentContact.name || 'Parent / Guardian',
      phone: parentContact.phone,
      relation: parentContact.relation || 'Primary Guardian',
      vitalsSnapshot: latestTelemetry,
      patientId
    });
  };

  const triggerEmergencyCall = () => {
    const emgContact = dbService.getEmergencyContact();
    if (!emgContact || !emgContact.phone) {
      showToast('No Emergency Contact phone number configured. Please update in Settings.', 'warning');
      return;
    }
    openCallConfirmationModal({
      target: 'EMERGENCY_CONTACT',
      name: emgContact.name || 'Emergency Contact',
      phone: emgContact.phone,
      relation: emgContact.relation || 'Emergency Contact',
      vitalsSnapshot: latestTelemetry,
      patientId
    });
  };

  const btnCallParentTop = document.getElementById('btn-call-parent');
  const btnCallParentCard = document.getElementById('btn-card-call-parent');
  if (btnCallParentTop) btnCallParentTop.onclick = triggerParentCall;
  if (btnCallParentCard) btnCallParentCard.onclick = triggerParentCall;

  const btnCallEmgTop = document.getElementById('btn-call-emergency');
  const btnCallEmgCard = document.getElementById('btn-card-call-emergency');
  if (btnCallEmgTop) btnCallEmgTop.onclick = triggerEmergencyCall;
  if (btnCallEmgCard) btnCallEmgCard.onclick = triggerEmergencyCall;
}

function renderNotificationLogs(logs = []) {
  const tbody = document.getElementById('notif-history-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; color:var(--text-subtle); padding:var(--space-lg);">
          No health notifications dispatched yet. System nominal.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(item => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const zoneBadgeClass = item.zone === 'RED' ? 'emergency' : (item.zone === 'YELLOW' ? 'warning' : 'normal');
    
    // Status badge
    let statusClass = 'normal';
    if (item.status === 'SIMULATED') statusClass = 'warning';
    else if (item.status === 'SUPPRESSED') statusClass = 'normal';
    else if (item.status === 'FAILED') statusClass = 'emergency';

    const vitalsStr = `HR: ${item.vitals?.heartRate ?? '--'} BPM | ${item.vitals?.temperature ? item.vitals.temperature + '°C' : '--'}`;
    const recipientsStr = Array.isArray(item.recipients) && item.recipients.length 
      ? item.recipients.map(r => typeof r === 'string' ? r : `${r.name || 'Contact'} (${r.role || ''})`).join(', ')
      : 'Caregivers';

    const locationCell = item.mapsUrl && item.locationIncluded
      ? `<a href="${item.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan-primary); text-decoration:underline;">GPS Link</a>`
      : `<span style="color:var(--text-subtle); font-size:0.75rem;">${item.locationIncluded === false ? 'Suppressed (Privacy)' : 'N/A'}</span>`;

    return `
      <tr>
        <td style="font-family:monospace; font-size:0.78rem; color:var(--cyan-primary);">${item.id}</td>
        <td>
          <span class="status-badge ${zoneBadgeClass}">${item.zone} ZONE</span>
          <span class="status-badge ${statusClass}" style="margin-left:4px; font-size:0.65rem;">${item.status}</span>
        </td>
        <td style="font-weight:600; font-size:0.85rem;">${item.reason}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:#cbd5e1;">${vitalsStr}</td>
        <td style="font-size:0.8rem; color:#e2e8f0;">${recipientsStr}</td>
        <td>${locationCell}</td>
        <td><span class="source-badge ${item.dataSource === 'REAL' ? 'real' : 'demo'}" style="font-size:0.65rem;">${item.dataSource || 'DEMO'}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${timeStr}</td>
      </tr>
    `;
  }).join('');
}

function updateTelemetryView(payload) {
  if (!payload) return;

  const hrEl = document.getElementById('emg-val-hr');
  const spo2El = document.getElementById('emg-val-spo2');
  const tempEl = document.getElementById('emg-val-temp');
  const coordsEl = document.getElementById('emg-coords-text');
  const gmapsBtn = document.getElementById('btn-emg-gmaps');
  const sourceEl = document.getElementById('emg-source-text');

  if (hrEl) hrEl.textContent = payload.heartRate ?? '--';
  if (spo2El) spo2El.textContent = payload.spo2 ?? '--';
  if (tempEl) tempEl.textContent = (typeof payload.temperature === 'number') ? payload.temperature.toFixed(1) : (payload.temperature ?? '--');

  if (coordsEl && payload.latitude && payload.longitude) {
    coordsEl.textContent = `${payload.latitude.toFixed(4)}° N, ${payload.longitude.toFixed(4)}° E`;
    if (gmapsBtn) gmapsBtn.href = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
  }
  if (sourceEl && payload.locationSource) {
    sourceEl.textContent = payload.locationSource;
  }
}

function renderIncidentView() {
  const banner = document.getElementById('active-emergency-container');
  const typeEl = document.getElementById('active-emg-type');
  const reasonEl = document.getElementById('active-emg-reason');
  const timeBadge = document.getElementById('emg-timestamp-badge');
  const tbody = document.getElementById('emg-history-tbody');

  // Find unresolved emergency (TRIGGERED or ACKNOWLEDGED)
  activeIncident = currentEmergencies.find(e => e.status === 'TRIGGERED' || e.status === 'ACKNOWLEDGED');

  if (activeIncident && banner) {
    banner.style.display = 'flex';
    banner.className = `emergency-alert-banner ${activeIncident.status === 'TRIGGERED' ? 'active' : ''}`;
    if (typeEl) typeEl.textContent = activeIncident.eventType.replace('_', ' ');
    if (reasonEl) reasonEl.textContent = activeIncident.reason || 'Telemetry anomaly triggered automatic alert.';
    if (timeBadge) {
      timeBadge.className = 'status-badge emergency';
      timeBadge.textContent = activeIncident.status;
    }

    const ackBtn = document.getElementById('btn-acknowledge-emg');
    if (ackBtn) {
      if (activeIncident.status === 'ACKNOWLEDGED') {
        ackBtn.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;"></i><span>Acknowledged by ${activeIncident.acknowledgedBy || 'Caregiver'}</span>`;
        ackBtn.disabled = true;
      } else {
        ackBtn.innerHTML = `<i data-lucide="check-circle" style="width:14px;height:14px;"></i><span>Acknowledge Incident</span>`;
        ackBtn.disabled = false;
        ackBtn.onclick = () => handleAcknowledge(activeIncident.eventId);
      }
    }
  } else if (banner) {
    banner.style.display = 'none';
    if (timeBadge) {
      timeBadge.className = 'status-badge normal';
      timeBadge.textContent = 'All Clear';
    }
  }

  // Populate Table
  if (tbody) {
    if (currentEmergencies.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color:var(--text-subtle); padding:var(--space-lg);">
            No emergency incidents recorded. System stable.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = currentEmergencies.map(e => {
        const timeStr = new Date(e.timestamp).toLocaleString();
        const statusBadgeClass = e.status === 'RESOLVED' ? 'normal' : (e.status === 'ACKNOWLEDGED' ? 'warning' : 'emergency');
        const caregiverAction = e.status === 'RESOLVED' 
          ? `Resolved by ${e.resolvedBy || 'Physician'} (${e.resolutionNotes || 'Nominal'})`
          : (e.status === 'ACKNOWLEDGED' ? `Ack by ${e.acknowledgedBy || 'Caregiver'}` : 'Pending Caregiver');

        return `
          <tr>
            <td style="font-family:monospace; font-size:0.8rem; color:var(--cyan-primary);">${e.eventId}</td>
            <td><span class="status-badge ${statusBadgeClass}">${e.eventType}</span></td>
            <td style="font-weight:600;">${e.reason}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${timeStr}</td>
            <td style="font-size:0.85rem; color:#cbd5e1;">${caregiverAction}</td>
            <td><span class="status-badge ${statusBadgeClass}">${e.status}</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

async function handleAcknowledge(eventId) {
  await dbService.acknowledgeEmergency(patientId, eventId, 'Primary Caregiver');
  showToast('Emergency incident acknowledged. Caregiver response registered.', 'success');
}

function initResolutionModal() {
  const modal = document.getElementById('resolve-modal');
  const openBtn = document.getElementById('btn-resolve-emg');
  const closeBtn = document.getElementById('modal-close-resolve');
  const cancelBtn = document.getElementById('modal-cancel-resolve');
  const submitBtn = document.getElementById('modal-submit-resolve');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (!activeIncident) {
        showToast('No active incident to resolve.', 'info');
        return;
      }
      modal.showModal();
    });
  }

  const closeModal = () => modal.close();
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const resolverName = document.getElementById('resolver-name').value || 'Primary Caregiver';
      const notes = document.getElementById('resolver-notes').value || 'Patient vitals restabilized.';

      if (activeIncident) {
        await dbService.resolveEmergency(patientId, activeIncident.eventId, resolverName, notes);
        showToast('Incident marked as Resolved and recorded in audit log.', 'success');
      }

      closeModal();
    });
  }
}

function initSosButton() {
  const sosModal = initSosModal(async () => {
    await dbService.recordEmergency(patientId, {
      eventType: 'MANUAL_SOS',
      reason: 'Deliberate SOS trigger pressed in Emergency Center',
      vitalsAtEvent: {
        heartRate: latestTelemetry.heartRate || 120,
        spo2: latestTelemetry.spo2 || 92,
        temperature: latestTelemetry.temperature || 36.8
      },
      latitude: 24.7955,
      longitude: 84.9995,
      locationSource: 'EMERGENCY_CENTER_SOS',
      timestamp: Date.now()
    });
    showToast('MANUAL SOS DISPATCHED TO CAREGIVERS!', 'error', 7000);
  });

  const btn = document.getElementById('btn-manual-sos');
  if (btn) {
    btn.addEventListener('click', () => sosModal.open());
  }
}

