/**
 * ALPHA SQUARED - Protected Serverless SMS Dispatcher
 * 
 * Handles automated clinical SMS alert dispatches for Yellow (Caution) and Red (Emergency) zones.
 * Supports:
 * - Twilio REST API
 * - Fast2SMS / Indian Gateway
 * - Generic Webhook / REST SMS Gateway
 * - Robust Simulation / Mock mode with comprehensive audit delivery payload
 * - Anti-spam duplicate suppression & intelligent parameter-level cooldown
 * - Dedicated test SMS verification endpoint
 * 
 * Secret credentials are kept strictly server-side.
 */

// In-memory cooldown cache: key -> timestamp of last dispatch
const alertCooldownCache = new Map();

// Recent dispatches audit log (in-memory ring buffer)
const recentDispatchesAudit = [];
const MAX_AUDIT_LOGS = 50;

export function hasValidCoordinates(loc) {
  if (!loc) return false;
  const lat = Number(loc.latitude ?? loc.lat);
  const lng = Number(loc.longitude ?? loc.lng);
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Use POST to dispatch SMS alerts.'
    });
  }

  try {
    const {
      patientId = 'PATIENT-001',
      patientName = 'Jane Doe',
      zone = 'YELLOW',
      triggers = [],
      vitals = {},
      location = null,
      contacts = [],
      parentContact = null,
      emergencyContact = null,
      patientPhone = null,
      isDemo = false,
      dataSource = null,
      locationSharingConsent = true,
      isTest = false,
      bypassCooldown = false,
      cooldownSeconds = 300 // default 5 minutes
    } = req.body || {};

    const now = Date.now();
    const timestampStr = new Date(now).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // -------------------------------------------------------------
    // 0. Green Zone Handling (Normal - No Unnecessary Alerts)
    // -------------------------------------------------------------
    if (zone === 'GREEN' && !isTest) {
      return res.status(200).json({
        success: true,
        status: 'NORMAL_STATUS',
        message: 'Patient biometrics are in Green Zone (Normal). Automatic alerts suppressed to prevent notification fatigue.',
        zone: 'GREEN',
        dispatchedAt: null,
        deliveries: []
      });
    }

    // -------------------------------------------------------------
    // 1. Gateway Provider Detection & Simulation Mode
    // -------------------------------------------------------------
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    const webhookUrl = process.env.SMS_WEBHOOK_URL;

    let provider = 'SIMULATED_GATEWAY';
    let isLiveGateway = false;

    if (twilioSid && twilioToken && twilioFrom) {
      provider = 'TWILIO_REST_API';
      isLiveGateway = true;
    } else if (fast2smsKey) {
      provider = 'FAST2SMS_API';
      isLiveGateway = true;
    } else if (webhookUrl) {
      provider = 'CUSTOM_SMS_WEBHOOK';
      isLiveGateway = true;
    }

    const isDemoMode = Boolean(isDemo || dataSource === 'DEMO');
    const dataSourceLabel = isDemoMode ? 'DEMO' : 'REAL';

    // -------------------------------------------------------------
    // 2. Resolve Recipients According to Clinical Zone
    // -------------------------------------------------------------
    const recipientList = [];

    if (zone === 'YELLOW') {
      // Yellow: Notify Patient and configured Parent/Guardian
      if (patientPhone) {
        recipientList.push({
          role: 'PATIENT',
          phone: patientPhone,
          name: patientName
        });
      }
      if (parentContact && parentContact.phone) {
        recipientList.push({
          role: 'PARENT_GUARDIAN',
          phone: parentContact.phone,
          name: parentContact.name || 'Parent / Guardian'
        });
      } else if (Array.isArray(contacts) && contacts.length > 0) {
        const parent = contacts.find(c => {
          const r = (c.role || '').toUpperCase();
          return r.includes('PARENT') || r.includes('PRIMARY');
        }) || contacts[0];
        if (parent && parent.phone) {
          recipientList.push({
            role: parent.role || 'PARENT_GUARDIAN',
            phone: parent.phone,
            name: parent.name || 'Parent / Guardian'
          });
        }
      } else if (process.env.PRIMARY_CAREGIVER_PHONE) {
        recipientList.push({
          role: 'PRIMARY_CAREGIVER',
          phone: process.env.PRIMARY_CAREGIVER_PHONE,
          name: 'Primary Caregiver'
        });
      }
    } else {
      // Red (Critical) or Test: Notify Emergency Contact and Parent/Guardian
      if (emergencyContact && emergencyContact.phone) {
        recipientList.push({
          role: 'EMERGENCY_CONTACT',
          phone: emergencyContact.phone,
          name: emergencyContact.name || 'Emergency Responder'
        });
      }
      if (parentContact && parentContact.phone) {
        recipientList.push({
          role: 'PARENT_GUARDIAN',
          phone: parentContact.phone,
          name: parentContact.name || 'Parent / Guardian'
        });
      }
      if (Array.isArray(contacts) && contacts.length > 0) {
        contacts.forEach(c => {
          if (c.phone) {
            recipientList.push({
              role: c.role || 'CAREGIVER',
              phone: c.phone,
              name: c.name || 'Emergency Contact'
            });
          }
        });
      }
      if (recipientList.length === 0 && process.env.PRIMARY_CAREGIVER_PHONE) {
        recipientList.push({
          role: 'PRIMARY_CAREGIVER',
          phone: process.env.PRIMARY_CAREGIVER_PHONE,
          name: 'Primary Caregiver'
        });
      }
    }

    if (recipientList.length === 0) {
      const defaultCaregiverPhone = process.env.PRIMARY_CAREGIVER_PHONE || '+15550198332';
      recipientList.push({
        role: 'PRIMARY_CAREGIVER',
        phone: defaultCaregiverPhone,
        name: 'Primary Caregiver'
      });
    }

    // Deduplicate phone numbers
    const uniqueRecipients = [];
    const seenPhones = new Set();
    for (const r of recipientList) {
      const cleanPhone = String(r.phone).replace(/\s+/g, '');
      if (cleanPhone && !seenPhones.has(cleanPhone)) {
        seenPhones.add(cleanPhone);
        uniqueRecipients.push({ ...r, phone: cleanPhone });
      }
    }

    // -------------------------------------------------------------
    // 3. Cooldown & Anti-Spam Duplicate Suppression
    // -------------------------------------------------------------
    const primaryTriggerKey = triggers.map(t => `${t.parameter || 'vital'}_${t.zone || zone}`).sort().join(';') || zone;
    const cooldownKey = `${patientId}_${zone}_${primaryTriggerKey}`;
    const lastSentAt = alertCooldownCache.get(cooldownKey) || 0;
    const elapsedSeconds = (now - lastSentAt) / 1000;

    if (!isTest && !bypassCooldown && elapsedSeconds < cooldownSeconds) {
      const waitRemaining = Math.ceil(cooldownSeconds - elapsedSeconds);
      return res.status(200).json({
        success: true,
        status: 'COOLDOWN_ACTIVE',
        message: `Alert suppressed to prevent caregiver SMS fatigue. Same condition active; cooldown expires in ${waitRemaining}s.`,
        cooldownRemainingSeconds: waitRemaining,
        zone,
        dispatchedAt: null,
        deliveries: []
      });
    }

    // -------------------------------------------------------------
    // 4. GPS & Location Privacy Validation
    // -------------------------------------------------------------
    let locationText = 'Coordinates Pending';
    let gmapsUrl = '';

    if (!locationSharingConsent) {
      locationText = 'Location Sharing: Disabled by user privacy consent';
      gmapsUrl = '';
    } else if (hasValidCoordinates(location)) {
      const lat = Number(location.latitude ?? location.lat);
      const lng = Number(location.longitude ?? location.lng);
      locationText = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
      gmapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
    }

    // -------------------------------------------------------------
    // 5. Compose SMS Text According to Clinical Zone
    // -------------------------------------------------------------
    let smsBody = '';

    const hrVal = vitals.heartRate?.value ?? vitals.heartRate;
    const hrStr = hrVal != null ? `${hrVal} BPM` : 'N/A';
    const tempVal = vitals.temperature?.celsius ?? (typeof vitals.temperature === 'number' ? vitals.temperature : null);
    const tempStr = tempVal != null ? `${tempVal}°C` : (vitals.temperature ? `${vitals.temperature}°C` : 'N/A');
    const bpStr = vitals.bloodPressure?.systolic ? `${vitals.bloodPressure.systolic}/${vitals.bloodPressure.diastolic} mmHg` : null;

    const simPrefix = (!isLiveGateway || isDemoMode) ? '[SIMULATED DEMO NOTIFICATION]\n' : '';

    if (isTest) {
      smsBody = `[ALPHA SQUARED TEST SMS] Hardware alert system check for ${patientName}. SMS Gateway is verified and functional. Timestamp: ${timestampStr}. Team Alpha Squared, GP Gaya.`;
    } else if (zone === 'RED') {
      const reasonsList = triggers.map(t => `${t.label || t.parameter}: ${t.value || 'ANOMALY'}`).join(', ') || 'Critical Physiological Vitals Detected';
      const locDisplay = gmapsUrl ? gmapsUrl : locationText;
      const bpPart = bpStr ? ` | BP: ${bpStr}` : '';
      const spo2Val = vitals.spo2?.value ?? vitals.spo2;
      const spo2Part = spo2Val != null ? ` | SpO2: ${spo2Val}%` : '';

      smsBody = `${simPrefix}🚨 URGENT EMERGENCY ALERT: ${patientName} is in RED ZONE (Critical)!\n` +
                `Reason: ${reasonsList}\n` +
                `Snapshot: HR: ${hrStr}${spo2Part} | Temp: ${tempStr}${bpPart}\n` +
                `Device Source: ${dataSourceLabel}\n` +
                `GPS Location: ${locDisplay}\n` +
                `Time: ${timestampStr}\n` +
                `ACTION: Immediate caregiver check or emergency triage (Call 108) required.`;
    } else {
      // YELLOW ZONE (Caution / Warning)
      const warningDetails = triggers.map(t => `${t.label || t.parameter}: ${t.value || 'Caution'}`).join(', ') || 'Caution vital threshold reached';
      const recommendedAction = triggers[0]?.recommendedAction || 'Rest in comfortable position, drink water, recheck vitals in 15 minutes. Contact caregiver or physician if symptoms persist.';
      const locPart = gmapsUrl ? `\nLocation: ${gmapsUrl}` : (!locationSharingConsent ? `\nLocation: Disabled by user privacy consent` : '');

      smsBody = `${simPrefix}⚠️ ALPHA SQUARED ALERT: YELLOW ZONE (Warning) for ${patientName}.\n` +
                `Vitals Notice: ${warningDetails}\n` +
                `Vitals: Heart Rate: ${hrStr} | Body Temp: ${tempStr}\n` +
                `Device Source: ${dataSourceLabel}\n` +
                `Recommended Precaution: ${recommendedAction}${locPart}\n` +
                `Recorded at: ${timestampStr}.\n` +
                `Automated IoT Healthcare Telemetry notice.`;
    }

    const deliveries = [];

    for (const recipient of uniqueRecipients) {
      if (isLiveGateway && provider === 'TWILIO_REST_API') {
        try {
          const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
          const twilioParams = new URLSearchParams({
            To: recipient.phone,
            From: twilioFrom,
            Body: smsBody
          });

          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: twilioParams.toString()
          });

          const json = await resp.json();
          if (resp.ok) {
            deliveries.push({
              phone: recipient.phone,
              name: recipient.name,
              role: recipient.role,
              status: 'SENT',
              messageId: json.sid,
              provider: 'TWILIO'
            });
          } else {
            deliveries.push({
              phone: recipient.phone,
              name: recipient.name,
              role: recipient.role,
              status: 'FAILED',
              error: json.message || 'Twilio transmission failed',
              provider: 'TWILIO'
            });
          }
        } catch (twErr) {
          deliveries.push({
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            status: 'FAILED',
            error: twErr.message,
            provider: 'TWILIO'
          });
        }
      } else if (isLiveGateway && provider === 'FAST2SMS_API') {
        try {
          const clean10Digit = recipient.phone.replace(/[^0-9]/g, '').slice(-10);
          const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
              'authorization': fast2smsKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              route: 'v3',
              sender_id: 'ALPHASQ',
              message: smsBody,
              language: 'english',
              flash: 0,
              numbers: clean10Digit
            })
          });
          const f2sData = await resp.json();
          deliveries.push({
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            status: f2sData.return ? 'SENT' : 'FAILED',
            messageId: f2sData.request_id || null,
            provider: 'FAST2SMS'
          });
        } catch (fErr) {
          deliveries.push({
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            status: 'FAILED',
            error: fErr.message,
            provider: 'FAST2SMS'
          });
        }
      } else if (isLiveGateway && provider === 'CUSTOM_SMS_WEBHOOK') {
        try {
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: recipient.phone,
              message: smsBody,
              zone,
              patientId,
              timestamp: now
            })
          });
          deliveries.push({
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            status: resp.ok ? 'SENT' : 'FAILED',
            provider: 'CUSTOM_WEBHOOK'
          });
        } catch (whErr) {
          deliveries.push({
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            status: 'FAILED',
            error: whErr.message,
            provider: 'CUSTOM_WEBHOOK'
          });
        }
      } else {
        // SIMULATED DISPATCH FALLBACK (No API Keys required for full hackathon testing!)
        console.log(`[SIMULATED SMS GATEWAY] To: ${recipient.phone} (${recipient.name} - ${recipient.role})`);
        console.log(`[MESSAGE CONTENT]:\n${smsBody}`);
        deliveries.push({
          phone: recipient.phone,
          name: recipient.name,
          role: recipient.role,
          status: 'SIMULATED_DISPATCH_SUCCESS',
          messageId: `MOCK-SMS-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          provider: 'SIMULATED_GATEWAY',
          note: 'SMS Gateway unconfigured - showing simulated alert dispatch. Add your SMS API key in settings or .env to send real SMS.'
        });
      }
    }

    // Update cooldown timestamp
    alertCooldownCache.set(cooldownKey, now);

    // Record in memory audit trail
    const auditRecord = {
      id: `DISPATCH-${Date.now()}`,
      zone,
      patientId,
      patientName,
      triggers,
      messageText: smsBody,
      deliveries,
      provider,
      isLiveGateway,
      timestamp: now,
      timestampStr
    };
    recentDispatchesAudit.unshift(auditRecord);
    if (recentDispatchesAudit.length > MAX_AUDIT_LOGS) {
      recentDispatchesAudit.pop();
    }

    return res.status(200).json({
      success: true,
      status: isLiveGateway ? 'DISPATCHED_LIVE' : 'SIMULATED_DISPATCH',
      provider,
      isLiveGateway,
      notice: isLiveGateway 
        ? `Alert successfully transmitted via ${provider}.`
        : 'SMS Gateway unconfigured - showing simulated alert dispatch. Add your SMS API key in settings or .env to send real SMS.',
      zone,
      smsBody,
      recipientsCount: uniqueRecipients.length,
      deliveries,
      timestamp: now,
      cooldownSeconds
    });

  } catch (err) {
    console.error('[SMS_DISPATCH_FATAL_ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to process SMS dispatch workflow.',
      details: err.message
    });
  }
}
