/**
 * Every check callWithPersonaVoice (voice-call.ts) makes before it dials, as one function.
 * The gated referral path (CALL_PATHS_PLACE_OR_HOLD) runs it first too, so that flag only
 * adds gates.
 *
 * @module services/voice/persona-call-refusal
 */

import { checkDialableNumber } from '../../utils/dialable-number.js';

// Read at load, as voice-call.ts reads them
const TWILIO_READY = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
);

export const PAUSED_CALL = 'Not calling: outreach paused';

/** Who a persona-voice call is for. */
export interface PersonaCallParty {
  /** Who the call is for. MESSAGING_PIPELINE: without it, or to someone else without their grant, no call. */
  ownerUid?: string;
  /** The member it is for: a MINOR_CARE_SHARED_HOLD on their account stops the call too. */
  userId?: string;
  askedFor?: boolean; // they asked for or set it; without it a paused owner isn't rung (outreach-pause.ts)
}

/** The number as callWithPersonaVoice dials it (US numbers). */
export function personaE164(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
}

/** Why the persona-voice call can't go, or null to dial. */
export async function personaCallRefusal(
  toPhone: string,
  party?: PersonaCallParty
): Promise<string | null> {
  // Never 911, 988 or any N11 in any spelling, premium-rate or malformed (dialable-number.ts)
  const number = checkDialableNumber(toPhone);
  if (!number.ok) return `Not calling: ${number.reason}`;
  if (!TWILIO_READY) return 'Twilio not configured';
  const e164Phone = personaE164(toPhone);
  const { ownerRefusal } = await import('../messaging/consent-reach.js'); // MESSAGING_PIPELINE
  const refused = await ownerRefusal(party?.ownerUid, e164Phone, 'call'); // fails closed
  if (refused) return `Not calling: ${refused}`;
  const { heldSender } = await import('../outreach/checkin-replies.js'); // MINOR_CARE_SHARED_HOLD
  if (await heldSender(party?.userId, e164Phone)) return 'Not calling: held';
  const { outreachPausedFor } = await import('../outreach/outreach-pause.js');
  if (!party?.askedFor && (await outreachPausedFor(party?.ownerUid, e164Phone))) return PAUSED_CALL;
  return null;
}
