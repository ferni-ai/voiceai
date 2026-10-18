/**
 * The production edges for the proactive check-in run: the app's message
 * panel, the member's verified phone (user-reach.ts), texts through the guarded
 * sender (guarded-text.ts: verified phone, STOP, gap, lock), and calls over the
 * LiveKit SIP trunk. Every note, text and call is added to the "How I reach
 * you" history (sent-history.ts).
 *
 * @module services/outreach/proactive-channels/default-deps
 */

import { sendGuardedText } from '../guarded-text.js';
import { recordSent, type SentAttempt } from '../sent-history.js';
import { saveInAppMessage } from '../unified-delivery.js';
import { resolveVerifiedPhone } from '../user-reach.js';
import type { ProactiveDeps } from './proactive-tick.js';
import { canPlaceCalls, placeSelfCall, type CallOutcome } from './self-call.js';
import type { ProactiveTrigger } from './types.js';

/** Overlapping runs, or two accounts on one number, can't text twice within this. */
export const PROACTIVE_TEXT_GAP_MS = 5 * 60 * 1000;

const HISTORY_TYPE: Record<ProactiveTrigger['kind'], SentAttempt['type']> = {
  promise: 'follow_up',
  follow_up: 'follow_up',
  planned_checkin: 'check_in',
  hard_news: 'check_in',
  world_due: 'reminder',
  reminder: 'reminder',
};

const CALL_STATUS: Record<CallOutcome, SentAttempt['status']> = {
  answered: 'delivered',
  no_answer: 'sent',
  busy: 'sent',
  declined: 'sent',
  failed: 'failed',
};

const SOURCE = 'proactive-tick';

export function defaultProactiveDeps(): ProactiveDeps {
  return {
    async sendInApp(userId, trigger) {
      const result = await saveInAppMessage(userId, {
        type: `proactive_${trigger.kind}`,
        personaId: 'ferni',
        text: trigger.text,
        reason: trigger.reason,
        triggerId: trigger.sourceId,
      });
      const status = result.success ? 'sent' : 'failed';
      await recordSent(userId, {
        type: HISTORY_TYPE[trigger.kind],
        channel: 'push',
        status,
        source: SOURCE,
      });
      return result.success;
    },
    // The same answer every Ferni text uses: sponsor-confirmed, then a phone
    // id or one proved in Settings, then Firebase Auth's. Never contactInfo.phone.
    async verifiedPhone(userId, user) {
      return resolveVerifiedPhone(userId, user);
    },
    // The guarded sender resolves the number itself and adds the text to the history.
    async sendSms(userId, trigger) {
      return sendGuardedText({
        userId,
        body: trigger.text,
        kind: 'proactive',
        refId: trigger.sourceId,
        minGapMs: PROACTIVE_TEXT_GAP_MS,
        historyType: HISTORY_TYPE[trigger.kind],
      });
    },
    canCall: () => canPlaceCalls(),
    async placeCall(userId, phone, trigger) {
      const outcome = await placeSelfCall(userId, phone, trigger);
      const type = HISTORY_TYPE[trigger.kind];
      const status = CALL_STATUS[outcome];
      await recordSent(userId, { type, channel: 'voice', status, source: SOURCE });
      return outcome;
    },
  };
}
