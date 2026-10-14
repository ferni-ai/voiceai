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
 * A profile's zone belongs to the account's owner, so it reaches a call only
 * when the caller is that verified owner, with or without the flag: a phone
 * caller recognised by a signed attestation, or an account named by an
 * authenticated dispatch (sessionIsVerifiedOwner). A caller matched only by
 * their number gets nothing from the account, and a call Ferni placed for
 * someone else keeps the sponsor's zone out.
 *
 * Without the flag, a verified owner's zone dates their memories and sets the
 * local clock (both read the zone recorded for the call). PHONE_PARITY=on
 * (default off) also puts it on userData, where the prompt, greeting and
 * presence sounds read it.
 *
 * @module agents/voice-agent-entry/phone-parity
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { rememberCallerTimeZone } from '../../memory/operations/call-moment.js';
import { profileOnceLoaded } from '../../services/session/deferred-profile.js';
import { forgetCallerTimeZone } from '../../utils/caller-time-zone.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { isValidTimeZone } from '../shared/time-context.js';
import { sessionIsVerifiedOwner } from './caller-recognition.js';

export function phoneParityEnabled(env: Env = process.env): boolean {
  return flagOn('PHONE_PARITY', env);
}

/**
 * The profile's zone when this call's caller is its verified owner. Undefined
 * for anyone else, and on a call Ferni placed for someone.
 */
export function verifiedOwnerProfileZone(
  sessionId: string,
  profileZone: unknown
): string | undefined {
  if (!isValidTimeZone(profileZone)) return undefined;
  if (!sessionIsVerifiedOwner(sessionId) || outboundPartiesFor(sessionId)) return undefined;
  return profileZone;
}

interface ZoneServices {
  userProfile?: { contactInfo?: { timezone?: string } } | null;
  realtimeConversationId?: string;
}

/**
 * Settle the call's zone at session start. The browser's zone applies at once.
 * Otherwise the call starts with no zone (an earlier call's zone under the same
 * ids is forgotten), and the verified owner's profile zone is added once the
 * profile has loaded: on the multi-agent fast path it loads after this runs.
 * Resolves to the zone recorded for the call.
 */
export async function settleCallerZone(
  call: { sessionId: string; userId?: string | null; onBehalf: boolean },
  browserZone: unknown,
  services: ZoneServices | undefined,
  userData: { callerTimezone?: string } | undefined,
  env: Env = process.env
): Promise<string | undefined> {
  const ids = [call.sessionId, services?.realtimeConversationId, call.userId];
  if (isValidTimeZone(browserZone)) {
    if (userData) userData.callerTimezone = browserZone;
    rememberCallerTimeZone(browserZone, ...ids);
    return browserZone;
  }
  forgetCallerTimeZone(...ids);
  if (call.onBehalf || !services) return undefined;
  const profile = await profileOnceLoaded(services);
  const zone = verifiedOwnerProfileZone(call.sessionId, profile?.contactInfo?.timezone);
  if (!zone) return undefined;
  rememberCallerTimeZone(zone, ...ids);
  if (userData && phoneParityEnabled(env)) userData.callerTimezone ??= zone;
  return zone;
}
