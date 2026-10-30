/** What each outreach tool fixes and reads back before the caller's yes (outreach-confirm.ts). */

import { ownerKnown, PLANNED, type ConfirmSpec, type Planned } from './outreach-confirm.js';
import type { OutreachResult } from './unified-outreach.js';

const CALLS = ['call', 'voicemail'];

/** reachOut: fix the words, channel, contact and address now, and send exactly those. */
export const reachOutConfirm: ConfirmSpec = {
  prepare: async (args, _userId, plan, session) => {
    const out = await plan(args);
    if (typeof out === 'string') return `${out} Nothing was sent.`;
    const r = out as OutreachResult;
    if (r.error) return r.error;
    if (!r.success || !r.to || !r.contactId)
      return `Nothing was sent: no ${r.channel} for ${r.contactName}.`;
    // A live two-way call has no fixed words to read back; calls get their own confirmation.
    if (r.channel === 'conversation')
      return 'Nothing was sent: live calls need their own confirmation.';
    const planned: Planned = { contactId: r.contactId, to: r.to, channel: r.channel, from: r.from };
    const how = CALLS.includes(r.channel) ? 'a call' : `a ${r.channel}`;
    const words = CALLS.includes(r.channel) ? 'where Ferni will open with' : 'saying';
    return {
      args: { ...args, customMessage: r.message, preferredChannel: r.channel, [PLANNED]: planned },
      readBack: `${how} to ${r.contactName} at ${r.to}${fromWhere(r, session)}, ${words} "${r.message}"`,
    };
  },
};

/**
 * Which mailbox an email goes from, when GMAIL_SEND_AS_USER chose one (outreach-email.ts).
 * The caller's address is said only when the speaker is known to be its owner.
 */
function fromWhere(r: OutreachResult, session?: object): string {
  if (r.from === 'ferni') return " from Ferni's address";
  if (r.from !== 'gmail') return '';
  const address = r.fromAddress && ownerKnown(session) ? `, ${r.fromAddress}` : '';
  return ` from your Gmail${address}`;
}

/** multiOutreach can't yet read back every person's address, so under the flag it sends nothing. */
export const multiOutreachConfirm: ConfirmSpec = {
  prepare: async () =>
    'Nothing was sent: reach out to each person on their own (one at a time) for now.',
};

/** sendBatchMessages can't yet bind a yes to the batch read back, so under the flag it sends nothing. */
export const sendBatchConfirm: ConfirmSpec = {
  prepare: async () => 'Nothing was sent: batch messages need their own confirmation, coming soon.',
};

const firstText = (args: Record<string, unknown>, keys: string[]): string =>
  keys.map((k) => args[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? '';

/**
 * Read back a tool's own arguments: who (name and number or address) and what.
 * The confirmed send runs with exactly these arguments.
 */
export function argsConfirm(what: string): ConfirmSpec {
  return {
    prepare: async (args) => {
      const name = firstText(args, ['contactName', 'friendName', 'recipientName']);
      const address = firstText(args, [
        'contactPhone',
        'friendPhone',
        'recipientEmail',
        'to',
        'phoneNumber',
      ]);
      if (!name && !address) return `Nothing was sent: I couldn't tell who ${what} would go to.`;
      const says = firstText(args, ['message', 'objective', 'purpose', 'body']);
      const who = [name, address].filter(Boolean).join(' at ');
      return { args, readBack: `${what} to ${who}${says ? `, about "${says}"` : ''}` };
    },
  };
}

/**
 * postToTwitter / postToLinkedIn: only action 'post' publishes. Read back the
 * exact words; a saved draft is dropped so what posts is what the caller heard.
 */
export function postConfirm(where: string): ConfirmSpec {
  return {
    applies: (args) => args.action === 'post',
    prepare: async (args) => {
      const parts = [args.content].flat().filter((p): p is string => typeof p === 'string');
      const text = parts
        .map((p) => p.trim())
        .filter(Boolean)
        .join(' / ');
      if (!text) return 'Nothing was posted: tell the caller the exact words first.';
      const { useDraft: _draft, ...exact } = args;
      return { args: exact, readBack: `a public post to ${where} saying "${text}"` };
    },
  };
}

/**
 * setReminder / scheduleReminder: a reminder to an address the model named
 * (contact, deliveryAddress) can reach someone else, so it is read back first.
 * One that goes to the owner's own profile runs at once.
 * productivity/reminders.ts narrows `applies` for setReminder (owner's number).
 */
export const reminderConfirm: ConfirmSpec = {
  applies: (args) => firstText(args, ['contact', 'deliveryAddress']) !== '',
  prepare: async (args) => {
    const to = firstText(args, ['contact', 'deliveryAddress']);
    const says = firstText(args, ['message', 'reminderText', 'title']);
    return { args, readBack: `a reminder sent to ${to}${says ? `, saying "${says}"` : ''}` };
  },
};
