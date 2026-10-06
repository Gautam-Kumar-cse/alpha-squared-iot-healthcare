# ALPHA SQUARED — Firebase Cloud Setup & Security Guide
**Team Alpha Squared &bull; Government Polytechnic Gaya**

This guide provides step-by-step instructions to configure Firebase Authentication and Realtime Database for the ALPHA SQUARED IoT platform.

---

## 1. Firebase Project Creation

1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name it `alpha-squared-iot`.
3. Disable Google Analytics (optional for hackathons) and click **Create Project**.

---

## 2. Enable Firebase Authentication

1. In the Firebase console left menu, click **Build &rarr; Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, enable **Email/Password**.
4. Save the configuration.

---

## 3. Enable Realtime Database (RTDB)

1. In the Firebase console, click **Build &rarr; Realtime Database**.
2. Click **Create Database**.
3. Select your closest database location (e.g., `Singapore (asia-southeast1)` or `United States (us-central1)`).
4. Start in **Locked Mode** (we will apply strict rules in the next step).

---

## 4. Deploy Strict Security Rules

In the Firebase Console under **Realtime Database &rarr; Rules**, paste the contents of `database.rules.json`:

```json
{
  "rules": {
    "patients": {
      "$patientId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $patientId",
        "current": {
          ".write": "auth != null || (newData.child('deviceId').exists() && root.child('devices').child(newData.child('deviceId').val()).child('patientId').val() === $patientId)"
        },
        "history": {
          ".write": "auth != null || (newData.child('deviceId').exists() && root.child('devices').child(newData.child('deviceId').val()).child('patientId').val() === $patientId)"
        },
        "emergencies": {
          ".write": "auth != null || (newData.child('deviceId').exists() && root.child('devices').child(newData.child('deviceId').val()).child('patientId').val() === $patientId)"
        }
      }
    },
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "newData.hasChild('status')"
      }
    }
  }
}
```

Click **Publish**.

---

## 5. Retrieve Web Configuration

1. In **Project Settings &rarr; General**, scroll down to **Your apps** and click the Web `</>` icon.
2. Register the app as `alpha-squared-web`.
3. Copy the `firebaseConfig` object and paste the values into the web Settings page (`settings.html`) or your local `.env`.

