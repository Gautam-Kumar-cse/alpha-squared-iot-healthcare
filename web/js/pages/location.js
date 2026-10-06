/**
 * ALPHA SQUARED - Live Location Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { showToast } from '../components/notification-toast.js';

const patientId = 'PATIENT-001';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('location');
  initParticleBackground('bg-canvas');

  // Subscribe to live telemetry location
  dbService.subscribeToPatientCurrent(patientId, (current) => {
    updateLocationDisplay(current);
  });

  // Browser Geolocation Fallback Handler
  const fallbackBtn = document.getElementById('btn-request-browser-loc');
  if (fallbackBtn) {
    fallbackBtn.addEventListener('click', handleBrowserFallback);
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function updateLocationDisplay(payload) {
  const latEl = document.getElementById('inspect-lat');
  const lngEl = document.getElementById('inspect-lng');
  const sourceEl = document.getElementById('inspect-source');
  const sourceBadge = document.getElementById('loc-source-badge');
  const timeEl = document.getElementById('inspect-time');
  const embedText = document.getElementById('embed-coords-text');
  const gmapsLink = document.getElementById('btn-launch-gmaps');
  const iframe = document.getElementById('gmaps-embed-frame');

  if (!payload || !payload.latitude || !payload.longitude) {
    if (latEl) latEl.textContent = 'Unavailable';
    if (lngEl) lngEl.textContent = 'Unavailable';
    if (sourceEl) sourceEl.textContent = 'NO GPS FIX';
    if (sourceBadge) {
      sourceBadge.className = 'status-badge warning';
      sourceBadge.textContent = 'SEARCHING FOR SATELLITES';
    }
    return;
  }

  const lat = payload.latitude;
  const lng = payload.longitude;
  const source = payload.locationSource || 'DEVICE_GPS';

  if (latEl) latEl.textContent = `${lat.toFixed(4)}°`;
  if (lngEl) lngEl.textContent = `${lng.toFixed(4)}°`;
  if (embedText) embedText.textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

  if (sourceEl) sourceEl.textContent = source;
  if (sourceBadge) {
    sourceBadge.className = source.includes('BROWSER') ? 'status-badge warning' : 'status-badge normal';
    sourceBadge.textContent = source;
  }

  if (timeEl) {
    const d = new Date(payload.timestamp || Date.now());
    timeEl.textContent = d.toLocaleTimeString();
  }

  if (gmapsLink) {
    gmapsLink.href = `https://maps.google.com/?q=${lat},${lng}`;
  }

  if (iframe) {
    iframe.src = `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=15&output=embed`;
  }
}

function handleBrowserFallback() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.', 'error');
    return;
  }

  showToast('Requesting browser geolocation permission...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      updateLocationDisplay({
        latitude: lat,
        longitude: lng,
        locationSource: 'BROWSER_GEOLOCATION_FALLBACK',
        timestamp: Date.now()
      });

      // Update current in DB
      dbService.updateCurrentTelemetry(patientId, {
        latitude: lat,
        longitude: lng,
        locationSource: 'BROWSER_GEOLOCATION_FALLBACK',
        timestamp: Date.now()
      });

      showToast(`Location acquired via Browser: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success');
    },
    (err) => {
      showToast(`Browser location permission denied: ${err.message}`, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

