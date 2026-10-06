#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

// ==============================================================================
// ALPHA SQUARED - ESP32 Hardware Pin & Bus Mapping
// Team Alpha Squared | Government Polytechnic Gaya
// ==============================================================================

// I2C Bus Pins (Shared by MAX30102 Pulse Oximeter & MPU6050 Accelerometer)
#define PIN_I2C_SDA         21
#define PIN_I2C_SCL         22
#define I2C_CLOCK_SPEED     400000 // 400 kHz Fast-Mode

// OneWire / Digital Temperature Sensor (e.g., DS18B20)
#define PIN_ONEWIRE_TEMP    4

// Analog Fallback Temperature Sensor (e.g., NTC 10K Thermistor on ADC1)
#define PIN_ADC_TEMP        34

// Hardware GPS Module UART Pins (e.g., u-blox NEO-6M / NEO-8M)
#define PIN_GPS_RX          16 // ESP32 RX2 connects to GPS TX
#define PIN_GPS_TX          17 // ESP32 TX2 connects to GPS RX
#define GPS_BAUD_RATE       9600

// Hardware Emergency Pushbutton (SOS)
// Wired to Active-LOW with internal pull-up resistor
#define PIN_SOS_BUTTON      15
#define SOS_DEBOUNCE_MS     250

// Onboard Status LED Indicators
#define PIN_LED_WIFI        2   // Built-in blue LED for Wi-Fi status
#define PIN_LED_ALERT       13  // Red LED for Emergency / Fall trigger

// Fall Detection Acceleration Thresholds (MPU6050)
// Free-fall acceleration threshold (~0.4g) and impact threshold (>2.8g)
#define FALL_LOWER_G        0.45f
#define FALL_IMPACT_G       2.80f

#endif // HARDWARE_CONFIG_H

