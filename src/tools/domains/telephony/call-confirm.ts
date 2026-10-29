/**
 * What callOnBehalf and callAndConverse read back before the caller's yes
 * (outreach-confirm.ts): who, the exact number that will ring, and why. The
 * confirmed call dials that number and no other, so a number the model
 * misheard or invented is heard by the caller before anything rings.
 *
 * @module tools/domains/telephony/call-confirm
 */

import type { ConfirmSpec } from '../communication/outreach/outreach-confirm.js';
import { flagOn } from '../../../config/env-flag.js';
import { checkDialableNumber } from '../../../utils/dialable-number.js';
import {
  askAboutNumber,
  GIVEN,
  rememberOnYes,
  resolveOwnerContact,
  savableNumber,
  type GivenNumber,
} from './owner-contact.js';

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
  prepare: async (args, userId, _plan, session) => {
    const who = text(args.contactQuery) || 'them';
    const purpose = text(args.purpose);
    let name = who;
    let raw = text(args.phoneNumber);
    let relationship: string | undefined;
    const given = raw !== ''; // the owner's own number for them, not one looked up
    if (!raw) {
      const { findContact } = await import('./call-on-behalf.js');
      const contact = await findContact(who, userId);
      // CONTACT_PICK_V2: several match, or only a name like "Father Tom": ask, read back nothing
      if (contact && 'ask' in contact) return contact.ask;
      raw = text(contact?.phone);
      if (contact?.name) name = contact.name;
      relationship = contact?.relationship;
    }
    if (!raw) return `Nothing was dialed: I don't have a number for ${who}. Ask the caller for it.`;
    const number = checkDialableNumber(raw);
    if (!number.ok) return `Nothing was dialed: ${number.reason}.`;
    // The owner's call-now to family (CALL_NOW_OWNER_OVERRIDE) replaces a call set for later.
    const { alreadySetReply, pendingCallTo, wantsCallNow } = await import('./call-on-behalf.js');
    const resolvedContact = { name, phone: number.e164, relationship };
    const now = wantsCallNow({
      callNow: args.callNow === true,
      contactQuery: who,
      resolvedContact,
    });
    // A call to this number already set for later: say so, rather than read back a second one.
    const waiting = now ? undefined : await pendingCallTo(userId, number.e164);
    if (waiting) return alreadySetReply(name, waiting);
    // Just called (CALL_STATUS_RECALL): "did you call my dad?" gets that status, not a new call.
    const { statusBeforeReadBack } = await import('./call-status-tool.js');
    const told = await statusBeforeReadBack(userId, number.e164, name, session);
    if (told) return told;
    // CONTACT_SAVE_ON_YES: what a yes also saves for them (owner-contact.ts); nothing is saved yet
    const save = given ? await numberToSave(userId, who, number.e164) : undefined;
    return {
      args: { ...args, phoneNumber: number.e164, ...(save && { [GIVEN]: save.given }) },
      readBack: `a call to ${name} at ${number.spoken}${now ? ', right now' : ''}${purpose ? `, to ${purpose}` : ''}${save?.note ?? ''}`,
    };
  },
  onYes: rememberOnYes,
};

/** Flag on: who the given number is for, and what the read-back must say a yes changes. */
async function numberToSave(
  userId: string,
  who: string,
  e164: string
): Promise<{ note: string; given: GivenNumber } | undefined> {
  if (!flagOn('CONTACT_SAVE_ON_YES') || !savableNumber(e164)) return undefined;
  try {
    return askAboutNumber(await resolveOwnerContact(userId, who, e164), who, e164);
  } catch {
    return undefined; // a store that can't be read saves nothing; the call still reads back
  }
}
