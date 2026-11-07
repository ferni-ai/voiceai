/**
 * Whose calling hours a proactive call keeps (checkCallHours, call-hours-guard.ts).
 *
 * A call to the member, or to a contact's number that is the member's own verified one, keeps
 * their time zone and quiet hours. A contact's number goes by its area code, the member's zone
 * only as the fallback, as on-behalf calls do (on-behalf-call-orchestrator.ts): never the
 * member's hours on someone else.
 */
import type { CallHoursInput } from './call-hours-guard.js';

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
