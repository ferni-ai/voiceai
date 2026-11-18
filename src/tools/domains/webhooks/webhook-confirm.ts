/**
 * What triggerWebhook reads back before the owner's yes (outreach-confirm.ts):
 * the name of the automation that will run. A webhook can open a garage or
 * unlock a door, so a phrase from an email read aloud, or a guest on the line,
 * must not fire one (issue #3992). The confirmed run triggers the webhook that
 * was read back and no other, even if the saved webhooks change in between.
 *
 * The match itself is the tool's own planning pass (PLAN_ONLY), so this module
 * never touches the webhook store.
 *
 * @module tools/domains/webhooks/webhook-confirm
 */

import type { ConfirmSpec } from '../communication/outreach/outreach-confirm.js';

/** Arguments marker on a confirmed run: trigger exactly this webhook id, as read back. */
export const WEBHOOK_PLANNED = Symbol('webhook-planned');

/** What triggerWebhook's planning pass returns for the webhook a phrase names. */
export interface PlannedWebhook {
  id: string;
  name: string;
}

export const webhookConfirm: ConfirmSpec = {
  prepare: async (args, _userId, plan) => {
    const out = await plan(args);
    // No match, disabled, no account or an error: the tool's own words, nothing stored.
    if (typeof out === 'string') return out;
    const { id, name } = out as PlannedWebhook;
    return {
      args: { ...args, [WEBHOOK_PLANNED]: id },
      readBack: `running your "${name}" automation`,
    };
  },
};
