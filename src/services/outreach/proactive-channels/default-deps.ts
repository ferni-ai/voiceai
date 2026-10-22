/**
 * The production edges for the proactive check-in run: the app's message
 * panel, the member's verified phone (user-reach.ts), texts through the guarded
 * sender (guarded-text.ts: verified phone, STOP, texts off, gap, lock, a
 * feature_checkins record), and calls over the LiveKit SIP trunk.
 *
 * @module services/outreach/proactive-channels/default-deps
 */

import { sendGuardedText } from '../guarded-text.js';
import { saveInAppMessage } from '../unified-delivery.js';
import { resolveVerifiedPhone } from '../user-reach.js';
import type { ProactiveDeps } from './proactive-tick.js';
import { canPlaceCalls, placeSelfCall } from './self-call.js';

/** Two proactive texts to one person or phone (overlapping runs, a shared number) at least this far apart. */
export const PROACTIVE_TEXT_GAP_MS = 5 * 60 * 1000;

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
      return result.success;
    },
    // The same answer every Ferni text uses: sponsor-confirmed, then a phone
    // id or one proved in Settings, then Firebase Auth's. Never contactInfo.phone.
    async verifiedPhone(userId, user) {
      return resolveVerifiedPhone(userId, user);
    },
    // The guard re-reads STOP at send time: the run's opt-out read came before the words were written.
    async sendSms(userId, trigger) {
      const outcome = await sendGuardedText({
        userId,
        body: trigger.text,
        kind: 'proactive',
        refId: trigger.sourceId,
        minGapMs: PROACTIVE_TEXT_GAP_MS,
      });
      return outcome.sent;
    },
    canCall: () => canPlaceCalls(),
    placeCall: async (userId, phone, trigger) => placeSelfCall(userId, phone, trigger),
  };
}
