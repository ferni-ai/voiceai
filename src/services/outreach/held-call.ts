/**
 * MINOR_CARE_SHARED_HOLD for proactive calls (conversational-calls.ts): no call to an account or a
 * number a call held under 18 (minor-care-shared-hold.ts), checked when it is scheduled and again
 * at the dial.
 *
 * The one exemption is the person's own in-call "call me" (call-user-adapter.ts). It is marked in
 * code with asOwnCallMe, never by the request's `reason` (free text other paths copy from their own
 * context, makeConversationalCall) or by stored data (a deferred call is re-read, unmarked, and is
 * held). It skips the hold only to the account's own verified phone, re-read here as
 * ringsWithLiveAgent does.
 *
 * @module services/outreach/held-call
 */
import { heldSender, toE164 } from './checkin-replies.js';
import { userReach } from './user-reach.js';

/** Requests the in-call "call me" adapter made, and the scheduled calls built from them. */
const ownCallMe = new WeakSet<object>();

/** call-user-adapter.ts only: this request is the caller's own "call me", asked for just now. */
export function asOwnCallMe<T extends object>(request: T): T {
  ownCallMe.add(request);
  return request;
}

/** Their own "call me", asked for just now (asOwnCallMe), or a call built from one. */
export const isOwnCallMe = (call: object): boolean => ownCallMe.has(call);

/** The call built from `from` (the scheduled record) keeps its mark, in this process only. */
export function carryOwnCallMe(from: object, to: object): void {
  if (ownCallMe.has(from)) ownCallMe.add(to);
}

/** This call must not ring: the account or the number is held, unless it is their own "call me". */
export async function heldCall(call: { userId: string; phoneNumber: string }): Promise<boolean> {
  if (!(await heldSender(call.userId, call.phoneNumber))) return false;
  if (!ownCallMe.has(call)) return true;
  const { phone } = await userReach(call.userId, 'voice_call', { standingOptIn: false });
  return !phone || phone !== toE164(call.phoneNumber);
}
