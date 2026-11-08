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
 * when the caller is that verified owner: a phone
 * caller recognised by a signed attestation, or an account named by an
 * authenticated dispatch (sessionIsVerifiedOwner). A caller matched only by
 * their number never gets the account's zone (with CALLER_RECOGNITION off,
 * such a caller still keeps the account's id and memory; that is #877's
 * call), and a call Ferni placed for someone else keeps the sponsor's out.
 *
 * A verified owner's zone dates their memories and sets the local clock (both
 * read the zone recorded for the call). It is never put on userData: only the
 * browser's zone is, which the prompt, greeting and presence sounds read.
 *
 * @module agents/voice-agent-entry/phone-parity
 */
import { rememberCallerTimeZone } from '../../memory/operations/call-moment.js';
import { profileOnceLoaded } from '../../services/session/deferred-profile.js';
import { markZonelessCall } from '../../utils/caller-time-zone.js';
import { registerCleanup } from '../session/event-cleanup-registry.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { isValidTimeZone } from '../shared/time-context.js';
import { sessionIsVerifiedOwner } from './caller-recognition.js';

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
 * Otherwise the call starts with no zone, under its own ids and (until it ends)
 * for lookups by its user id alone, so it inherits no other call's zone. The
 * verified owner's profile zone is added once the profile has loaded: on the
 * multi-agent fast path it loads after this runs. Resolves to the call's zone.
 */
export async function settleCallerZone(
  call: { sessionId: string; userId?: string | null; onBehalf: boolean },
  browserZone: unknown,
  services: ZoneServices | undefined,
  userData: { callerTimezone?: string } | undefined
): Promise<string | undefined> {
  const { sessionId, userId } = call;
  const conversationId = services?.realtimeConversationId;
  if (isValidTimeZone(browserZone)) {
    if (userData) userData.callerTimezone = browserZone;
    rememberCallerTimeZone(browserZone, sessionId, conversationId, userId);
    return browserZone;
  }
  const release = markZonelessCall(sessionId, userId, conversationId);
  registerCleanup(sessionId, 'resource', 'zoneless call (phone-parity)', release);
  if (call.onBehalf || !services) return undefined;
  const profile = await profileOnceLoaded(services);
  const zone = verifiedOwnerProfileZone(sessionId, profile?.contactInfo?.timezone);
  if (!zone) return undefined;
  release();
  rememberCallerTimeZone(zone, sessionId, conversationId, userId);
  return zone;
}
