/**
 * ALPHA SQUARED - Protected Serverless Emergency Email Dispatcher
 * Runs exclusively in a secure server-side environment (e.g. Vercel Functions / Node.js).
 * NEVER exposes SMTP credentials, app passwords, or notification keys to client-side JS!
 */

// In-memory duplicate suppression cache for serverless invocation window
const dispatchedEventsCache = new Set();

export default async function handler(req, res) {
  // Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { patientId, eventId, eventType, reason, vitals, location, timestamp } = req.body || {};

    if (!eventId || !eventType) {
      return res.status(400).json({ error: 'Missing required incident fields: eventId, eventType.' });
    }

    // Check duplicate suppression
    if (dispatchedEventsCache.has(eventId)) {
      return res.status(200).json({
        status: 'DUPLICATE_SUPPRESSED',
        message: `Alert for event ${eventId} has already been transmitted.`
      });
    }

    dispatchedEventsCache.add(eventId);

    const timeFormatted = new Date(timestamp || Date.now()).toUTCString();
    const gmapsLink = (location && location.lat && location.lng)
      ? `https://maps.google.com/?q=${location.lat},${location.lng}`
      : 'Location Coordinates Pending';

    // HTML Email template
    const htmlEmail = `
      <div style="font-family: Arial, sans-serif; background:#060a12; color:#f8fafc; padding:24px; border-radius:12px; border:2px solid #ef4444; max-width:600px;">
        <div style="border-bottom:1px solid #1e293b; padding-bottom:16px; margin-bottom:16px;">
          <h1 style="color:#ef4444; margin:0 0 4px 0; font-size:24px;">🚨 ALPHA SQUARED — EMERGENCY ALERT</h1>
          <p style="color:#94a3b8; margin:0; font-size:14px;">Government Polytechnic Gaya IoT Healthcare System</p>
        </div>

        <div style="background:#1e1b4b; border-left:4px solid #ef4444; padding:12px 16px; margin-bottom:20px; border-radius:4px;">
          <h2 style="color:#ffffff; margin:0 0 6px 0; font-size:18px;">Incident: ${eventType}</h2>
          <p style="color:#fca5a5; margin:0; font-size:15px; font-weight:bold;">Trigger Reason: ${reason || 'Telemetry threshold exceeded'}</p>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <tr style="background:#0f172a;">
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">Patient ID:</td>
            <td style="padding:10px; border:1px solid #334155; color:#00f0ff; font-weight:bold;">${patientId || 'PATIENT-001'}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">Incident Timestamp:</td>
            <td style="padding:10px; border:1px solid #334155; color:#f8fafc;">${timeFormatted}</td>
          </tr>
          <tr style="background:#0f172a;">
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">Heart Rate at Incident:</td>
            <td style="padding:10px; border:1px solid #334155; color:#ff4d6d; font-weight:bold;">${vitals?.heartRate ? vitals.heartRate + ' BPM' : 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">SpO2 Oxygen Saturation:</td>
            <td style="padding:10px; border:1px solid #334155; color:#00f0ff; font-weight:bold;">${vitals?.spo2 ? vitals.spo2 + '%' : 'N/A'}</td>
          </tr>
          <tr style="background:#0f172a;">
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">Core Temperature:</td>
            <td style="padding:10px; border:1px solid #334155; color:#ffb703; font-weight:bold;">${vitals?.temperature ? vitals.temperature + ' °C' : 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #334155; font-weight:bold; color:#94a3b8;">Emergency GPS Location:</td>
            <td style="padding:10px; border:1px solid #334155;">
              <a href="${gmapsLink}" style="color:#38bdf8; font-weight:bold; text-decoration:underline;">
                Open Live Emergency Location in Google Maps &rarr;
              </a>
            </td>
          </tr>
        </table>

        <div style="font-size:12px; color:#64748b; border-top:1px solid #1e293b; padding-top:12px;">
          This is an automated priority notification from the ALPHA SQUARED IoT Healthcare Telemetry Platform.
          Please verify patient vitals immediately and contact emergency triage services if necessary.
        </div>
      </div>
    `;

    // Check environment SMTP credentials
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log('[ALPHA SQUARED Serverless Alert Mock Log]:');
      console.log(`Alert queued for event ${eventId}. SMTP credentials not configured in server environment.`);
      
      return res.status(200).json({
        status: 'MOCK_DISPATCH_RECORDED',
        notice: 'SMTP credentials unconfigured in server environment. Payload successfully validated and logged to audit trail.',
        eventId,
        patientId,
        timestamp: timeFormatted,
        htmlPreview: htmlEmail
      });
    }

    // If SMTP is provided, send email via nodemailer dynamically
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: { user: smtpUser, pass: smtpPass }
      });

      const recipient = process.env.ALERT_PRIMARY_EMAIL || smtpUser;

      await transporter.sendMail({
        from: process.env.ALERT_SENDER_EMAIL || `"ALPHA SQUARED Emergency" <${smtpUser}>`,
        to: recipient,
        subject: `🚨 [CRITICAL ALERT] ${eventType} - Patient ${patientId}`,
        html: htmlEmail
      });

      return res.status(200).json({
        status: 'DISPATCH_SUCCESS',
        eventId,
        recipient,
        sentAt: Date.now()
      });
    } catch (mailErr) {
      console.error('[ALPHA SQUARED Mail Error]:', mailErr);
      return res.status(500).json({
        error: 'Failed to deliver emergency email through SMTP transport.',
        details: mailErr.message
      });
    }

  } catch (err) {
    console.error('[ALPHA SQUARED Alerts API Exception]:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
}

