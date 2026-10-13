/**
 * ALPHA SQUARED - Historical Health Readings Endpoint
 * GET /api/readings/history
 * 
 * Returns stored timestamped physiological readings from the persistent database
 * with support for range and calendar date filters.
 */

import deviceStore from '../../lib/device/device-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use GET to fetch historical readings.'
    });
  }

  try {
    const range = (req.query?.range || 'all').toLowerCase();
    const startDate = req.query?.startDate || null;
    const endDate = req.query?.endDate || null;
    const limit = parseInt(req.query?.limit || '100', 10);
    const deviceId = req.query?.deviceId?.trim() || null;
    const patientId = req.query?.patientId?.trim() || null;
    const source = (req.query?.source || 'ALL').toUpperCase();

    // Validate date format if provided
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "startDate" parameter. Provide ISO 8601 string or numeric millisecond timestamp.'
      });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "endDate" parameter. Provide ISO 8601 string or numeric millisecond timestamp.'
      });
    }

    const excludeTests = req.query?.excludeTests === 'true';

    const readings = await deviceStore.getReadingsHistory({
      deviceId,
      patientId,
      range,
      startDate,
      endDate,
      limit,
      source,
      excludeTests
    });

    return res.status(200).json({
      success: true,
      count: readings.length,
      range,
      filters: {
        startDate,
        endDate,
        deviceId,
        patientId,
        source
      },
      readings
    });

  } catch (err) {
    console.error('[API_READINGS_HISTORY_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve historical health readings.',
      details: err.message
    });
  }
}

