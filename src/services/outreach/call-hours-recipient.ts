/**
 * Whose calling hours a proactive call keeps (checkCallHours, call-hours-guard.ts).
 *
 * A call to the member, or to a contact's number that is the member's own verified one, keeps
 * their time zone and quiet hours. A contact's number goes by its area code, the member's zone
 * only as the fallback, as on-behalf calls do (on-behalf-call-orchestrator.ts): never the
 * member's hours on someone else.
 */
import { userTimezone, type CallHoursInput } from './call-hours-guard.js';
import { timezoneFromPhone } from './area-code-timezones.js';
import {
  callQuietHours,
  DEFAULT_QUIET_WINDOW,
  quietEndsAt,
  quietZones,
  type QuietHoursResult,
} from './quiet-hours.js';

export async function callHoursRecipient(
  userId: string,
  phone: string,
  toContact?: boolean
): Promise<CallHoursInput> {
  const member = { recipientPhone: phone, recipientUserId: userId };
  if (!toContact) return member;
  const { isOwnVerifiedPhone } = await import('./guarded-text.js');
  const own = await isOwnVerifiedPhone(userId, phone).catch(() => false);
  return own ? member : { recipientPhone: phone, sponsorUserId: userId };
}

/**
 * Quiet hours with CALL_HOURS_GUARD off. The member's own (callQuietHours). A contact's are the
 * default night (22:00-08:00) read in their zone, by the same order as the guard: their number's
 * area code, the member's zone as the fallback, else both US coasts.
 */
export async function calleeQuietHours(
  callee: CallHoursInput,
  now: Date
): Promise<QuietHoursResult> {
  if (callee.recipientUserId) return callQuietHours(callee.recipientUserId, now);
  const zone =
    timezoneFromPhone(callee.recipientPhone) ??
    (await userTimezone(callee.sponsorUserId).catch(() => undefined));
  const until = quietEndsAt(now, DEFAULT_QUIET_WINDOW, quietZones(zone));
  return { quiet: until.getTime() !== now.getTime(), until };
}
