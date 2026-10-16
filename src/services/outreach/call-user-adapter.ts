/**
 * The outreach side of callUser's port (tools/domains/proactive/outreach/call-user-port.ts):
 * the account's verified phone (userReach) and the call through scheduleProactiveCall, so
 * calling hours and quiet hours decide when it rings.
 *
 * @module services/outreach/call-user-adapter
 */
import {
  setCallUserPort,
  type CallUserPort,
} from '../../tools/domains/proactive/outreach/call-user-port.js';
import { scheduleProactiveCall } from './conversational-calls.js';
import { escapeXml } from './twilio-ssml.js';
import { userReach } from './user-reach.js';

export const callUserAdapter: CallUserPort = {
  // They asked for this call, so a verified phone is enough; no standing opt-in.
  verifiedPhone: async (userId) =>
    (await userReach(userId, 'voice_call', { standingOptIn: false })).phone,
  call: ({ userId, phoneNumber, message, personaId }) =>
    scheduleProactiveCall({
      userId,
      phoneNumber,
      message,
      ssml: `<speak>${escapeXml(message)}</speak>`,
      personaId,
      reason: 'user_requested_call',
    }),
};

/** Install the adapter; safe to call on every call. */
export function installCallUserPort(): void {
  setCallUserPort(callUserAdapter);
}
