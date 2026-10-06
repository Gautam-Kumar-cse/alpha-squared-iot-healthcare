/**
 * ALPHA SQUARED - Emergency Center Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { initSosModal } from '../components/sos-modal.js';
import { showToast } from '../components/notification-toast.js';

let currentEmergencies = [];
let activeIncident = null;
const patientId = 'PATIENT-001';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('emergency');
  initParticleBackground('bg-canvas');

  initSosButton();
  initResolutionModal();

  // Subscribe to live telemetry
  dbService.subscribeToPatientCurrent(patientId, (current) => {
    updateTelemetryView(current);
  });

  // Subscribe to emergency incident log
  dbService.subscribeToEmergencies(patientId, (list) => {
    currentEmergencies = list || [];
    renderIncidentView();
  });

  const refreshBtn = document.getElementById('btn-refresh-history');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderIncidentView();
      showToast('Incident audit log refreshed.', 'info');
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

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
  await dbService.acknowledgeEmergency(patientId, eventId, 'Dr. Ramesh Sharma');
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
      const resolverName = document.getElementById('resolver-name').value || 'Dr. Ramesh Sharma';
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
        heartRate: 120,
        spo2: 92,
        temperature: 36.8
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

