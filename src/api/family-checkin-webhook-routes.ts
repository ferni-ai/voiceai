/**
 * Family Check-in Webhook Routes
 *
 * Handles Twilio callbacks for family check-in calls:
 * - Status updates (initiated, ringing, answered, completed)
 * - Speech gathering responses
 *
 * Both check the Twilio signature whenever a Twilio auth token is configured,
 * and always in production. There is no call-completion route: the old
 * unauthenticated POST /api/family-checkin/complete/:callId let anyone write a
 * call record and trigger an urgent SMS to any user, and nothing called it.
 *
 * @module api/family-checkin-webhook-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { isSignedByTwilio } from './twilio-callback-signature.js';

const log = createLogger({ module: 'FamilyCheckinWebhooks' });

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Handle all family check-in webhook routes
 */
export async function handleFamilyCheckinWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle family check-in webhooks
  if (!pathname.startsWith('/api/family-checkin/')) {
    return false;
  }

  // POST /api/family-checkin/status/:callId - Call status webhook
  if (pathname.startsWith('/api/family-checkin/status/') && req.method === 'POST') {
    const callId = pathname.split('/').pop() || '';
    await handleStatusCallback(req, res, callId);
    return true;
  }

  // POST /api/family-checkin/response/:callId - Speech gathering response
  if (pathname.startsWith('/api/family-checkin/response/') && req.method === 'POST') {
    const callId = pathname.split('/').pop() || '';
    await handleSpeechResponse(req, res, callId);
    return true;
  }

  return false;
}

// ============================================================================
// STATUS CALLBACK (Twilio)
// ============================================================================

/**
 * Handle call status updates from Twilio
 * Events: initiated, ringing, answered, completed, busy, failed, no-answer
 */
async function handleStatusCallback(
  req: IncomingMessage,
  res: ServerResponse,
  callId: string
): Promise<void> {
  const body = await parseBody(req);

  if (mustVerifyTwilio() && !validateTwilioRequest(req, res, body)) return;

  const { CallSid, CallStatus, CallDuration, To, AnsweredBy } = body;

  log.info(
    {
      callId,
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
      to: To,
      answeredBy: AnsweredBy,
    },
    '📞 Family check-in status update'
  );

  try {
    // Update the call record based on status
    const { completeCallRecord } = await import('../services/family/proactive-family-checkin.js');

    // Get sponsorUserId from call record
    const { getCallRecordById } = await import('../services/family/proactive-family-checkin.js');
    const record = await getCallRecordById(callId);

    if (!record) {
      log.warn({ callId }, 'Call record not found for status update');
      sendTwimlResponse(res);
      return;
    }

    // Map Twilio status to our status
    const statusMap: Record<
      string,
      'in_progress' | 'completed' | 'no_answer' | 'failed' | 'voicemail'
    > = {
      initiated: 'in_progress',
      ringing: 'in_progress',
      'in-progress': 'in_progress',
      answered: 'in_progress',
      completed: 'completed',
      busy: 'failed',
      failed: 'failed',
      'no-answer': 'no_answer',
      canceled: 'failed',
    };

    const ourStatus = statusMap[CallStatus] || 'in_progress';

    // Only update on terminal states
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      // Check if it was a voicemail
      const isVoicemail = AnsweredBy === 'machine_end_beep' || AnsweredBy === 'machine_end_silence';

      await completeCallRecord(record.sponsorUserId, callId, {
        status: isVoicemail ? 'voicemail' : ourStatus,
        durationSeconds: parseInt(CallDuration || '0', 10),
      });

      log.info({ callId, status: ourStatus, isVoicemail }, '📞 Call status finalized');
    }
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Error processing status callback');
  }

  // Always respond 200 to Twilio
  sendTwimlResponse(res);
}

// ============================================================================
// SPEECH RESPONSE (Twilio Gather)
// ============================================================================

/**
 * Handle speech response from Twilio's <Gather> verb
 * This receives the family member's spoken response
 */
async function handleSpeechResponse(
  req: IncomingMessage,
  res: ServerResponse,
  callId: string
): Promise<void> {
  const body = await parseBody(req);

  if (mustVerifyTwilio() && !validateTwilioRequest(req, res, body)) return;

  const { SpeechResult, Confidence, CallSid } = body;

  log.info(
    {
      callId,
      callSid: CallSid,
      speechResultLen: SpeechResult?.length,
      confidence: Confidence,
    },
    '🎤 Family check-in speech response'
  );

  try {
    // Get the call record to get context
    const { getCallRecordById } = await import('../services/family/proactive-family-checkin.js');
    const record = await getCallRecordById(callId);

    if (!record) {
      log.warn({ callId }, 'Call record not found for speech response');
      // Return a graceful response
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for sharing. I'll let your family know you're doing well. Take care!</Say>
  <Hangup/>
</Response>`);
      return;
    }

    // Store the response in the transcript (for TTS-only calls)
    // For LiveKit SIP calls, the transcript is captured by the voice agent

    // Analyze the response for concerns
    if (SpeechResult) {
      const transcript = [
        { role: 'ferni' as const, content: 'How are you doing today?' },
        { role: 'family_member' as const, content: SpeechResult },
      ];

      const { analyzeCheckinCall, generateUrgentNotification } =
        await import('../services/family/family-checkin-summary.js');

      const analysis = await analyzeCheckinCall(
        transcript,
        record.familyMemberName,
        'your family member', // Would need sponsor name from DB
        'family'
      );

      // Update call record with analysis
      const { completeCallRecord } = await import('../services/family/proactive-family-checkin.js');

      await completeCallRecord(record.sponsorUserId, callId, {
        status: 'completed',
        detectedMood: analysis.mood,
        moodConfidence: analysis.moodConfidence,
        conversationSummary: analysis.summary,
        topicsDiscussed: analysis.topics,
        concernsIdentified: analysis.concerns,
        positiveHighlights: analysis.positives,
        transcript: JSON.stringify(transcript),
      });

      // Check for urgent concerns
      if (analysis.concerns.some((c) => c.urgency === 'urgent' || c.urgency === 'high')) {
        const notification = generateUrgentNotification({
          ...record,
          concernsIdentified: analysis.concerns,
        });

        if (notification) {
          // Log urgent concerns - notification handling is done via push/SMS in handleCheckinCallComplete
          log.info(
            { callId, concerns: analysis.concerns.length, notification },
            '🚨 Urgent concerns detected'
          );
        }
      }
    }

    // Generate follow-up TwiML
    const followUpTwiml = generateFollowUpTwiml(callId, SpeechResult, record.familyMemberName);

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(followUpTwiml);
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Error processing speech response');

    // Return graceful error response
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for talking with me today. Take care!</Say>
  <Hangup/>
</Response>`);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate follow-up TwiML based on response
 */
function generateFollowUpTwiml(
  callId: string,
  speechResult: string | undefined,
  familyMemberName: string
): string {
  // Simple sentiment check
  const lowerResponse = (speechResult || '').toLowerCase();
  const isPositive = /good|great|fine|well|happy|wonderful|excellent/.test(lowerResponse);
  const isNegative = /bad|terrible|awful|sick|pain|worried|scared|lonely/.test(lowerResponse);

  let response: string;

  if (isNegative) {
    response = `I'm sorry to hear that, ${familyMemberName}. I'll make sure to let your family know so they can check on you. Is there anything specific you'd like me to pass along to them?`;
  } else if (isPositive) {
    response = `That's wonderful to hear! I'm so glad you're doing well. Your family will be happy to know. Is there anything you'd like me to tell them?`;
  } else {
    response = `Thank you for sharing that with me. Is there anything specific you'd like me to pass along to your family?`;
  }

  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_URL || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(response)}</Say>
  <Gather input="speech" timeout="5" action="${webhookBaseUrl}/api/family-checkin/final/${callId}">
    <Say voice="Polly.Joanna">Take your time.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Alright, I'll let them know we talked. Take care, ${escapeXml(familyMemberName)}!</Say>
  <Hangup/>
</Response>`;
}

async function parseBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        // Twilio sends form-urlencoded data
        const params = new URLSearchParams(data);
        const result: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/** Verify whenever a Twilio auth token is set, and always in production (fails closed there). */
function mustVerifyTwilio(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.TWILIO_AUTH_TOKEN);
}

function validateTwilioRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: Record<string, string>
): boolean {
  if (!isSignedByTwilio(req, req.url ?? '', body)) {
    log.warn({ url: req.url }, 'Missing or invalid Twilio signature');
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid signature' }));
    return false;
  }
  return true;
}

function sendTwimlResponse(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleFamilyCheckinWebhookRoutes;
