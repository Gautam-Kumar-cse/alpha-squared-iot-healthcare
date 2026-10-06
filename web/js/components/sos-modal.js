/**
 * ALPHA SQUARED - Deliberate Two-Step SOS Confirmation Modal
 * Uses native <dialog> with Web Audio synthesis alert tone.
 */

let audioCtx = null;

function playAlertTone(type = 'sos') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(type === 'sos' ? 880 : 440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(type === 'sos' ? 440 : 880, audioCtx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.36);
  } catch (err) {
    console.warn('Audio tone could not be played:', err);
  }
}

export function initSosModal(onConfirmCallback) {
  let modal = document.getElementById('sos-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'sos-modal';
    modal.className = 'custom-modal';
    modal.innerHTML = `
      <div class="modal-header" style="border-bottom-color: rgba(255, 0, 85, 0.4); background: rgba(255, 0, 85, 0.08);">
        <div class="modal-title" style="color: #ff4d79;">
          <i data-lucide="alert-triangle" style="width:20px;height:20px;color:#ff0055;"></i>
          <span>DELIBERATE SOS CONFIRMATION</span>
        </div>
        <button type="button" class="modal-close-btn" id="sos-modal-cancel" aria-label="Cancel SOS">&times;</button>
      </div>

      <div class="modal-body">
        <p style="color:#f8fafc; font-weight:600; font-size:1.05rem;">
          You are about to transmit a CRITICAL EMERGENCY SIGNAL to primary &amp; secondary emergency contacts.
        </p>
        <p>
          This event will be logged in the permanent audit trail, timestamped with current GPS coordinates, and sent to hospital/caregiver dispatch.
        </p>
        <div style="background:rgba(255, 0, 85, 0.1); border:1px solid rgba(255, 0, 85, 0.3); border-radius:6px; padding:0.75rem 1rem;">
          <div style="font-size:0.8rem; text-transform:uppercase; color:#ff4d79; font-weight:700; letter-spacing:0.05em; margin-bottom:0.25rem;">
            Emergency Protocol Checklist:
          </div>
          <ul style="font-size:0.85rem; color:#cbd5e1; padding-left:1.2rem; line-height:1.5;">
            <li>Current vitals snapshot will be attached</li>
            <li>Emergency Caregiver will receive instant notification</li>
            <li>Real-time tracking link will be broadcast</li>
          </ul>
        </div>
      </div>

      <div class="modal-footer" style="justify-content: space-between;">
        <button type="button" class="btn btn-secondary" id="sos-modal-abort-btn">
          Cancel (False Alarm)
        </button>
        <button type="button" class="btn btn-danger" id="sos-modal-confirm-btn" style="background:linear-gradient(135deg, #ff0055, #b3003b);">
          <i data-lucide="bell-ring" style="width:18px;height:18px;"></i>
          <span>Confirm &amp; Transmit SOS</span>
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }
  }

  const cancelBtn1 = modal.querySelector('#sos-modal-cancel');
  const cancelBtn2 = modal.querySelector('#sos-modal-abort-btn');
  const confirmBtn = modal.querySelector('#sos-modal-confirm-btn');

  const closeModal = () => {
    modal.close();
  };

  cancelBtn1.onclick = closeModal;
  cancelBtn2.onclick = closeModal;

  confirmBtn.onclick = () => {
    closeModal();
    playAlertTone('sos');
    if (typeof onConfirmCallback === 'function') {
      onConfirmCallback({
        type: 'MANUAL_SOS',
        timestamp: Date.now(),
        reason: 'Deliberate SOS button pressed by patient/caregiver'
      });
    }
  };

  return {
    open: () => {
      playAlertTone('warning');
      modal.showModal();
    },
    close: closeModal
  };
}

