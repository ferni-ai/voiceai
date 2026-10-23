/**
 * What callUser tells the model once a call is placed.
 *
 * The call rings in another room this session can't hear, so no reply lets
 * the model say it connected, and only the live path (CALL_USER_LIVE_AGENT,
 * services/outreach/live-agent-call.ts) is the persona's own voice. Prod
 * 2026-10-22: after "Calling you now." Ferni said the call "connected" and
 * called Twilio's stock voice his own.
 *
 * @module tools/domains/proactive/outreach/call-placed-reply
 */
import type { CallUserResult } from './call-user-port.js';

export const CALLING_LIVE =
  "Ringing your phone now, and I'll be on that call myself. (That call is separate from this one: you can't hear it or tell whether they picked up, so don't say it connected.)";

export const CALLING_VOICE_MESSAGE =
  "Ringing your phone now with a recorded message. (An automated phone voice reads your message: it is not you live and not your voice. You also can't tell whether they picked up, so don't say it connected or call it your voice.)";

export const CALLING_LATER =
  "It's outside your calling hours right now, so I'll call you once they open.";

/** The reply for a call that was placed or held; failures are worded by the caller. */
export function callPlacedReply(result: Pick<CallUserResult, 'status' | 'live'>): string {
  if (result.status === 'scheduled') return CALLING_LATER;
  return result.live ? CALLING_LIVE : CALLING_VOICE_MESSAGE;
}
