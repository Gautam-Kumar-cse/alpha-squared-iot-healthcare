/**
 * ALPHA SQUARED - Notification Toast Helper
 */

export function showToast(message, type = 'info', durationMs = 4500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('role', 'status');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconName = type === 'error' ? 'alert-triangle' : (type === 'success' ? 'check-circle' : 'info');

  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.5rem;">
      <i data-lucide="${iconName}" style="width:18px;height:18px;"></i>
      <span>${message}</span>
    </div>
    <button class="toast-close" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:1.1rem;line-height:1;" aria-label="Close Notification">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger Lucide icons if available
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: toast });
  }

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const closeToast = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', closeToast);

  if (durationMs > 0) {
    setTimeout(closeToast, durationMs);
  }

  return toast;
}

