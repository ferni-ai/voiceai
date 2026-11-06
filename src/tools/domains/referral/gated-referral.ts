/**
 * A referral call (inviteFriendByCall, sendSupportCall) with CALL_PATHS_PLACE_OR_HOLD
 * on: placed through placeOrHold (telephony/gated-call-port.ts), never past the
 * recipient's call hours, the do-not-call list or call compliance, and tracked as
 * started when it rings, never as "called".
 *
 * @module tools/domains/referral/gated-referral
 */
import { callPathsGated, placeGatedCall } from '../telephony/index.js';

/** A referral call, as the referral tools ask for one. */
interface ReferralCall {
  referrerId: string;
  referrerName: string;
  recipientName: string;
  recipientPhone: string;
}

/** What a referral tool answers: `reply`, when set, is said as is (held or refused). */
interface ReferralAnswer {
  success: boolean;
  callSid?: string;
  error?: string;
  reply?: string;
}

/** How the referral tools record a referral call. */
type TrackReferral = (call: ReferralCall & { callSid: string; status: 'started' }) => Promise<void>;

/**
 * Null when the flag is off: the one-way call runs, as before. `message` (the
 * intro the one-way call would play) is the agent's context. The purpose stays short
 * and is said to the referrer, as the held reply says it ("I'll call at 9 to let Ana
 * know you're thinking of them"). This is a live call, so neither reply promises a
 * recorded hello.
 */
export async function gatedReferral(
  referral: ReferralCall,
  message: string,
  track: TrackReferral
): Promise<ReferralAnswer | null> {
  if (!callPathsGated()) return null;
  // First, main's own checks (the flag only adds gates); refused, the tool says main's words.
  const { personaCallRefusal } = await import('../../../services/voice/persona-call-refusal.js');
  const blocked = await personaCallRefusal(referral.recipientPhone, {
    ownerUid: referral.referrerId,
    userId: referral.referrerId,
  });
  if (blocked) return { success: false, error: blocked };
  const name = referral.recipientName;
  const placement = await placeGatedCall({
    userId: referral.referrerId,
    userName: referral.referrerName,
    contactName: name,
    phone: referral.recipientPhone,
    purpose: `let ${name} know you're thinking of them`,
    context: message.trim(),
    objective: 'deliver_message',
    callType: 'personal',
  });
  if ('held' in placement) return { success: false, reply: placement.held };
  if ('refused' in placement) {
    const reply = `I didn't call ${name}: ${placement.refused}. No call was made.`;
    return { success: false, error: placement.refused, reply };
  }
  await track({ ...referral, callSid: placement.placed, status: 'started' });
  const reply = `I'm calling ${name} now to let them know you're thinking of them.`;
  return { success: true, callSid: placement.placed, reply };
}
