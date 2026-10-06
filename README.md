# ALPHA SQUARED — IoT Smart Health & Emergency Detection System

**Team Alpha Squared &bull; Government Polytechnic Gaya, Bihar**  
*Department of State Board of Technical Education, Bihar*

ALPHA SQUARED is a high-reliability, real-time IoT healthcare and emergency response platform connecting an ESP32 wearable edge node to a responsive cloud telemetry console. It delivers continuous vital signs monitoring (Heart Rate, SpO2, Body Temperature), autonomous fall detection using 6-axis IMU jerk vectors, deliberate two-step SOS distress broadcasting, and instant caregiver dispatch with live GPS navigation.

---

## 🚀 Key Features

- **Real-Time Vitals Telemetry:** Sub-second continuous streaming of Heart Rate (BPM), Blood Oxygen Saturation (SpO2 %), and Core Body Temperature (°C) through Firebase Realtime Database.
- **Autonomous Fall Detection:** Integrated IMU acceleration vector analysis with automatic confirmation window and escalation workflow.
- **Deliberate Two-Step SOS:** Prominent emergency button with accidental trigger protection, Web Audio warning siren, and immediate caregiver email dispatch.
- **Geospatial Tracking:** Precision hardware GPS coordinate lock with authenticated browser geolocation fallback and one-tap Google Maps directions.
- **Longitudinal Health Analytics:** Interactive multi-parameter Chart.js graphs with configurable historical filters (15m, 1h, 24h, All).
- **Incident Audit Trail:** Full lifecycle tracking (Triggered &rarr; Acknowledged &rarr; Resolved) with caregiver timestamp and clinical resolution notes.
- **Hardware Abstraction Layer (HAL):** Modular C++ ESP32 firmware compatible with MAX30102/MAX30100, DS18B20/NTC, MPU6050, and NEO-6M sensors.
- **Isolated Hackathon Demo Simulator:** Preset physiological scenarios (Resting, Tachycardia, Hypoxia, Sudden Fall, SOS) with prominent "DEMO DATA" separation.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, Modern CSS3 (Dark Cyberpunk / Glassmorphism Design System), Vanilla JavaScript (ES Modules).
- **Visualization & Icons:** Chart.js v4.4, Lucide Icons.
- **Backend / Cloud:** Firebase Authentication, Firebase Realtime Database (RTDB), Vercel Serverless Functions.
- **Hardware / Firmware:** ESP32 Microcontroller, Arduino C++, ArduinoJson, TinyGPSPlus.
- **Emergency Notifications:** Protected serverless email dispatcher with duplicate suppression and Google Maps emergency links.

---

## 📂 Repository Structure

```text
ALPHA-SQUARED-IOT/
├── web/                                # Responsive Frontend Application
│   ├── index.html                      # Landing page with architecture & team overview
│   ├── dashboard.html                  # Main telemetry dashboard with live Chart.js
│   ├── emergency.html                  # Emergency Center with incident resolution
│   ├── location.html                   # Live GPS tracking & Google Maps radar
│   ├── history.html                    # Biometric historical charts & table
│   ├── settings.html                   # Clinical thresholds & caregiver contacts
│   ├── device.html                     # ESP32 node diagnostics & sensor health
│   ├── login.html                      # Authentication sign-in
│   ├── register.html                   # Patient & device registration
│   ├── css/                            # Design tokens, layout, components, pages
│   └── js/                             # Services (Auth, DB, Emergency, Demo) & Pages
├── hardware/
│   └── esp32/
│       ├── esp32_firmware.ino          # Production-ready Arduino sketch
│       ├── SensorDrivers.h             # Modular C++ Hardware Abstraction Layer
│       ├── hardware_config.h           # ESP32 pin definitions & bus mapping
│       ├── config.h.example            # Wi-Fi & Firebase credentials template
│       └── README_HARDWARE.md          # Wiring schematics & hardware guide
├── api/
│   └── alerts/
│       └── send-emergency-email.js     # Protected serverless email dispatcher
├── docs/
│   ├── FIREBASE_SETUP.md               # Firebase configuration & security rules guide
│   └── ANDROID_INTEGRATION_SPEC.md     # Native Android app backend contract
├── testing/
│   ├── run_tests.js                    # Automated verification test suite
│   └── test_scenarios.md               # Step-by-step testing reproduction guide
├── database.rules.json                 # Strict Firebase Realtime Database RBAC rules
├── vercel.json                         # Web routing & serverless deployment config
├── package.json                        # Development scripts
└── .env.example                        # Safe environment template
```

---

## ⚡ Quick Start & Local Run

### 1. Launch the Web Dashboard
```bash
# Serve the web application locally
npm install
npm start
```
The website will be accessible at: `http://localhost:3000`

### 2. Hackathon Demo Credentials
- **Email:** `doctor@alphasquared.org`
- **Password:** `AlphaSquared@2026`

### 3. Run Automated Tests
```bash
npm test
```
All 36 unit and integration test assertions will execute and report status.

---

## 🔒 Security & Medical Disclaimer

- **Role-Based Access:** Sensitive patient telemetry is locked down using Firebase security rules (`database.rules.json`).
- **No Plaintext Passwords:** Client sessions utilize cryptographic SHA-256 salted password digests.
- **Zero Exposed Secrets:** Email credentials and notification tokens are restricted to the serverless environment (`api/alerts/`).
- **Medical Notice:** This system is an engineering prototype designed for demonstration and emergency support. Sensor readings and alerts do not replace professional medical triage or clinical diagnosis.

---

*Team Alpha Squared &bull; Government Polytechnic Gaya, Bihar*

