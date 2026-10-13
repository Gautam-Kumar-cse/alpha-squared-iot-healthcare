/**
 * ALPHA SQUARED - Parent & Emergency Call Confirmation Modal
 * Two-step confirmation flow before launching native device dialer (tel:)
 * Audits call attempts and prevents silent or fake auto-calling.
 */

import { dbService } from '../services/db-service.js';
import { showToast } from './notification-toast.js';

let modalInstance = null;

export function ensureCallModal() {
  if (modalInstance) return modalInstance;

  let modal = document.getElementById('call-confirmation-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'call-confirmation-modal';
    modal.className = 'custom-modal';
    modal.setAttribute('aria-labelledby', 'call-modal-title');
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title" id="call-modal-title" style="display:flex; align-items:center; gap:0.5rem;">
          <i data-lucide="phone-outgoing" style="width:20px;height:20px;color:var(--cyan-primary);" id="call-modal-icon"></i>
          <span id="call-modal-heading">CALL CONFIRMATION</span>
        </div>
        <button type="button" class="modal-close-btn" id="call-modal-close" aria-label="Cancel call">&times;</button>
      </div>

      <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--space-md);">
        <!-- Call Target Details Card -->
        <div class="glass-panel" style="padding:var(--space-md); border-color:rgba(0, 240, 255, 0.3); background:rgba(6, 12, 24, 0.75);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
            <span class="status-badge normal" id="call-modal-role-badge">PARENT / GUARDIAN</span>
            <button type="button" id="call-modal-toggle-mask" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.75rem;">
              <span id="call-modal-mask-label">Show Full Number</span>
            </button>
          </div>

          <div style="font-size:1.2rem; font-weight:800; color:var(--text-main); margin-bottom:2px;" id="call-modal-contact-name">
            Contact Name
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;" id="call-modal-contact-relation">
            Primary Guardian
          </div>

          <div style="font-family:var(--font-mono); font-size:1.1rem; color:var(--cyan-primary); font-weight:700; background:rgba(0,0,0,0.4); padding:6px 10px; border-radius:4px; display:inline-block;" id="call-modal-contact-phone">
            +91 ••••• ••000
          </div>
        </div>

        <!-- Vitals Snapshot Context (if present) -->
        <div id="call-modal-vitals-box" style="display:none; background:rgba(239, 68, 68, 0.08); border-left:3px solid #ef4444; padding:0.5rem 0.75rem; border-radius:4px; font-size:0.8rem;">
          <strong style="color:#fca5a5;">Current Patient Vitals Snapshot:</strong>
          <div id="call-modal-vitals-text" style="color:#e2e8f0; margin-top:2px;">HR: -- BPM | Temp: -- °C</div>
        </div>

        <!-- Privacy & Protocol Notice -->
        <div style="font-size:0.775rem; color:var(--text-subtle); line-height:1.45; border-left:2px solid var(--border-subtle); padding-left:0.5rem;">
          <strong>DIALER PROTOCOL:</strong> Clicking <em>Launch Dialer</em> opens your device's native telephone application (<code style="color:var(--cyan-primary);">tel:</code> link). ALPHA SQUARED never auto-dials without confirmation and never simulates connected audio. Complete and terminate the call directly on your cellular phone.
        </div>
      </div>

      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:var(--space-sm);">
        <button type="button" class="btn btn-secondary" id="call-modal-btn-cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" id="call-modal-btn-confirm" style="background:#0ea5e9; border-color:#0284c7;">
          <i data-lucide="phone" style="width:16px;height:16px;"></i>
          <span id="call-modal-confirm-label">Confirm &amp; Launch Dialer</span>
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modalInstance = modal;
  return modalInstance;
}

export function openCallConfirmationModal({
  target = 'PARENT_GUARDIAN', // PARENT_GUARDIAN or EMERGENCY_CONTACT
  name = '',
  phone = '',
  relation = '',
  vitalsSnapshot = null,
  patientId = 'PATIENT-001',
  onComplete = null
} = {}) {
  const modal = ensureCallModal();

  const titleEl = document.getElementById('call-modal-heading');
  const roleBadge = document.getElementById('call-modal-role-badge');
  const nameEl = document.getElementById('call-modal-contact-name');
  const relationEl = document.getElementById('call-modal-contact-relation');
  const phoneEl = document.getElementById('call-modal-contact-phone');
  const vitalsBox = document.getElementById('call-modal-vitals-box');
  const vitalsText = document.getElementById('call-modal-vitals-text');
  const maskToggleBtn = document.getElementById('call-modal-toggle-mask');
  const maskLabel = document.getElementById('call-modal-mask-label');
  const confirmBtn = document.getElementById('call-modal-btn-confirm');
  const cancelBtn = document.getElementById('call-modal-btn-cancel');
  const closeBtn = document.getElementById('call-modal-close');

  const isEmergency = target === 'EMERGENCY_CONTACT';

  if (titleEl) {
    titleEl.textContent = isEmergency ? 'EMERGENCY CALL CONFIRMATION' : 'PARENT / GUARDIAN CALL CONFIRMATION';
  }
  if (roleBadge) {
    roleBadge.textContent = isEmergency ? 'EMERGENCY CONTACT' : 'PARENT / GUARDIAN';
    roleBadge.className = isEmergency ? 'status-badge emergency' : 'status-badge normal';
  }

  const finalName = name || (isEmergency ? 'Emergency Response Contact' : 'Parent / Guardian');
  const finalRelation = relation || (isEmergency ? 'Emergency Contact / Services' : 'Family Member / Primary Caregiver');
  const rawPhone = phone || '';

  if (nameEl) nameEl.textContent = finalName;
  if (relationEl) relationEl.textContent = finalRelation;

  // Phone masking state
  let isMasked = true;
  function updatePhoneDisplay() {
    if (!phoneEl) return;
    if (!rawPhone) {
      phoneEl.textContent = 'No phone number configured';
      phoneEl.style.color = '#ef4444';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    if (confirmBtn) confirmBtn.disabled = false;
    phoneEl.style.color = 'var(--cyan-primary)';
    phoneEl.textContent = isMasked ? dbService.maskPhoneNumber(rawPhone) : rawPhone;
    if (maskLabel) {
      maskLabel.textContent = isMasked ? 'Show Full Number' : 'Mask Number';
    }
  }
  updatePhoneDisplay();

  if (maskToggleBtn) {
    maskToggleBtn.onclick = (e) => {
      e.preventDefault();
      isMasked = !isMasked;
      updatePhoneDisplay();
    };
  }

  // Vitals Snapshot
  if (vitalsBox && vitalsText) {
    if (vitalsSnapshot && (vitalsSnapshot.heartRate || vitalsSnapshot.temperature)) {
      vitalsBox.style.display = 'block';
      const hr = vitalsSnapshot.heartRate ? `${vitalsSnapshot.heartRate} BPM` : '--';
      const temp = vitalsSnapshot.temperature ? `${vitalsSnapshot.temperature} °C` : '--';
      vitalsText.textContent = `Heart Rate: ${hr} | Body Temp: ${temp}`;
    } else {
      vitalsBox.style.display = 'none';
    }
  }

  const cleanupListeners = () => {
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
    modal.oncancel = null;
  };

  const closeModal = () => {
    cleanupListeners();
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.removeAttribute('open');
    }
  };

  const handleConfirm = () => {
    if (!rawPhone) {
      showToast('Cannot call: No valid phone number provided in settings.', 'error');
      closeModal();
      return;
    }

    const sanitizedPhone = rawPhone.replace(/[^\d+]/g, '');

    // Record in database audit log
    dbService.recordCallAction(patientId, {
      target,
      name: finalName,
      phone: rawPhone,
      relation: finalRelation,
      confirmed: true,
      status: 'DIALER_LAUNCHED',
      vitalsSnapshot
    });

    closeModal();
    showToast(`Launching device dialer for ${finalName}... Complete call on your phone.`, 'info', 5000);

    // Launch native telephone dialer
    window.location.href = `tel:${sanitizedPhone}`;

    if (typeof onComplete === 'function') {
      onComplete({ confirmed: true, phone: sanitizedPhone });
    }
  };

  const handleCancel = () => {
    dbService.recordCallAction(patientId, {
      target,
      name: finalName,
      phone: rawPhone,
      relation: finalRelation,
      confirmed: false,
      status: 'CANCELLED',
      vitalsSnapshot
    });
    closeModal();
    if (typeof onComplete === 'function') {
      onComplete({ confirmed: false });
    }
  };

  confirmBtn.onclick = handleConfirm;
  cancelBtn.onclick = handleCancel;
  closeBtn.onclick = handleCancel;
  modal.oncancel = handleCancel;

  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
