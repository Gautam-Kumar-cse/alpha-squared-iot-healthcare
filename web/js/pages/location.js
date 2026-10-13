/**
 * ALPHA SQUARED - Live Location & Geospatial Tracking Controller
 * 
 * Implements real-time browser Geolocation tracking via watchPosition(),
 * interactive Leaflet radar map with animated accuracy pulse,
 * and strict separation from remote wearable ESP32 NEO-6M hardware GPS.
 * 
 * Strictly adheres to rule: NO hardcoded or fake locations for live tracking.
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { dbService } from '../services/db-service.js';
import { hardwareApiService } from '../services/hardware-api-service.js';
import { showToast } from '../components/notification-toast.js';

let leafletMap = null;
let userMarker = null;
let userAccuracyCircle = null;
let watchId = null;
let isTracking = false;

const patientId = 'PATIENT-001';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('location');
  initParticleBackground('bg-canvas');

  initMapInstance();
  initTrackingControls();
  initHardwareGpsSubscription();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

/**
 * Initialize Leaflet Map with Dark Tile Layer
 */
function initMapInstance() {
  const mapElement = document.getElementById('leaflet-map');
  if (!mapElement || typeof window.L === 'undefined') return;

  try {
    // Default neutral center (view over India/Asia before user fixes position)
    leafletMap = window.L.map('leaflet-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([20.5937, 78.9629], 5);

    // Dark Matter CartoDB Basemap
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(leafletMap);

  } catch (err) {
    console.warn('Leaflet initialization warning:', err);
  }
}

/**
 * Wire up User Action Buttons
 */
function initTrackingControls() {
  const btnStart = document.getElementById('btn-start-live-tracking');
  const btnOverlayStart = document.getElementById('btn-overlay-start-tracking');
  const btnRefresh = document.getElementById('btn-refresh-location');
  const btnStop = document.getElementById('btn-stop-tracking');

  if (btnStart) btnStart.addEventListener('click', startLiveTracking);
  if (btnOverlayStart) btnOverlayStart.addEventListener('click', startLiveTracking);
  if (btnRefresh) btnRefresh.addEventListener('click', refreshSinglePosition);
  if (btnStop) btnStop.addEventListener('click', stopLiveTracking);
}

/**
 * Start Live Movement Tracking via navigator.geolocation.watchPosition
 */
function startLiveTracking() {
  if (!navigator.geolocation) {
    showAlert('Geolocation is not supported by your browser or environment.', 'error');
    showToast('Browser does not support Geolocation API.', 'error');
    return;
  }

  showAlert('Requesting device location permission...', 'info');
  updateTrackingUiState(true);

  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  // 1. Initial single fix to center immediately
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onLocationSuccess(pos);
      showAlert('Location permission granted. Live tracking active.', 'success');
      showToast('Live location acquired. Streaming updates via watchPosition.', 'success');

      // 2. Continuous watchPosition
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        options
      );
    },
    (err) => {
      onLocationError(err);
    },
    options
  );
}

/**
 * One-off Position Refresh
 */
function refreshSinglePosition() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported.', 'error');
    return;
  }

  showToast('Refreshing current coordinates...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onLocationSuccess(pos);
      showToast('Location refreshed successfully.', 'success');
    },
    (err) => {
      onLocationError(err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * Handle Successful Geolocation Position
 */
function onLocationSuccess(position) {
  const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
  const timestamp = position.timestamp || Date.now();

  hideStandbyOverlay();

  // 1. Update Inspector Cards
  const latEl = document.getElementById('inspect-lat');
  const lngEl = document.getElementById('inspect-lng');
  const accEl = document.getElementById('inspect-accuracy');
  const accDetail = document.getElementById('inspect-accuracy-detail');
  const sourceEl = document.getElementById('inspect-source');
  const speedEl = document.getElementById('inspect-speed');
  const altEl = document.getElementById('inspect-altitude');
  const timeEl = document.getElementById('inspect-time');
  const coordsPill = document.getElementById('map-coords-pill');
  const coordsText = document.getElementById('embed-coords-text');
  const gmapsLink = document.getElementById('btn-launch-gmaps');
  const sourceBadge = document.getElementById('loc-source-badge');

  if (latEl) latEl.textContent = `${latitude.toFixed(5)}°`;
  if (lngEl) lngEl.textContent = `${longitude.toFixed(5)}°`;
  if (accEl) accEl.textContent = `± ${accuracy.toFixed(1)} m`;
  if (accDetail) {
    accDetail.textContent = accuracy <= 15 ? 'High Accuracy GPS Fix' : 'Standard Cell/Wi-Fi Fix';
  }
  if (sourceEl) sourceEl.textContent = 'BROWSER_GEOLOCATION (Live)';
  if (speedEl) {
    const kmh = speed != null ? (speed * 3.6).toFixed(1) : '0.0';
    speedEl.textContent = `${kmh} km/h ${heading != null ? `(${Math.round(heading)}°)` : ''}`;
  }
  if (altEl) {
    altEl.textContent = altitude != null ? `${altitude.toFixed(1)} m MSL` : 'Unavailable';
  }
  if (timeEl) {
    timeEl.textContent = new Date(timestamp).toLocaleTimeString();
  }

  if (coordsPill) coordsPill.style.display = 'block';
  if (coordsText) coordsText.textContent = `${latitude.toFixed(5)}° N, ${longitude.toFixed(5)}° E`;

  if (gmapsLink) {
    gmapsLink.href = `https://maps.google.com/?q=${latitude},${longitude}`;
    gmapsLink.style.display = 'inline-flex';
  }

  if (sourceBadge) {
    sourceBadge.className = 'status-badge normal';
    sourceBadge.textContent = 'BROWSER GPS LOCKED';
  }

  // 2. Update Leaflet Map Marker & Accuracy Circle
  if (leafletMap && typeof window.L !== 'undefined') {
    const latLng = [latitude, longitude];

    // Auto-create or move accuracy circle
    if (!userAccuracyCircle) {
      userAccuracyCircle = window.L.circle(latLng, {
        radius: accuracy,
        color: '#00f0ff',
        weight: 1,
        fillColor: '#00f0ff',
        fillOpacity: 0.12
      }).addTo(leafletMap);
    } else {
      userAccuracyCircle.setLatLng(latLng);
      userAccuracyCircle.setRadius(accuracy);
    }

    // Auto-create or move custom Cyber Marker
    if (!userMarker) {
      const cyberIcon = window.L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="position:relative; width:28px; height:28px;">
            <div style="position:absolute; inset:0; border-radius:50%; background:rgba(0,240,255,0.3); animation:pulse 2s infinite;"></div>
            <div style="position:absolute; inset:4px; border-radius:50%; background:#00f0ff; border:2px solid #ffffff; box-shadow:0 0 10px #00f0ff;"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      userMarker = window.L.marker(latLng, { icon: cyberIcon }).addTo(leafletMap);
      userMarker.bindPopup(`
        <div style="font-family:sans-serif; color:#0f172a; font-size:12px; padding:2px;">
          <strong style="color:#0284c7;">Current Visitor Position</strong><br>
          Accuracy: &plusmn;${accuracy.toFixed(1)} meters<br>
          Updated: ${new Date(timestamp).toLocaleTimeString()}
        </div>
      `);
      leafletMap.setView(latLng, 16);
    } else {
      userMarker.setLatLng(latLng);
      // Pan to new location smoothly
      leafletMap.panTo(latLng);
    }
  }
}

/**
 * Handle Geolocation Errors Gracefully
 */
function onLocationError(err) {
  let msg = 'Failed to acquire location.';
  switch (err.code) {
    case 1: // PERMISSION_DENIED
      msg = 'Location permission denied. Please allow location permissions in your browser address bar to track your position.';
      break;
    case 2: // POSITION_UNAVAILABLE
      msg = 'Position unavailable. GPS or network location service could not determine your position.';
      break;
    case 3: // TIMEOUT
      msg = 'Location request timed out. Retrying in background...';
      break;
    default:
      msg = err.message || 'Unknown geolocation error.';
      break;
  }

  showAlert(msg, 'warning');
  showToast(msg, 'error');

  const sourceBadge = document.getElementById('loc-source-badge');
  if (sourceBadge) {
    sourceBadge.className = 'status-badge emergency';
    sourceBadge.textContent = 'PERMISSION / GPS ERROR';
  }
}

/**
 * Stop Live Tracking
 */
function stopLiveTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  updateTrackingUiState(false);
  showToast('Live position tracking paused.', 'info');
}

function updateTrackingUiState(tracking) {
  isTracking = tracking;
  const btnStart = document.getElementById('btn-start-live-tracking');
  const btnStop = document.getElementById('btn-stop-tracking');
  const watchIndicator = document.getElementById('loc-watch-indicator');
  const label = document.getElementById('label-start-tracking');

  if (tracking) {
    if (btnStart) btnStart.style.display = 'none';
    if (btnStop) btnStop.style.display = 'inline-flex';
    if (watchIndicator) watchIndicator.style.display = 'inline-block';
  } else {
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
    if (watchIndicator) watchIndicator.style.display = 'none';
    if (label) label.textContent = 'Track My Live Location';
  }
}

function hideStandbyOverlay() {
  const overlay = document.getElementById('map-standby-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showAlert(message, type = 'info') {
  const alertEl = document.getElementById('loc-status-alert');
  if (!alertEl) return;

  alertEl.style.display = 'block';
  alertEl.textContent = message;

  if (type === 'error' || type === 'warning') {
    alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
    alertEl.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    alertEl.style.color = '#fca5a5';
  } else if (type === 'success') {
    alertEl.style.background = 'rgba(16, 185, 129, 0.15)';
    alertEl.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    alertEl.style.color = '#86efac';
  } else {
    alertEl.style.background = 'rgba(0, 240, 255, 0.1)';
    alertEl.style.border = '1px solid var(--border-cyan)';
    alertEl.style.color = '#38bdf8';
  }
}

/**
 * Separate Hardware GPS Telemetry Subscription
 */
function initHardwareGpsSubscription() {
  // Listen to remote patient hardware telemetry from RTDB / store
  dbService.subscribeToPatientCurrent(patientId, (current) => {
    updateHardwareGpsCard(current);
  });
}

function updateHardwareGpsCard(payload) {
  const badge = document.getElementById('hw-gps-state-badge');
  const text = document.getElementById('hw-gps-coords-text');

  if (!payload || !payload.latitude || !payload.longitude || payload.locationSource?.includes('BROWSER')) {
    if (badge) {
      badge.className = 'status-badge normal';
      badge.textContent = 'STANDBY';
    }
    if (text) {
      text.textContent = 'Awaiting satellite fix from patient wearable (NEO-6M)...';
    }
    return;
  }

  if (badge) {
    badge.className = 'status-badge normal';
    badge.textContent = 'HARDWARE GPS LOCKED';
  }
  if (text) {
    const lat = Number(payload.latitude).toFixed(4);
    const lng = Number(payload.longitude).toFixed(4);
    text.textContent = `Patient GPS: ${lat}° N, ${lng}° E (NEO-6M Module Fix)`;
    text.style.color = '#34d399';
  }
}
