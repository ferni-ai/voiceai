/**
 * Signed phone attestation on the inbound Twilio webhook: when configured, the
 * TwiML dials the LiveKit SIP trunk with an X-Ferni-Attest token the agent can
 * verify. Split from inbound-call-routes.ts to keep that file under 500 lines.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  mintPhoneAttestation,
  PHONE_ATTEST_HEADER,
} from '../../services/identity/phone-attestation.js';

const log = getLogger().child({ module: 'InboundCallRoutes' });

export interface PhoneAttestConfig {
  secret: string;
  sipHost: string;
}

/** A bare host[:port] — anything else could inject URI parameters or headers. */
const SIP_HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/**
 * PHONE_ATTEST_SECRET + LIVEKIT_SIP_HOST (e.g. `<project>.sip.livekit.cloud`),
 * read per request. Either missing (or a malformed host) ⇒ null ⇒ today's TwiML.
 */
export function phoneAttestConfig(env: NodeJS.ProcessEnv = process.env): PhoneAttestConfig | null {
  const secret = env.PHONE_ATTEST_SECRET ?? '';
  const sipHost = (env.LIVEKIT_SIP_HOST ?? '').trim();
  if (!secret || !sipHost) return null;
  if (!SIP_HOST_PATTERN.test(sipHost)) {
    log.warn('LIVEKIT_SIP_HOST is not a bare host[:port]; phone attestation disabled');
    return null;
  }
  return { secret, sipHost };
}

/**
 * Dial the Ferni number on the LiveKit SIP trunk (the same route a call takes
 * without this webhook), adding X-Ferni-Attest: a short-lived token binding
 * this call's From/To/StirVerstat, minted only because Twilio signed this
 * request. No <Say> greeting: the agent greets, as on the direct trunk path.
 */
export function generateAttestedTwiml(
  config: PhoneAttestConfig,
  call: { callSid: string; from: string; to: string; verstat?: string }
): string {
  const token = mintPhoneAttestation(call, config.secret);
  const sipUri = `sip:${call.to}@${config.sipHost};transport=tls?${PHONE_ATTEST_HEADER}=${token}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(call.from)}" timeout="30">
    <Sip>${escapeXml(sipUri)}</Sip>
  </Dial>
  <Say voice="Polly.Joanna">I'm sorry, I wasn't able to connect. Please try again later.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Escape XML special characters.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
