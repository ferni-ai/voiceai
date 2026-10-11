/** What each outreach tool fixes and reads back before the caller's yes (outreach-confirm.ts). */

import { pendingBatches } from './batch-outreach.js';
import type { ConfirmSpec } from './outreach-confirm.js';
import type { OutreachResult } from './unified-outreach.js';

const said = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');
const SENDS = ['call', 'text', 'email', 'conversation'];
const BATCH_MAX_AGE_MS = 10 * 60 * 1000; // older ones may be cleaned up inside the 5-minute window

/** reachOut: write the message and pick the channel now, and send exactly those. */
export const reachOutConfirm: ConfirmSpec = {
  prepare: async (args, _userId, plan) => {
    const out = await plan(args);
    if (typeof out === 'string') return `${out} Nothing was sent.`;
    const r = out as OutreachResult;
    if (!r.success || !r.to) return `Nothing was sent: no ${r.channel} for ${r.contactName}.`;
    return {
      args: { ...args, customMessage: r.message, preferredChannel: r.channel },
      readBack: `a ${r.channel} to ${r.contactName} at ${r.to}, saying "${r.message}"`,
    };
  },
};

/** multiOutreach: every target needs its own words and channel, so the read-back is exact. */
export const multiOutreachConfirm: ConfirmSpec = {
  prepare: async (args) => {
    const targets = (Array.isArray(args.targets) ? args.targets : []) as Array<
      Record<string, unknown>
    >;
    if (
      targets.length === 0 ||
      targets.some((t) => !said(t.contact) || !said(t.message) || !SENDS.includes(said(t.channel)))
    ) {
      return 'Nothing was sent: give the exact message and the channel (call, text or email) for each person, then try again.';
    }
    const readBack = targets
      .map((t) => {
        const when = said(t.scheduledFor);
        return `a ${said(t.channel)} to ${said(t.contact)}${when ? ` (${when})` : ''}, saying "${said(t.message)}"`;
      })
      .join('; ');
    return { args, readBack };
  },
};

/** sendBatchMessages: read back the batch it would send; a yes covers only that batch. */
export const sendBatchConfirm: ConfirmSpec = {
  prepare: async (args, userId) => {
    // The batch sendBatchMessages will take: the user's newest (same rule as its send loop)
    const mine = [...pendingBatches.values()].filter((b) => b.userId === userId);
    const batch = mine.reduce<(typeof mine)[number] | undefined>(
      (latest, b) => (!latest || b.createdAt > latest.createdAt ? b : latest),
      undefined
    );
    if (!batch || Date.now() - batch.createdAt.getTime() > BATCH_MAX_AGE_MS) {
      return 'Nothing was sent: there is no recent batch to send. Preview the messages again first.';
    }
    const readBack = batch.previews
      .map((p) => `a ${p.channel} to ${p.contactName} at ${p.channelValue}, saying "${p.message}"`)
      .join('; ');
    return { args: { ...args, confirm: true }, readBack };
  },
  // The send takes the user's latest batch, so the yes holds only if their batches are unchanged.
  binding: (userId) => [...pendingBatches.values()].filter((b) => b.userId === userId),
};
