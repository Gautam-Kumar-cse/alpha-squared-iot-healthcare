/**
 * ALPHA SQUARED - Hardware API Connection Diagnostic & Test Endpoint
 * 
 * Verifies reachability, measures round-trip latency (ping),
 * tests authentication credentials, validates SSRF security, and reports protocol compatibility.
 * 
 * Never returns private API keys to the frontend client.
 */

import deviceStore from '../../lib/device/device-store.js';

export function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Invalid protocol. Only HTTP and HTTPS are permitted.' };
    }
    const hostname = parsed.hostname.toLowerCase();
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
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use POST.'
    });
  }

  const startTime = Date.now();

  try {
    const { deviceId, apiBaseUrl, apiKey, protocol, provider } = req.body || {};

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required to perform diagnostic test.'
      });
    }

    const cleanDeviceId = deviceId.trim();
    const effectiveProtocol = protocol || 'REST_HTTPS';
    const effectiveBaseUrl = apiBaseUrl?.trim() || process.env.HARDWARE_API_BASE_URL || null;
    const effectiveApiKey = apiKey?.trim() || process.env.HARDWARE_API_KEY || null;

    // 1. Diagnostic test for external Hardware API Base URL
    if (effectiveBaseUrl) {
      const urlCheck = isSafeUrl(effectiveBaseUrl);
      if (!urlCheck.safe) {
        return res.status(400).json({
          success: false,
          status: 'INSECURE_ENDPOINT',
          deviceId: cleanDeviceId,
          protocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          error: `Insecure Hardware API URL rejected: ${urlCheck.reason}`,
          hint: 'Verify the URL does not target prohibited cloud metadata or internal endpoints.'
        });
      }

      try {
        let testUrl = effectiveBaseUrl.replace(/\/+$/, '');
        if (!testUrl.includes('/status') && !testUrl.includes('/ping') && !testUrl.includes('/health')) {
          testUrl = `${testUrl}/devices/${encodeURIComponent(cleanDeviceId)}/status`;
        }

        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'AlphaSquared-IoT-Diagnostics/1.0'
        };

        if (effectiveApiKey) {
          headers['Authorization'] = `Bearer ${effectiveApiKey}`;
          headers['X-API-Key'] = effectiveApiKey;
        }

        const response = await fetch(testUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(6000)
        });

        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          return res.status(200).json({
            success: true,
            status: 'REACHABLE',
            deviceId: cleanDeviceId,
            protocol: effectiveProtocol,
            latencyMs,
            httpStatus: response.status,
            message: `Hardware API responded successfully with HTTP ${response.status} in ${latencyMs}ms.`,
            diagnostics: {
              targetUrl: testUrl,
              authenticated: Boolean(effectiveApiKey),
              timestamp: Date.now()
            }
          });
        } else {
          return res.status(200).json({
            success: false,
            status: 'ENDPOINT_REJECTED',
            deviceId: cleanDeviceId,
            protocol: effectiveProtocol,
            latencyMs,
            httpStatus: response.status,
            error: `Hardware API reached, but server responded with HTTP ${response.status} (${response.statusText}).`,
            hint: response.status === 401 || response.status === 403 
              ? 'Authentication failed: Verify your API Key or Token is valid.'
              : 'Verify the device ID exists in your device provider registry.'
          });
        }
      } catch (networkErr) {
        const latencyMs = Date.now() - startTime;
        return res.status(200).json({
          success: false,
          status: 'UNREACHABLE',
          deviceId: cleanDeviceId,
          protocol: effectiveProtocol,
          latencyMs,
          error: `Network timeout or connection refused at ${effectiveBaseUrl}: ${networkErr.message}`,
          hint: 'Ensure your IoT gateway or cloud service is online and accessible via HTTPS without CORS blocks.'
        });
      }
    }

    // 2. Direct IoT Ingestion Mode (Built-in Ingestion Endpoint & Local Store)
    const storeStatus = deviceStore.getDeviceStatus(cleanDeviceId);
    const latestTele = deviceStore.getLatestTelemetry(cleanDeviceId);
    const latencyMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      status: 'READY_FOR_TELEMETRY',
      deviceId: cleanDeviceId,
      protocol: effectiveProtocol,
      latencyMs: Math.max(1, latencyMs),
      message: 'Direct REST Ingestion Endpoint (/api/device/ingest) is active and ready to receive sensor frames.',
      diagnostics: {
        deviceState: storeStatus.status,
        hasCachedReadings: Boolean(latestTele),
        supportedProtocols: ['REST HTTPS (POST /api/device/ingest)', 'Firebase RTDB Bridge', 'MQTT WebSocket Gateway'],
        timestamp: Date.now()
      }
    });

  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      status: 'DIAGNOSTIC_FAILURE',
      latencyMs,
      error: 'An internal error occurred during the diagnostic check.',
      details: err.message
    });
  }
}
