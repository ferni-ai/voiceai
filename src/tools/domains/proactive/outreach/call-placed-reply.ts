/**
 * What callUser tells the model once a call is placed.
 *
 * The call rings in another room this session can't hear, so no reply lets
 * the model say it connected, and only the live path (CALL_USER_LIVE_AGENT,
 * services/outreach/live-agent-call.ts) is the persona's own voice. Prod
 * 2026-10-22: after "Calling you now." Ferni said the call "connected" and
 * called Twilio's stock voice his own. Behind CALL_PLACED_HONEST_REPLY (off:
 * the old "Calling you now.").
 *
 * @module tools/domains/proactive/outreach/call-placed-reply
 */
import { flagOn } from '../../../../config/env-flag.js';
import type { CallUserResult } from './call-user-port.js';

export const CALLING_LIVE =
  "Their phone is ringing now, and you'll be on that call yourself, live, as a separate call. You can't hear it or tell whether they picked up, so don't say it connected; just tell them you're calling now.";

export const CALLING_VOICE_MESSAGE =
  "Their phone is ringing now with a recorded message: an automated phone voice reads your words, so it is not you live and not your voice. You can't tell whether they picked up, so don't say it connected or call it your voice; tell them a voice message is on its way to their phone.";

export const CALLING_LATER =
  "It's outside your calling hours right now, so I'll call you once they open.";

/** The reply for a call that was placed or held; failures are worded by the caller. */
export function callPlacedReply(result: Pick<CallUserResult, 'status' | 'live'>): string {
  if (result.status === 'scheduled') return CALLING_LATER;
  if (!flagOn('CALL_PLACED_HONEST_REPLY')) return 'Calling you now.';
  return result.live ? CALLING_LIVE : CALLING_VOICE_MESSAGE;
}
