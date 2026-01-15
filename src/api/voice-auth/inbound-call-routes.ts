/**
 * Inbound Call Routes
 *
 * Handles incoming phone calls to Ferni via Twilio.
 * Identifies callers by phone number + voice verification and routes to LiveKit agent.
 *
 * Endpoints:
 * - POST /api/voice/inbound - Twilio webhook for incoming calls
 * - POST /api/voice/inbound/status - Call status updates
 *
 * Flow:
 * 1. Phone calls Ferni number → Twilio receives
 * 2. Twilio hits /api/voice/inbound webhook
 * 3. We look up caller by phone number (sponsored identities + phone mappings)
 * 4. Generate TwiML to connect call to LiveKit SIP with caller context
 * 5. LiveKit agent receives job with caller identity
 *
 * @module api/voice-auth/inbound-call-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { validateTwilioSignature } from '../../services/outreach/webhooks/twilio-webhooks.js';
import { lookupByPhone, recordCall } from '../../services/identity/sponsored-identity.js';
import { identifyByPhone } from '../../services/identity/user-identification.js';
import { sendJson, parseBody } from './helpers.js';

const log = getLogger().child({ module: 'InboundCallRoutes' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const SIP_TRUNK_ID = process.env.SIP_TRUNK_ID || '';
const SIP_INBOUND_TRUNK_ID = process.env.SIP_INBOUND_TRUNK_ID || '';
const FERNI_PHONE_NUMBER = process.env.FERNI_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';

// Track active inbound calls for duration tracking
const activeInboundCalls = new Map<
  string,
  {
    callSid: string;
    callerPhone: string;
    sponsoredIdentityId?: string;
    userId?: string;
    startedAt: Date;
  }
>();

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle inbound call routes.
 * @returns true if the route was handled
 */
export async function handleInboundCallRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  // POST /api/voice/inbound - Main webhook for incoming calls
  if (route === '/inbound' && req.method === 'POST') {
    await handleInboundCallWebhook(req, res);
    return true;
  }

  // POST /api/voice/inbound/status - Call status updates
  if (route === '/inbound/status' && req.method === 'POST') {
    await handleInboundCallStatus(req, res);
    return true;
  }

  return false;
}

// ============================================================================
// INBOUND CALL WEBHOOK
// ============================================================================

/**
 * Twilio webhook payload for incoming calls
 */
interface TwilioIncomingCallPayload {
  CallSid: string;
  AccountSid: string;
  From: string; // Caller's phone number
  To: string; // Our Ferni number
  Direction: string;
  CallerName?: string;
  CallerCity?: string;
  CallerState?: string;
  CallerCountry?: string;
  Called: string;
  Caller: string;
}

/**
 * Handle incoming call webhook from Twilio.
 * This is called when someone dials the Ferni phone number.
 */
async function handleInboundCallWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await parseBody(req)) as unknown as TwilioIncomingCallPayload;

  // Validate Twilio signature (skip in development)
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers['x-twilio-signature'] as string;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || '';
    const fullUrl = `${protocol}://${host}${req.url}`;

    if (
      signature &&
      !validateTwilioSignature(signature, fullUrl, body as unknown as Record<string, string>)
    ) {
      log.warn({ url: req.url }, 'Invalid Twilio signature for inbound call');
      res.writeHead(403, { 'Content-Type': 'text/xml' });
      res.end(generateRejectTwiml('Invalid request signature'));
      return;
    }
  }

  const { CallSid, From, To, CallerName, CallerCity, CallerState } = body;

  log.info(
    {
      callSid: CallSid,
      from: From,
      to: To,
      callerName: CallerName,
      callerLocation: CallerCity ? `${CallerCity}, ${CallerState}` : undefined,
    },
    '📞 Inbound call received'
  );

  // Step 1: Look up caller identity
  const callerInfo = await identifyInboundCaller(From);

  // Step 2: Track the call
  activeInboundCalls.set(CallSid, {
    callSid: CallSid,
    callerPhone: From,
    sponsoredIdentityId: callerInfo.sponsoredIdentityId,
    userId: callerInfo.userId,
    startedAt: new Date(),
  });

  // Step 3: Generate TwiML to connect to LiveKit
  const twiml = generateInboundTwiml({
    callSid: CallSid,
    callerPhone: From,
    callerName: callerInfo.displayName || CallerName,
    userId: callerInfo.userId,
    sponsoredIdentityId: callerInfo.sponsoredIdentityId,
    sponsorUserId: callerInfo.sponsorUserId,
    familyUserId: callerInfo.familyUserId,
    isKnownCaller: callerInfo.isKnown,
    isVoiceEnrolled: callerInfo.voiceEnrolled,
    greeting: callerInfo.greeting,
  });

  log.info(
    {
      callSid: CallSid,
      isKnown: callerInfo.isKnown,
      displayName: callerInfo.displayName,
      voiceEnrolled: callerInfo.voiceEnrolled,
    },
    '✅ Routing inbound call to LiveKit'
  );

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml);
}

// ============================================================================
// CALLER IDENTIFICATION
// ============================================================================

interface CallerIdentification {
  isKnown: boolean;
  displayName?: string;
  userId?: string;
  sponsoredIdentityId?: string;
  sponsorUserId?: string;
  /** Family member's own user ID for memory storage (separate from sponsor) */
  familyUserId?: string;
  voiceEnrolled: boolean;
  greeting: string;
}

/**
 * Identify an inbound caller by their phone number.
 * Checks both sponsored identities and regular phone mappings.
 */
async function identifyInboundCaller(phoneNumber: string): Promise<CallerIdentification> {
  // First, check sponsored identities (for family members)
  try {
    const sponsoredLookup = await lookupByPhone(phoneNumber);

    if (sponsoredLookup.found && sponsoredLookup.identity) {
      const identity = sponsoredLookup.identity;
      const preferredName = identity.preferredName || identity.displayName;

      log.info(
        {
          phone: phoneNumber,
          identityId: identity.id,
          displayName: identity.displayName,
          relationship: identity.relationship,
        },
        '🎉 Recognized sponsored identity'
      );

      return {
        isKnown: true,
        displayName: preferredName,
        userId: identity.id, // Use sponsored identity ID as user ID
        sponsoredIdentityId: identity.id,
        sponsorUserId: identity.sponsorUserId,
        familyUserId: identity.familyUserId, // Family's own memory storage
        voiceEnrolled: identity.voiceEnrolled,
        greeting: identity.voiceEnrolled
          ? `Hi ${preferredName}! Great to hear from you.`
          : `Hi ${preferredName}! I think I know who this is, but let me just confirm.`,
      };
    }
  } catch (error) {
    log.debug({ error: String(error), phone: phoneNumber }, 'Error checking sponsored identities');
  }

  // Second, check regular phone mappings (web users who linked their phone)
  try {
    const phoneIdentification = await identifyByPhone(phoneNumber);

    if (!phoneIdentification.isNew && phoneIdentification.profile) {
      const profile = phoneIdentification.profile;
      const preferredName = profile.preferredName || profile.name || 'friend';

      // Check if user has a voice profile
      let hasVoiceProfile = false;
      try {
        const { loadVoiceProfile } = await import('../../services/voice/voice-profile-store.js');
        const voiceProfile = await loadVoiceProfile(String(phoneIdentification.userId));
        hasVoiceProfile = !!voiceProfile;
      } catch {
        // Voice profile check failed, assume not enrolled
      }

      log.info(
        {
          phone: phoneNumber,
          userId: phoneIdentification.userId,
          name: preferredName,
          voiceEnrolled: hasVoiceProfile,
        },
        '🎉 Recognized linked phone number'
      );

      return {
        isKnown: true,
        displayName: preferredName,
        userId: String(phoneIdentification.userId),
        voiceEnrolled: hasVoiceProfile,
        greeting: `Hi ${preferredName}! Good to hear from you.`,
      };
    }
  } catch (error) {
    log.debug({ error: String(error), phone: phoneNumber }, 'Error checking phone mappings');
  }

  // Unknown caller
  log.info({ phone: phoneNumber }, '❓ Unknown caller');

  return {
    isKnown: false,
    voiceEnrolled: false,
    greeting: "Hi! Welcome to Ferni. I don't recognize this number yet. What's your name?",
  };
}

// ============================================================================
// TWIML GENERATION
// ============================================================================

interface InboundTwimlOptions {
  callSid: string;
  callerPhone: string;
  callerName?: string;
  userId?: string;
  sponsoredIdentityId?: string;
  sponsorUserId?: string;
  familyUserId?: string;
  isKnownCaller: boolean;
  isVoiceEnrolled: boolean;
  greeting: string;
}

/**
 * Generate TwiML to connect inbound call to LiveKit SIP.
 */
function generateInboundTwiml(options: InboundTwimlOptions): string {
  const {
    callSid,
    callerPhone,
    callerName,
    userId,
    sponsoredIdentityId,
    sponsorUserId,
    familyUserId,
    isKnownCaller,
    isVoiceEnrolled,
    greeting,
  } = options;

  // Build context to pass to LiveKit agent via SIP headers
  const context = {
    type: 'inbound_call',
    callSid,
    callerPhone,
    callerName,
    userId,
    sponsoredIdentityId,
    sponsorUserId,
    familyUserId, // Family's own memory storage ID
    isKnownCaller,
    isVoiceEnrolled,
  };

  const contextHeader = Buffer.from(JSON.stringify(context)).toString('base64');

  // Check if LiveKit SIP is configured
  if (LIVEKIT_URL && (SIP_TRUNK_ID || SIP_INBOUND_TRUNK_ID)) {
    // Extract LiveKit hostname for SIP URI
    const livekitHost = new URL(LIVEKIT_URL).hostname;

    // Create a unique room for this inbound call
    const roomName = `inbound_${callSid}`;

    // Generate SIP URI to connect to LiveKit
    // The X-Context header passes caller info to the agent
    const sipUri = `sip:${roomName}@${livekitHost};transport=tls?X-Context=${contextHeader}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Pause length="1"/>
  <Dial callerId="${escapeXml(callerPhone)}" timeout="30">
    <Sip>${sipUri}</Sip>
  </Dial>
  <Say voice="Polly.Joanna">I'm sorry, I wasn't able to connect. Please try again later.</Say>
  <Hangup/>
</Response>`;
  }

  // Fallback: No SIP configured - provide a message
  log.warn('LiveKit SIP not configured for inbound calls');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">I'm sorry, but I'm not set up to receive calls right now. Please try reaching out through the Ferni app or website instead.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML to reject a call.
 */
function generateRejectTwiml(reason: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'm sorry, but I can't take this call right now. ${escapeXml(reason)}</Say>
  <Hangup/>
</Response>`;
}

// ============================================================================
// CALL STATUS
// ============================================================================

/**
 * Handle call status updates from Twilio.
 */
async function handleInboundCallStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await parseBody(req)) as Record<string, string>;

  const { CallSid, CallStatus, CallDuration } = body;

  log.info(
    {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
    },
    '📊 Inbound call status update'
  );

  // Handle call completion
  if (
    CallStatus === 'completed' ||
    CallStatus === 'failed' ||
    CallStatus === 'busy' ||
    CallStatus === 'no-answer'
  ) {
    const callInfo = activeInboundCalls.get(CallSid);

    if (callInfo) {
      // Calculate duration
      const durationMs = Date.now() - callInfo.startedAt.getTime();
      const durationMinutes = Math.ceil(durationMs / 60000);

      // Record call for sponsored identity (if applicable)
      if (callInfo.sponsoredIdentityId) {
        try {
          await recordCall(callInfo.sponsoredIdentityId, durationMinutes);
          log.info(
            {
              callSid: CallSid,
              identityId: callInfo.sponsoredIdentityId,
              duration: durationMinutes,
            },
            '📝 Recorded call for sponsored identity'
          );
        } catch (error) {
          log.error({ error: String(error), callSid: CallSid }, 'Failed to record call');
        }
      }

      // Clean up
      activeInboundCalls.delete(CallSid);
    }
  }

  // Always respond 200 to Twilio
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape XML special characters.
 */
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

export { identifyInboundCaller, generateInboundTwiml, activeInboundCalls };
