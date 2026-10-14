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
 * A profile's zone is the account owner's, so it reaches a call only for a
 * verified owner (verifiedOwnerProfileZone), flag or not: a phone caller
 * recognised by a signed attestation, or an account named by an authenticated
 * dispatch (sessionIsVerifiedOwner). An unverified number gets nothing from
 * anyone's account, and a call Ferni placed for someone else keeps the
 * sponsor's zone out. PHONE_PARITY=on (default off) also puts that zone on
 * userData, where the prompt, greeting and seeds read it.
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
 * The profile's zone when this call's caller is its verified owner, never for
 * an unverified caller or a call Ferni placed for someone else.
 */
export function verifiedOwnerProfileZone(
  sessionId: string,
  profileZone: unknown
): string | undefined {
  if (!isValidTimeZone(profileZone)) return undefined;
  if (!sessionIsVerifiedOwner(sessionId) || outboundPartiesFor(sessionId)) return undefined;
  return profileZone;
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
  return phoneParityEnabled(env) ? verifiedOwnerProfileZone(sessionId, profileZone) : undefined;
}

/**
 * Settle the call's zone at session start. The memory writers (keyed by
 * session, conversation and user id) get the browser's zone, else the verified
 * owner's profile zone; userData (prompt, greeting, seeds) gets callerZoneFor.
 */
export function settleCallerZone(
  call: { sessionId: string; userId?: string | null; onBehalf: boolean },
  browserZone: unknown,
  services:
    | {
        userProfile?: { contactInfo?: { timezone?: string } } | null;
        realtimeConversationId?: string;
      }
    | undefined,
  userData: { callerTimezone?: string } | undefined,
  env: Env = process.env
): string | undefined {
  const { sessionId } = call;
  const profileZone = services?.userProfile?.contactInfo?.timezone;
  const memoryZone = isValidTimeZone(browserZone)
    ? browserZone
    : call.onBehalf
      ? undefined
      : verifiedOwnerProfileZone(sessionId, profileZone);
  const zone = callerZoneFor(sessionId, browserZone, call.onBehalf ? undefined : profileZone, env);
  if (userData && zone) userData.callerTimezone = zone;
  rememberCallerTimeZone(memoryZone, sessionId, services?.realtimeConversationId, call.userId);
  return zone;
}
