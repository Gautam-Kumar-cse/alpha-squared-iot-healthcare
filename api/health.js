/**
 * ALPHA SQUARED - Backend Health Check Endpoint
 * GET /api/health
 * 
 * Verifies that the Node.js backend server and database storage are healthy and running.
 */

import deviceStore from '../lib/device/device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use GET to query service health.'
    });
  }

  const now = Date.now();
  const uptimeSeconds = process.uptime();
  const storeStats = deviceStore.getStoreStats();
  const firebaseConfigured = Boolean(process.env.FIREBASE_DATABASE_URL);

  return res.status(200).json({
    success: true,
    status: 'OK',
    service: 'ALPHA SQUARED — IoT Smart Health & Emergency Detection System',
    version: '1.0.0',
    timestamp: now,
    isoTime: new Date(now).toISOString(),
    uptimeSeconds: Number(uptimeSeconds.toFixed(2)),
    database: {
      type: storeStats.type,
      status: storeStats.status,
      recordsCount: storeStats.recordsCount,
      devicesCount: storeStats.devicesCount,
      firebaseMirror: firebaseConfigured ? 'CONFIGURED' : 'PROTOTYPE_MODE',
      primaryDatabase: 'MongoDB Atlas',
      mongoAtlas: storeStats.mongoAtlas
    },
    endpoints: {
      health: 'GET /api/health',
      latestReadings: 'GET /api/readings/latest',
      historyReadings: 'GET /api/readings/history',
      deviceIngest: 'POST /api/ingest',
      deviceStatus: 'GET /api/device/status',
      sendSms: 'POST /api/alerts/send-sms'
    }
  });
}

