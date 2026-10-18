/**
 * The production edges for the proactive check-in run: the app's message
 * panel, the member's verified phone (user-reach.ts), Twilio texts, and calls
 * over the LiveKit SIP trunk.
 *
 * @module services/outreach/proactive-channels/default-deps
 */

import { sendSMS } from '../../communication-service.js';
import { consentBlocks } from '../../messaging/consent.js';
import { ownerRefusal } from '../../messaging/consent-grants.js';
import { saveInAppMessage } from '../unified-delivery.js';
import { resolveVerifiedPhone } from '../user-reach.js';
import type { ProactiveDeps } from './proactive-tick.js';
import { canPlaceCalls, placeSelfCall } from './self-call.js';

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
    // The verified phone is the member's own, so only an opt-out stops it (MESSAGING_PIPELINE).
    async sendSms(phone, text) {
      if (await consentBlocks(phone, 'sms', true)) return false;
      await sendSMS(phone, text);
      return true;
    },
    canCall: () => canPlaceCalls(),
    placeCall: async (userId, phone, trigger) =>
      (await ownerRefusal(userId, phone, 'call'))
        ? 'failed'
        : placeSelfCall(userId, phone, trigger),
  };
}
