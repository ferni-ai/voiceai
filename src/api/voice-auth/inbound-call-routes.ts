/**
 * Inbound Call Routes
 *
 * Handles incoming phone calls to Ferni via Twilio.
 * Routes them to the LiveKit agent without naming the caller: caller ID can be
 * spoofed, so identity is decided in the agent from the signed attestation.
 *
 * Endpoints:
 * - POST /api/voice/inbound - Twilio webhook for incoming calls
 * - POST /api/voice/inbound/status - Call status updates
 *
 * Flow:
 * 1. Phone calls Ferni number → Twilio receives
 * 2. Twilio hits /api/voice/inbound webhook
 * 3. Generate TwiML to connect the call to LiveKit SIP (with a signed
 *    attestation token when PHONE_ATTEST_SECRET + LIVEKIT_SIP_HOST are set)
 * 4. The LiveKit agent verifies the token before trusting the caller ID
 *
 * @module api/voice-auth/inbound-call-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { maskPhoneNumber } from '../../services/identity/phone-attestation.js';
import { escapeXml, generateAttestedTwiml, phoneAttestConfig } from './attested-twiml.js';
import { parseRawBody } from '../helpers.js';
import { isSignedByTwilio } from '../twilio-callback-signature.js';

const log = getLogger().child({ module: 'InboundCallRoutes' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
// SIP_TRUNK_ID is the outbound trunk (calls Ferni places); only the inbound trunk decides inbound routing.
const SIP_INBOUND_TRUNK_ID = process.env.SIP_INBOUND_TRUNK_ID || '';

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
  /** STIR/SHAKEN result for From, e.g. TN-Validation-Passed-A. */
  StirVerstat?: string;
}

/**
 * Handle incoming call webhook from Twilio.
 * This is called when someone dials the Ferni phone number.
 *
 * From is whatever caller ID the calling network sent, and anyone can set it,
 * so the number names no one here: no account lookup, and nothing about the
 * caller in the TwiML (a greeting by name would tell a spoofer whose number
 * they borrowed). The agent decides who is calling once the signed
 * attestation verifies.
 */
async function handleInboundCallWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const form = await readSignedTwilioForm(req, res);
  if (!form) return;
  const body = form as unknown as TwilioIncomingCallPayload;

  const { CallSid, From, To, StirVerstat } = body;

  log.info(
    {
      callSid: CallSid,
      from: maskPhoneNumber(From),
      to: maskPhoneNumber(To),
      verstat: StirVerstat,
    },
    '📞 Inbound call received'
  );

  // With attestation configured, dial the LiveKit trunk carrying a token the
  // agent can check; otherwise a plain dial that carries nothing about the caller.
  const attestConfig = phoneAttestConfig();
  const twiml = attestConfig
    ? generateAttestedTwiml(attestConfig, {
        callSid: CallSid,
        from: From,
        to: To,
        verstat: StirVerstat,
      })
    : generateInboundTwiml({ callSid: CallSid, callerPhone: From });

  log.info({ callSid: CallSid, attested: !!attestConfig }, '✅ Routing inbound call to LiveKit');

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml);
}

// ============================================================================
// TWIML GENERATION
// ============================================================================

interface InboundTwimlOptions {
  callSid: string;
  callerPhone: string;
}

/**
 * Generate TwiML to connect inbound call to LiveKit SIP when attestation is
 * not configured. No <Say> greeting: the agent greets.
 */
function generateInboundTwiml(options: InboundTwimlOptions): string {
  const { callSid, callerPhone } = options;

  // Check if LiveKit SIP is configured
  if (LIVEKIT_URL && SIP_INBOUND_TRUNK_ID) {
    // Extract LiveKit hostname for SIP URI
    const livekitHost = new URL(LIVEKIT_URL).hostname;

    // Create a unique room for this inbound call
    const roomName = `inbound_${callSid}`;
    const sipUri = `sip:${roomName}@${livekitHost};transport=tls`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerPhone)}" timeout="30">
    <Sip>${escapeXml(sipUri)}</Sip>
  </Dial>
  <Say voice="Polly.Joanna">I'm sorry, I wasn't able to connect. Please try again later.</Say>
  <Hangup/>
</Response>`;
  }

  // Fallback: No SIP configured - provide a message
  log.warn('LiveKit SIP not configured for inbound calls');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
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
  const body = await readSignedTwilioForm(req, res);
  if (!body) return;

  const { CallSid, CallStatus, CallDuration } = body;

  log.info(
    {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
    },
    '📊 Inbound call status update'
  );

  // Always respond 200 to Twilio
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Twilio's form post (application/x-www-form-urlencoded; the JSON-only
 * parseBody read it as {}), or null after a 403 when X-Twilio-Signature is
 * missing or doesn't match. There is no environment in which it is skipped.
 */
async function readSignedTwilioForm(
  req: IncomingMessage,
  res: ServerResponse
): Promise<Record<string, string> | null> {
  const form = Object.fromEntries(new URLSearchParams(await parseRawBody(req)));
  if (isSignedByTwilio(req, req.url ?? '', form)) return form;
  log.warn({ url: req.url }, 'Missing or invalid Twilio signature for inbound call');
  res.writeHead(403, { 'Content-Type': 'text/xml' });
  res.end(generateRejectTwiml('Invalid request signature'));
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { generateInboundTwiml };
