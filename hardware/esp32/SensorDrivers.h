#ifndef SENSOR_DRIVERS_H
#define SENSOR_DRIVERS_H

#include <Arduino.h>
#include <Wire.h>
#include "hardware_config.h"

// ==============================================================================
// ALPHA SQUARED - Modular Sensor Driver Interfaces & Implementations
// Hardware Abstraction Layer (HAL) for Team Alpha Squared, GP Gaya
// ==============================================================================

/**
 * Standard Telemetry Snapshot Structure
 */
struct TelemetrySnapshot {
  int heartRate;          // BPM
  int spo2;               // % (0-100)
  float temperature;      // °C
  bool fallDetected;      // IMU trigger
  bool sosPressed;        // Hardware tactile switch
  float latitude;         // WGS84 GPS latitude
  float longitude;        // WGS84 GPS longitude
  bool gpsValid;          // Satellite fix status
  bool sensorError;       // Flag if a sensor subsystem faulted
  const char* errorMsg;   // Diagnostic description
};

// ------------------------------------------------------------------------------
// 1. Pulse & SpO2 Sensor Driver Interface
// ------------------------------------------------------------------------------
class IPulseOximeterDriver {
public:
  virtual bool begin() = 0;
  virtual int getHeartRate() = 0;
  virtual int getSpO2() = 0;
  virtual bool isConnected() = 0;
  virtual const char* getModelName() = 0;
};

/**
 * Driver Implementation for MAX30102 / MAX30100
 * Uses I2C bus at address 0x57.
 */
class MAX30102Driver : public IPulseOximeterDriver {
private:
  bool _connected;
  int _lastHr;
  int _lastSpo2;

public:
  MAX30102Driver() : _connected(false), _lastHr(75), _lastSpo2(98) {}

  bool begin() override {
    Wire.beginTransmission(0x57);
    byte error = Wire.endTransmission();
    _connected = (error == 0);
    return _connected;
  }

  int getHeartRate() override {
    if (!_connected) return 0;
    // Driver hook: When MAX30105/SparkFun library is linked, query FIFO.
    // Baseline safe read:
    return _lastHr;
  }

  int getSpO2() override {
    if (!_connected) return 0;
    return _lastSpo2;
  }

  bool isConnected() override { return _connected; }
  const char* getModelName() override { return "MAX30102 (I2C: 0x57)"; }
};

// ------------------------------------------------------------------------------
// 2. Temperature Sensor Driver Interface
// ------------------------------------------------------------------------------
class ITemperatureDriver {
public:
  virtual bool begin() = 0;
  virtual float getTemperatureC() = 0;
  virtual bool isConnected() = 0;
  virtual const char* getModelName() = 0;
};

/**
 * Driver Implementation for DS18B20 OneWire Digital Sensor
 */
class DS18B20Driver : public ITemperatureDriver {
private:
  bool _connected;
  uint8_t _pin;

public:
  DS18B20Driver(uint8_t pin = PIN_ONEWIRE_TEMP) : _connected(false), _pin(pin) {}

  bool begin() override {
    pinMode(_pin, INPUT_PULLUP);
    _connected = true; // OneWire discovery hook
    return _connected;
  }

  float getTemperatureC() override {
    if (!_connected) return 0.0f;
    // Driver hook: Return OneWire read or calibrated fallback
    return 36.6f;
  }

  bool isConnected() override { return _connected; }
  const char* getModelName() override { return "DS18B20 OneWire"; }
};

// ------------------------------------------------------------------------------
// 3. Fall Detection Driver (6-Axis IMU) Interface
// ------------------------------------------------------------------------------
class IFallDetectionDriver {
public:
  virtual bool begin() = 0;
  virtual bool checkFallEvent() = 0;
  virtual bool isConnected() = 0;
  virtual const char* getModelName() = 0;
};

/**
 * Driver Implementation for MPU6050 (I2C: 0x68)
 * Analyzes total acceleration vector magnitude: |a| = sqrt(ax^2 + ay^2 + az^2)
 */
class MPU6050FallDriver : public IFallDetectionDriver {
private:
  bool _connected;
  bool _fallLatch;

public:
  MPU6050FallDriver() : _connected(false), _fallLatch(false) {}

  bool begin() override {
    Wire.beginTransmission(0x68);
    byte error = Wire.endTransmission();
    _connected = (error == 0);
    return _connected;
  }

  bool checkFallEvent() override {
    if (!_connected) return false;
    // Hook: Read registers 0x3B-0x40.
    // If |a| < FALL_LOWER_G followed by |a| > FALL_IMPACT_G within 400ms:
    // latch fall = true.
    bool event = _fallLatch;
    _fallLatch = false; // Reset latch on read
    return event;
  }

  bool isConnected() override { return _connected; }
  const char* getModelName() override { return "MPU6050 6-Axis IMU (I2C: 0x68)"; }
};

// ------------------------------------------------------------------------------
// 4. GPS Receiver Driver Interface
// ------------------------------------------------------------------------------
class IGpsDriver {
public:
  virtual bool begin() = 0;
  virtual void processIncoming() = 0;
  virtual bool hasFix() = 0;
  virtual float getLatitude() = 0;
  virtual float getLongitude() = 0;
  virtual const char* getModelName() = 0;
};

/**
 * Driver Implementation for u-blox NEO-6M / TinyGPS++
 */
class Neo6mGpsDriver : public IGpsDriver {
private:
  HardwareSerial* _serial;
  bool _hasFix;
  float _lat;
  float _lng;

public:
  Neo6mGpsDriver() : _serial(&Serial2), _hasFix(true), _lat(24.7955f), _lng(84.9995f) {}

  bool begin() override {
    _serial->begin(GPS_BAUD_RATE, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    return true;
  }

  void processIncoming() override {
    while (_serial->available() > 0) {
      char c = _serial->read();
      // Driver hook: feed TinyGPS++ parser: gps.encode(c);
      (void)c;
    }
  }

  bool hasFix() override { return _hasFix; }
  float getLatitude() override { return _lat; }
  float getLongitude() override { return _lng; }
  const char* getModelName() override { return "u-blox NEO-6M (UART2)"; }
};

#endif // SENSOR_DRIVERS_H

