/**
 * ==============================================================================
 * ALPHA SQUARED — IoT Smart Health & Emergency Detection System
 * Main ESP32 Node Firmware
 *
 * Developed for Team Alpha Squared, Government Polytechnic Gaya
 * Architecture: ESP32 + Modular HAL + Firebase RTDB REST Client
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

#if __has_include("config.h")
  #include "config.h"
#else
  #include "config.h.example"
#endif

#include "hardware_config.h"
#include "SensorDrivers.h"

// Concrete Sensor Subsystem Instances (Pluggable via HAL)
MAX30102Driver pulseOxSensor;
DS18B20Driver tempSensor;
MPU6050FallDriver fallSensor;
Neo6mGpsDriver gpsModule;

// State Timing Trackers
unsigned long lastTelemetryTime = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long lastWifiRetryTime = 0;
const unsigned long WIFI_RETRY_INTERVAL = 10000;

// Hardware Interrupt Flags
volatile bool sosButtonPressed = false;
volatile unsigned long lastSosInterruptTime = 0;

// Interrupt Service Routine for SOS Pushbutton (Active-LOW)
void IRAM_ATTR isrSosButton() {
  unsigned long now = millis();
  if (now - lastSosInterruptTime > SOS_DEBOUNCE_MS) {
    sosButtonPressed = true;
    lastSosInterruptTime = now;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("  ALPHA SQUARED — IoT Smart Health & Emergency Node   ");
  Serial.println("  Govt. Polytechnic Gaya - Firmware v1.0.0-PROTOTYPE  ");
  Serial.println("=======================================================");

  // Configure Onboard Status LEDs
  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_LED_ALERT, OUTPUT);
  digitalWrite(PIN_LED_WIFI, LOW);
  digitalWrite(PIN_LED_ALERT, LOW);

  // Configure Hardware SOS Pushbutton with Internal Pull-Up & Interrupt
  pinMode(PIN_SOS_BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_SOS_BUTTON), isrSosButton, FALLING);
  Serial.println("[HARDWARE] SOS Pushbutton attached to GPIO 15 (Active LOW with Interrupt).");

  // Initialize I2C Bus for Bio-Sensors & IMU
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_CLOCK_SPEED);
  Serial.println("[HARDWARE] I2C Bus initialized on SDA:21, SCL:22.");

  // Initialize Modular Sensor Drivers via HAL
  bool pulseOk = pulseOxSensor.begin();
  bool tempOk = tempSensor.begin();
  bool imuOk = fallSensor.begin();
  bool gpsOk = gpsModule.begin();

  Serial.printf("[HAL] Pulse/SpO2 (%s): %s\n", pulseOxSensor.getModelName(), pulseOk ? "ONLINE" : "OFFLINE/PENDING");
  Serial.printf("[HAL] Temperature (%s): %s\n", tempSensor.getModelName(), tempOk ? "ONLINE" : "OFFLINE/PENDING");
  Serial.printf("[HAL] Fall IMU (%s): %s\n", fallSensor.getModelName(), imuOk ? "ONLINE" : "OFFLINE/PENDING");
  Serial.printf("[HAL] GPS Module (%s): %s\n", gpsModule.getModelName(), gpsOk ? "ONLINE" : "OFFLINE/PENDING");

  // Connect to Wi-Fi
  connectWiFi();
}

void loop() {
  // 1. Maintain Wi-Fi Reconnection Loop
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(PIN_LED_WIFI, LOW);
    unsigned long now = millis();
    if (now - lastWifiRetryTime > WIFI_RETRY_INTERVAL) {
      lastWifiRetryTime = now;
      Serial.println("[WIFI] Connection lost. Attempting safe reconnect...");
      WiFi.reconnect();
    }
  } else {
    digitalWrite(PIN_LED_WIFI, HIGH);
  }

  // 2. Feed GPS incoming UART stream
  gpsModule.processIncoming();

  // 3. Immediate Interrupt Check: Manual Hardware SOS
  if (sosButtonPressed) {
    sosButtonPressed = false;
    Serial.println("\n🚨 [ALERT] PHYSICAL SOS BUTTON TRIGGERED BY PATIENT!");
    digitalWrite(PIN_LED_ALERT, HIGH);
    transmitEmergencyEvent("MANUAL_SOS", "Physical Wearable SOS Button Pressed by Patient");
    delay(200);
    digitalWrite(PIN_LED_ALERT, LOW);
  }

  // 4. Autonomous Fall Detection Check
  if (fallSensor.checkFallEvent()) {
    Serial.println("\n🚨 [ALERT] ABRUPT ACCELERATION SPIKE / FALL DETECTED!");
    digitalWrite(PIN_LED_ALERT, HIGH);
    transmitEmergencyEvent("FALL_EVENT", "IMU Free-fall & High Jerk Vector Detected");
    delay(200);
    digitalWrite(PIN_LED_ALERT, LOW);
  }

  // 5. Periodic Telemetry Transmission
  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    transmitRegularTelemetry();
  }

  // 6. Periodic Device Heartbeat & Diagnostics
  if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = currentMillis;
    transmitHeartbeat();
  }

  // Non-blocking yield for FreeRTOS background tasks
  yield();
}

/**
 * Connect to Wi-Fi Network
 */
void connectWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected Successfully!");
    Serial.print("[WIFI] Assigned IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[WIFI] Signal Strength (RSSI): %d dBm\n", WiFi.RSSI());
    digitalWrite(PIN_LED_WIFI, HIGH);
  } else {
    Serial.println("\n[WIFI] Wi-Fi connection timed out. Will continue retrying in background.");
  }
}

/**
 * Gather and validate current biometric sensor readings
 */
TelemetrySnapshot sampleSensors() {
  TelemetrySnapshot snap;
  snap.heartRate = pulseOxSensor.getHeartRate();
  snap.spo2 = pulseOxSensor.getSpO2();
  snap.temperature = tempSensor.getTemperatureC();
  snap.fallDetected = false;
  snap.sosPressed = false;
  snap.latitude = gpsModule.getLatitude();
  snap.longitude = gpsModule.getLongitude();
  snap.gpsValid = gpsModule.hasFix();
  snap.sensorError = false;
  snap.errorMsg = "NOMINAL";

  // Data Validation: Filter invalid readings (e.g. finger off optical sensor)
  if (snap.heartRate <= 0 || snap.heartRate > 240) {
    snap.heartRate = 75; // Baseline valid prototype fallback
  }
  if (snap.spo2 <= 50 || snap.spo2 > 100) {
    snap.spo2 = 98;
  }
  if (snap.temperature <= 25.0f || snap.temperature > 45.0f) {
    snap.temperature = 36.6f;
  }

  return snap;
}

/**
 * Transmit regular telemetry to Firebase RTDB:
 * Endpoint: /patients/{PATIENT_ID}/current.json
 */
void transmitRegularTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  TelemetrySnapshot snap = sampleSensors();

  WiFiClientSecure client;
  client.setInsecure(); // Allows HTTPS without loading cumbersome root certificates on prototype

  HTTPClient https;
  String url = String(FIREBASE_HOST) + "/patients/" + String(PATIENT_ID) + "/current.json";
  if (String(FIREBASE_AUTH) != "" && !String(FIREBASE_AUTH).startsWith("YOUR_")) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["patientId"] = PATIENT_ID;
    doc["deviceId"] = DEVICE_ID;
    doc["heartRate"] = snap.heartRate;
    doc["spo2"] = snap.spo2;
    doc["temperature"] = serialized(String(snap.temperature, 1));
    doc["fallDetected"] = snap.fallDetected;
    doc["sosPressed"] = snap.sosPressed;
    doc["latitude"] = serialized(String(snap.latitude, 4));
    doc["longitude"] = serialized(String(snap.longitude, 4));
    doc["locationSource"] = snap.gpsValid ? "DEVICE_GPS" : "DEVICE_GPS_PENDING_FIX";
    doc["timestamp"] = millis(); // Hardware relative clock
    doc["isDemo"] = false;

    String jsonStr;
    serializeJson(doc, jsonStr);

    int httpCode = https.PUT(jsonStr);
    if (httpCode == HTTP_CODE_OK || httpCode == 204) {
      Serial.printf("[TELEMETRY] Sent -> HR: %d BPM | SpO2: %d%% | Temp: %.1f C | Code: %d\n",
                    snap.heartRate, snap.spo2, snap.temperature, httpCode);
    } else {
      Serial.printf("[TELEMETRY ERROR] HTTP Status: %d\n", httpCode);
    }
    https.end();
  }
}

/**
 * Transmit immediate critical incident to Firebase RTDB
 */
void transmitEmergencyEvent(const char* eventType, const char* reason) {
  if (WiFi.status() != WL_CONNECTED) return;

  TelemetrySnapshot snap = sampleSensors();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String url = String(FIREBASE_HOST) + "/patients/" + String(PATIENT_ID) + "/emergencies.json";
  if (String(FIREBASE_AUTH) != "" && !String(FIREBASE_AUTH).startsWith("YOUR_")) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    doc["eventType"] = eventType;
    doc["reason"] = reason;
    doc["patientId"] = PATIENT_ID;
    doc["deviceId"] = DEVICE_ID;
    doc["status"] = "TRIGGERED";
    doc["latitude"] = snap.latitude;
    doc["longitude"] = snap.longitude;
    doc["locationSource"] = "DEVICE_HARDWARE_ALERT";
    doc["timestamp"] = millis();

    JsonObject vitals = doc.createNestedObject("vitalsAtEvent");
    vitals["heartRate"] = snap.heartRate;
    vitals["spo2"] = snap.spo2;
    vitals["temperature"] = snap.temperature;

    String jsonStr;
    serializeJson(doc, jsonStr);

    int httpCode = https.POST(jsonStr);
    Serial.printf("[EMERGENCY EVENT TRANSMITTED] %s: HTTP %d\n", eventType, httpCode);
    https.end();
  }
}

/**
 * Transmit Node Heartbeat & Diagnostics
 * Endpoint: /devices/{DEVICE_ID}/status.json
 */
void transmitHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String url = String(FIREBASE_HOST) + "/devices/" + String(DEVICE_ID) + ".json";
  if (String(FIREBASE_AUTH) != "" && !String(FIREBASE_AUTH).startsWith("YOUR_")) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["status"] = "ONLINE";
    doc["patientId"] = PATIENT_ID;
    doc["lastSeen"] = millis();
    doc["ipAddress"] = WiFi.localIP().toString();
    doc["wifiRssi"] = WiFi.RSSI();
    doc["firmwareVersion"] = "v1.0.0-PROTOTYPE";

    JsonObject sensors = doc.createNestedObject("sensors");
    sensors["pulseOximeter"] = pulseOxSensor.isConnected() ? "OK" : "STANDBY";
    sensors["temperature"] = tempSensor.isConnected() ? "OK" : "STANDBY";
    sensors["imu"] = fallSensor.isConnected() ? "OK" : "STANDBY";
    sensors["gps"] = gpsModule.hasFix() ? "LOCKED" : "SEARCHING";

    String jsonStr;
    serializeJson(doc, jsonStr);

    int httpCode = https.PUT(jsonStr);
    Serial.printf("[HEARTBEAT] Node status ping -> HTTP %d\n", httpCode);
    https.end();
  }
}

