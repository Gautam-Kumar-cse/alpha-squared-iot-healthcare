/**
 * ALPHA SQUARED - Protected Hardware Device Connection Endpoint
 * Validates hardware credentials, discovers supported telemetry capabilities,
 * implements SSRF validation, and initializes secure backend session.
 * 
 * NEVER returns private API keys to the frontend client.
 */

import deviceStore from '../../lib/device/device-store.js';

export function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Invalid protocol. Only HTTP and HTTPS are permitted.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    // Reject cloud metadata IP and link-local ranges
    if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
      return { safe: false, reason: 'Access to cloud instance metadata service is strictly prohibited (SSRF Protection).' };
    }
    if (hostname.endsWith('.internal') || hostname === 'metadata.google.internal') {
      return { safe: false, reason: 'Access to internal cloud metadata domain is prohibited (SSRF Protection).' };
    }
    return { safe: true, parsed };
  } catch {
    return { safe: false, reason: 'Malformed or invalid URL string.' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { deviceId, apiKey, apiBaseUrl, deviceModel, protocol } = req.body || {};

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Device Identifier. Please provide a valid Device ID or MAC Address.'
      });
    }

    const cleanDeviceId = deviceId.trim();
    const effectiveApiKey = apiKey || process.env.HARDWARE_API_KEY || null;
    const effectiveBaseUrl = apiBaseUrl || process.env.HARDWARE_API_BASE_URL || null;
    const selectedModel = deviceModel || process.env.HARDWARE_DEVICE_MODEL || 'GENERIC_HEALTH_DEVICE';
    const selectedProtocol = protocol || 'REST_HTTPS';

    // Verify if external hardware cloud API is configured
    if (effectiveBaseUrl && effectiveApiKey) {
      // 1. SSRF Safety Check
      const urlCheck = isSafeUrl(effectiveBaseUrl);
      if (!urlCheck.safe) {
        return res.status(400).json({
          success: false,
          error: `Insecure Hardware API URL rejected: ${urlCheck.reason}`,
          hint: 'Provide a valid external HTTPS endpoint for your official medical hardware gateway.'
        });
      }

      try {
        // Attempt ping / status check against the official device API endpoint
        const targetUrl = `${effectiveBaseUrl.replace(/\/+$/, '')}/devices/${encodeURIComponent(cleanDeviceId)}/status`;
        const apiResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${effectiveApiKey}`,
            'X-API-Key': effectiveApiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(6000)
        });

        if (!apiResponse.ok) {
          const errBody = await apiResponse.text().catch(() => '');
          return res.status(502).json({
            success: false,
            error: `Hardware API responded with status ${apiResponse.status}: ${errBody || apiResponse.statusText}`,
            hint: 'Verify that the Device ID and API credentials are authorized on your device provider platform.'
          });
        }

        const deviceData = await apiResponse.json();

        const supportedParameters = deviceData.supportedParameters || [
          'heartRate', 'spo2', 'temperature', 'bloodPressure', 'respiratoryRate', 'steps'
        ];

        deviceStore.registerDevice(cleanDeviceId, {
          deviceModel: selectedModel,
          protocol: selectedProtocol,
          status: 'ONLINE',
          supportedParameters
        });

        return res.status(200).json({
          success: true,
          connected: true,
          deviceId: cleanDeviceId,
          deviceModel: selectedModel,
          protocol: selectedProtocol,
          connectedAt: Date.now(),
          supportedParameters,
          deviceMetadata: {
            firmware: deviceData.firmware || 'Reported by Cloud',
            battery: deviceData.battery || 'Good',
            connectionType: deviceData.connectionType || `${selectedProtocol} / Cloud API`
          }
        });
      } catch (networkErr) {
        return res.status(502).json({
          success: false,
          error: `Failed to reach Hardware API endpoint at ${effectiveBaseUrl}: ${networkErr.message}`,
          hint: 'Ensure your hardware device or gateway is online and the API URL is accessible.'
        });
      }
    }

    // Direct / Local / Firebase RTDB device session
    const supportedParameters = [
      'heartRate',
      'spo2',
      'temperature',
      'bloodPressure',
      'respiratoryRate',
      'ecg',
      'bloodGlucose',
      'steps',
      'sleep',
      'gps'
    ];

    deviceStore.registerDevice(cleanDeviceId, {
      deviceModel: selectedModel,
      protocol: selectedProtocol,
      status: 'ONLINE',
      supportedParameters
    });

    return res.status(200).json({
      success: true,
      connected: true,
      deviceId: cleanDeviceId,
      deviceModel: selectedModel,
      protocol: selectedProtocol,
      connectedAt: Date.now(),
      supportedParameters,
      notice: 'Device registered with hardware telemetry listener. Telemetry will sync when readings are transmitted by device.',
      deviceMetadata: {
        firmware: 'ESP32 / Direct Hardware API',
        connectionType: `${selectedProtocol} / Ingestion Engine`
      }
    });

  } catch (err) {
    console.error('[HARDWARE_CONNECT_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while initializing hardware connection.',
      details: err.message
    });
  }
}
