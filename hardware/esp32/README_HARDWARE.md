# ALPHA SQUARED — ESP32 Hardware Integration Guide
**Team Alpha Squared &bull; Government Polytechnic Gaya**

This guide documents the physical hardware configuration, circuit pinouts, modular sensor interfaces, and flashing instructions for the ALPHA SQUARED IoT Wearable Health & Emergency Node.

---

## 1. Hardware Architecture Overview

```mermaid
flowchart LR
    subgraph WearableNode ["ESP32 Node (Wearable / Bedside)"]
        Pulse["MAX30102 (Pulse & SpO2)"] -->|I2C (0x57)| ESP32["ESP32 Microcontroller"]
        IMU["MPU6050 (6-Axis IMU)"] -->|I2C (0x68)| ESP32
        Temp["DS18B20 (Temperature)"] -->|OneWire (GPIO 4)| ESP32
        GPS["u-blox NEO-6M (GPS)"] -->|UART2 (RX:16, TX:17)| ESP32
        SOS["Emergency Tactile Switch"] -->|Interrupt (GPIO 15)| ESP32
    end

    ESP32 -->|Wi-Fi / HTTPS| Cloud["Firebase Realtime Database"]
```

---

## 2. GPIO Pinout & Wiring Table

| Component | Physical Pin / Function | ESP32 Pin | Logic Level | Protocol | Pull-up Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MAX30102 / MAX30100** | SDA | **GPIO 21** | 3.3V | I2C Data | 4.7kΩ to 3.3V (often on module) |
| | SCL | **GPIO 22** | 3.3V | I2C Clock | 4.7kΩ to 3.3V |
| | VCC / GND | 3.3V / GND | — | Power | — |
| **MPU6050 6-Axis IMU** | SDA | **GPIO 21** | 3.3V | I2C Data | Shared I2C Bus |
| | SCL | **GPIO 22** | 3.3V | I2C Clock | Shared I2C Bus |
| | INT (Optional) | GPIO 19 | 3.3V | Interrupt | Internal Pull-Up |
| **DS18B20 Temp Sensor** | DATA | **GPIO 4** | 3.3V | OneWire | **4.7kΩ to 3.3V Mandatory** |
| | VCC / GND | 3.3V / GND | — | Power | — |
| **u-blox NEO-6M GPS** | TX | **GPIO 16 (RX2)** | 3.3V | Serial UART | None |
| | RX | **GPIO 17 (TX2)** | 3.3V | Serial UART | None |
| | VCC / GND | 3.3V or 5V / GND| — | Power | — |
| **SOS Pushbutton** | Switch Terminal 1 | **GPIO 15** | 3.3V | Active LOW | Enabled via `INPUT_PULLUP` |
| | Switch Terminal 2 | **GND** | 0V | Ground | — |
| **Status Alert LED** | Anode (+) with 330Ω | **GPIO 13** | 3.3V | Digital Output | 330Ω Resistor to GND |

---

## 3. Required Arduino Libraries

Open the **Arduino IDE Library Manager** (`Ctrl+Shift+I`) and install the following official libraries:

1. **ArduinoJson** by *Benoît Blanchon* (Version 6.21.x or 7.x)
2. **SparkFun MAX3010x Pulse and Proximity Sensor Library**
3. **Adafruit MPU6050** & **Adafruit Unified Sensor**
4. **DallasTemperature** & **OneWire** by *Miles Burton*
5. **TinyGPSPlus** by *Mikal Hart*

---

## 4. Hardware Team Confirmation Checklist

> [!IMPORTANT]
> The hardware team should verify and mark each item before flashing:
>
> - [ ] **Sensor Variant:** Confirm whether MAX30102 or MAX30100 is being used (both share I2C address `0x57`).
> - [ ] **OneWire Resistor:** Confirm that a physical 4.7kΩ pull-up resistor is placed between DS18B20 `DATA` and `3.3V`.
> - [ ] **GPS Antenna:** Ensure the GPS patch antenna has a clear line of sight to an open window or outdoors for initial 3D fix lock (1-3 minutes).
> - [ ] **Tactile SOS Switch:** Ensure the tactile switch is wired between GPIO 15 and GND without external voltage injection.
> - [ ] **Wi-Fi Credentials:** Copy `config.h.example` to `config.h` and configure 2.4 GHz Wi-Fi SSID and password (ESP32 does not support 5 GHz Wi-Fi).

---

## 5. Firmware Flashing Steps

1. Connect the ESP32 development board to your computer via micro-USB / USB-C.
2. In Arduino IDE, select **Tools &rarr; Board &rarr; esp32 &rarr; ESP32 Dev Module**.
3. Select the appropriate serial COM port under **Tools &rarr; Port**.
4. Set **Upload Speed** to `921600` and **Flash Frequency** to `80MHz`.
5. Open `hardware/esp32/esp32_firmware.ino`.
6. Click **Upload** (`Ctrl+U`).
7. Open **Serial Monitor** at `115200 baud` to observe initialization and real-time telemetry dispatch!

