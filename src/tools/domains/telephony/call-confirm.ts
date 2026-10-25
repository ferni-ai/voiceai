/**
 * What callOnBehalf and callAndConverse read back before the caller's yes
 * (outreach-confirm.ts): who, the exact number that will ring, and why. The
 * confirmed call dials that number and no other, so a number the model
 * misheard or invented is heard by the caller before anything rings.
 *
 * @module tools/domains/telephony/call-confirm
 */

import type { ConfirmSpec } from '../communication/outreach/outreach-confirm.js';
import { checkDialableNumber } from '../../../utils/dialable-number.js';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** "My Dad" and "dad" are the same person to call. */
const person = (v: unknown): string =>
  text(v)
    .toLowerCase()
    .replace(/^my\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * A yes to one call tool's read-back also confirms the other's call to the same
 * number (the same person when no number is given): both place the same call.
 * What rings is still exactly what was read back (number and purpose).
 * Owner call 2026-10-18: callAndConverse after callOnBehalf's read-back who again.
 */
function sameCall(stored: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const raw = text(next.phoneNumber);
  if (raw) {
    const number = checkDialableNumber(raw);
    return number.ok && number.e164 === stored.phoneNumber;
  }
  return (
    person(next.contactQuery) !== '' && person(next.contactQuery) === person(stored.contactQuery)
  );
}

export const callConfirm: ConfirmSpec = {
  sameAction: sameCall,
  prepare: async (args, userId) => {
    const who = text(args.contactQuery) || 'them';
    const purpose = text(args.purpose);
    let name = who;
    let raw = text(args.phoneNumber);
    if (!raw) {
      const { findContact } = await import('./call-on-behalf.js');
      const contact = await findContact(who, userId);
      // Several contacts tie for this: ask which one, read back nothing yet (contact-pick.ts)
      if (contact && 'choices' in contact) {
        const { whichContactReply } = await import('./contact-pick.js');
        return whichContactReply(who, contact.choices);
      }
      raw = text(contact?.phone);
      if (contact?.name) name = contact.name;
    }
    if (!raw) return `Nothing was dialed: I don't have a number for ${who}. Ask the caller for it.`;
    const number = checkDialableNumber(raw);
    if (!number.ok) return `Nothing was dialed: ${number.reason}.`;
    // A call to this number already set for later: say so, rather than read back a second one.
    const { alreadySetReply, pendingCallTo } = await import('./call-on-behalf.js');
    const waiting = await pendingCallTo(userId, number.e164);
    if (waiting) return alreadySetReply(name, waiting);
    return {
      args: { ...args, phoneNumber: number.e164 },
      readBack: `a call to ${name} at ${number.spoken}${purpose ? `, to ${purpose}` : ''}`,
    };
  },
};
