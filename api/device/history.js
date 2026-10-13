/**
 * ALPHA SQUARED - Protected Hardware Device History Endpoint
 * Retrieves historical readings (Daily, Weekly, Monthly) from connected device or backend store.
 */

import deviceStore from './device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  try {
    const deviceId = (req.query?.deviceId || process.env.ESP32_DEVICE_ID || '').trim();
    const range = (req.query?.range || 'daily').toLowerCase(); // daily, weekly, monthly

    if (!deviceId) {
      return res.status(400).json({ error: 'Missing deviceId parameter.' });
    }

    // 1. Check in-memory reactive store first for ingested records
    const storedHistory = deviceStore.getHistory(deviceId, range);
    if (storedHistory && storedHistory.length > 0) {
      return res.status(200).json({
        success: true,
        deviceId,
        range,
        hasData: true,
        records: storedHistory
      });
    }

    const effectiveApiKey = process.env.HARDWARE_API_KEY;
    const effectiveBaseUrl = process.env.HARDWARE_API_BASE_URL;

    // 2. If external official device cloud API is present, query history
    if (effectiveBaseUrl && effectiveApiKey) {
      try {
        const historyUrl = `${effectiveBaseUrl.replace(/\/+$/, '')}/devices/${encodeURIComponent(deviceId)}/history?range=${range}`;
        const response = await fetch(historyUrl, {
          headers: {
            'Authorization': `Bearer ${effectiveApiKey}`,
            'X-API-Key': effectiveApiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (response.ok) {
          const cloudHistory = await response.json();
          return res.status(200).json({
            success: true,
            deviceId,
            range,
            hasData: Boolean(cloudHistory.data && cloudHistory.data.length > 0),
            records: cloudHistory.data || []
          });
        }
      } catch (err) {
        console.warn('External history fetch failed:', err.message);
      }
    }

    // 3. Query Firebase RTDB history if configured
    const firebaseHost = process.env.FIREBASE_DATABASE_URL;
    if (firebaseHost) {
      try {
        const rtdbUrl = `${firebaseHost.replace(/\/+$/, '')}/devices/${encodeURIComponent(deviceId)}/history.json`;
        const fbResponse = await fetch(rtdbUrl, { signal: AbortSignal.timeout(6000) });
        if (fbResponse.ok) {
          const rawObj = await fbResponse.json();
          if (rawObj && typeof rawObj === 'object') {
            const records = Object.values(rawObj);
            return res.status(200).json({
              success: true,
              deviceId,
              range,
              hasData: records.length > 0,
              records
            });
          }
        }
      } catch {
        // Fall through
      }
    }

    // 4. Return clean empty history when no readings exist yet
    return res.status(200).json({
      success: true,
      deviceId,
      range,
      hasData: false,
      message: 'No historical records logged yet for this device. Data will accumulate as readings are received.',
      records: []
    });

  } catch (err) {
    console.error('[HARDWARE_HISTORY_ERROR]', err);
    return res.status(500).json({ error: 'Failed to retrieve historical health data', details: err.message });
  }
}
