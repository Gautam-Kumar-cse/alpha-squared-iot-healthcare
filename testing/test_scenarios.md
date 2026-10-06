# ALPHA SQUARED — Quality Assurance & Test Verification Matrix
**Team Alpha Squared &bull; Government Polytechnic Gaya**

This document details test procedures, expected behaviors, and verification results across all system layers.

---

## Scenario 1: Authentication & Password Security
- **Test Objective:** Verify that patients/caregivers can sign in and register, and passwords are never stored in plaintext.
- **Steps:**
  1. Open `login.html`.
  2. Input demo credentials: `doctor@alphasquared.org` / `AlphaSquared@2026`.
  3. Verify successful redirection to `dashboard.html`.
  4. Inspect `localStorage.getItem('alphasquared_registered_users')`.
- **Expected Outcome:** Password is stored as a salted SHA-256 cryptographic digest; plaintext password is never persisted.

---

## Scenario 2: Realtime Dashboard Telemetry Updates
- **Test Objective:** Ensure vital biometrics update dynamically without requiring page reloads.
- **Steps:**
  1. Navigate to `dashboard.html`.
  2. Click **Demo Mode** or activate in `settings.html`.
  3. Observe the Heart Rate, SpO2, and Body Temperature cards.
- **Expected Outcome:** Values and timestamps update every 2.5-3 seconds; trend lines in Chart.js shift smoothly in real-time.

---

## Scenario 3: Threshold Breach (Tachycardia & Hypoxia)
- **Test Objective:** Verify physiological threshold detection and visual warning/emergency badges.
- **Steps:**
  1. Navigate to `settings.html`.
  2. Select **Scenario 3: Critical Hypoxia (SpO2 < 90%)** and click **Inject Scenario Now**.
  3. Return to `dashboard.html`.
- **Expected Outcome:**
  - Overall status changes to **EMERGENCY** (crimson halo).
  - SpO2 card highlights with pulsing border and displays `CRITICAL HYPOXIA`.
  - Notification toast appears: `🚨 EMERGENCY TRIGGERED`.

---

## Scenario 4: Autonomous Fall Detection
- **Test Objective:** Verify IMU jerk/free-fall trigger handling.
- **Steps:**
  1. In `settings.html`, select **Scenario 4: Sudden Fall Impact**.
  2. Click **Inject Scenario Now**.
- **Expected Outcome:**
  - Fall detector card switches to **FALL DETECTED! (IMPACT CONFIRMED)**.
  - Incident is automatically registered in the Emergency Center audit trail (`emergency.html`).

---

## Scenario 5: Manual Two-Step SOS Confirmation
- **Test Objective:** Ensure SOS trigger requires deliberate confirmation and cannot be triggered accidentally.
- **Steps:**
  1. On any page, click the prominent **TRANSMIT SOS** button.
  2. Observe the accessible modal dialog and audible alert tone.
  3. Click **Cancel (False Alarm)** &rarr; Verify no emergency is sent.
  4. Click **TRANSMIT SOS** again and click **Confirm & Transmit SOS**.
- **Expected Outcome:**
  - Audio alert sounds.
  - Emergency event is immediately broadcast to Firebase RTDB.
  - Caregiver notification email payload is dispatched to `/api/alerts/send-emergency-email`.
  - Incident appears in `emergency.html` with status `TRIGGERED`.

---

## Scenario 6: Caregiver Incident Acknowledgement & Resolution
- **Test Objective:** Verify audit trail tracking of caregiver response.
- **Steps:**
  1. Open `emergency.html` during an active incident.
  2. Click **Acknowledge Incident** &rarr; Verify status changes to `ACKNOWLEDGED`.
  3. Click **Mark Resolved** &rarr; Enter clinical notes &rarr; Click **Confirm Resolution**.
- **Expected Outcome:** Emergency alert banner clears; permanent audit log records caregiver name, timestamp, and notes.

---

## Scenario 7: GPS Coordinates & Browser Fallback
- **Test Objective:** Verify device GPS mapping with browser fallback.
- **Steps:**
  1. Open `location.html`.
  2. Observe default device coordinates (`24.7955° N, 84.9995° E`).
  3. Click **Use Browser Geolocation Fallback**.
  4. Grant browser location permission.
- **Expected Outcome:** Location updates with precise browser lat/long and source tag `BROWSER_GEOLOCATION_FALLBACK`.

