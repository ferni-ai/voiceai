/**
 * The production edges for the proactive check-in run: the app's message
 * panel, the phone on the user's Firebase account, Twilio texts, and calls
 * over the LiveKit SIP trunk.
 *
 * @module services/outreach/proactive-channels/default-deps
 */

import { sendSMS } from '../../communication-service.js';
import { getFirebaseUser } from '../../identity/firebase-auth.js';
import { saveInAppMessage } from '../unified-delivery.js';
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
    // Firebase only puts a number on an account through phone verification
    // (verify-phone-routes.ts) or an admin, so this is a number they proved they hold.
    async verifiedPhone(userId) {
      return (await getFirebaseUser(userId))?.phoneNumber ?? undefined;
    },
    async sendSms(phone, text) {
      await sendSMS(phone, text);
      return true;
    },
    canCall: () => canPlaceCalls(),
    placeCall: async (userId, phone, trigger) => placeSelfCall(userId, phone, trigger),
  };
}
