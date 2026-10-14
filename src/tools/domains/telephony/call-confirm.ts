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

export const callConfirm: ConfirmSpec = {
  prepare: async (args, userId) => {
    const who = text(args.contactQuery) || 'them';
    const purpose = text(args.purpose);
    let name = who;
    let raw = text(args.phoneNumber);
    if (!raw) {
      const { resolveContact } = await import('./call-on-behalf.js');
      const contact = await resolveContact(who, userId);
      raw = text(contact?.phone);
      if (contact?.name) name = contact.name;
    }
    if (!raw) return `Nothing was dialed: I don't have a number for ${who}. Ask the caller for it.`;
    const number = checkDialableNumber(raw);
    if (!number.ok) return `Nothing was dialed: ${number.reason}.`;
    return {
      args: { ...args, phoneNumber: number.e164 },
      readBack: `a call to ${name} at ${number.spoken}${purpose ? `, to ${purpose}` : ''}`,
    };
  },
};
