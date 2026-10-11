/**
 * A phone call should get the same Ferni as the app, once we know who it is.
 *
 * The app's dispatch carries the browser's time zone; a phone call carries
 * none. So a caller Ferni knew by phone got no time of day in the greeting,
 * "you don't know the caller's local time" in the prompt, and memories dated
 * "UTC, caller time zone unknown", even with their profile loaded. And the
 * turn-1 commitment prefetch ran before phone recognition named the account,
 * so it never ran for a phone caller.
 *
 * PHONE_PARITY=on (default off) closes those two gaps for a verified owner
 * only: a phone caller recognised by a signed attestation, or an account named
 * by an authenticated dispatch (sessionIsVerifiedOwner). An unverified number
 * still gets nothing from anyone's account, and a call Ferni placed for
 * someone else keeps the sponsor's profile out.
 *
 * @module agents/voice-agent-entry/phone-parity
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { rememberCallerTimeZone } from '../../memory/operations/call-moment.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { isValidTimeZone } from '../shared/time-context.js';
import { sessionIsVerifiedOwner } from './caller-recognition.js';

export function phoneParityEnabled(env: Env = process.env): boolean {
  return flagOn('PHONE_PARITY', env);
}

/**
 * The caller's time zone for this call: the browser's, else (PHONE_PARITY)
 * the verified owner's profile zone. Undefined when neither applies.
 */
export function callerZoneFor(
  sessionId: string,
  browserZone: unknown,
  profileZone: unknown,
  env: Env = process.env
): string | undefined {
  if (isValidTimeZone(browserZone)) return browserZone;
  if (!phoneParityEnabled(env) || !isValidTimeZone(profileZone)) return undefined;
  if (!sessionIsVerifiedOwner(sessionId) || outboundPartiesFor(sessionId)) return undefined;
  return profileZone;
}

/**
 * Settle the call's zone at session start: on userData (prompt, greeting,
 * seeds) and for the memory writers keyed by session or conversation id.
 */
export function settleCallerZone(
  sessionId: string,
  browserZone: unknown,
  services: {
    userProfile?: { contactInfo?: { timezone?: string } } | null;
    realtimeConversationId?: string;
  },
  userData: { callerTimezone?: string } | undefined,
  env: Env = process.env
): string | undefined {
  const profileZone = services.userProfile?.contactInfo?.timezone;
  const zone = callerZoneFor(sessionId, browserZone, profileZone, env);
  if (userData && zone) userData.callerTimezone = zone;
  rememberCallerTimeZone(zone, sessionId, services.realtimeConversationId);
  return zone;
}
