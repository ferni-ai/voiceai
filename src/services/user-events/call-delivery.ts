/**
 * Voice-to-screen events over the live call.
 *
 * The voice agent runs on LiveKit Cloud, a different process from the UI
 * server, so the in-memory buffer and the Redis channel that broadcastUserEvent
 * fills never reached the app: "open Memory Lane" and "switch to dark mode"
 * were spoken but nothing changed on screen. The app already handles
 * `show_view` and `theme_change` arriving on the call's data channel
 * (apps/web/src/services/voice-events.service.ts handleVoiceEventDataMessage),
 * so the event goes there, through the call's frontend signal.
 *
 * Behind UI_EVENTS_OVER_CALL=on (off by default).
 *
 * @module services/user-events/call-delivery
 */

import { sendFrontendSignal } from '../communication/frontend-signal.js';

/** Whether voice-to-screen events are sent on the call's data channel. */
export function uiEventsOverCall(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.UI_EVENTS_OVER_CALL === 'on';
}

/**
 * Send one voice-to-screen event to the app on this call.
 * Returns true when it was sent. Without a session ID it is sent only while a
 * single call is live, so it never reaches another caller's screen.
 */
export async function deliverOverCall(
  eventType: string,
  data: unknown,
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!uiEventsOverCall(env)) return false;
  return sendFrontendSignal(eventType, { data }, sessionId);
}
