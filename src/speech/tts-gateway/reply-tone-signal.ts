/**
 * Tell the client the tone Ferni's voice takes for a reply, so the face can
 * match it (avatar audit item 8: the face mirrored the caller's emotion while
 * the voice chose its own, and the two could disagree).
 *
 * Sent once per reply, at the first sentence pushed to TTS, as a
 * `reply_tone { emotion, speed }` data message: `emotion` is the reply's
 * Cartesia emotion (one of STABLE_EMOTIONS, or null when the voice takes its
 * tone from the words), `speed` the absolute speaking rate (0.6-1.5).
 *
 * Off unless AVATAR_REPLY_TONE=on on the agent.
 *
 * @module speech/tts-gateway/reply-tone-signal
 */

import { sendFrontendSignal } from '../../services/frontend-signal.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReplyToneSignal' });

export const REPLY_TONE_MESSAGE = 'reply_tone';

export interface ReplyTone {
  emotion?: string;
  speed: number;
}

export function replyToneEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AVATAR_REPLY_TONE === 'on';
}

/**
 * Send the reply's tone to the session's client when the flag is on. Never
 * throws and never delays the reply: the send runs in the background.
 */
export function sendReplyTone(
  tone: ReplyTone,
  sessionId: string | undefined,
  env: Record<string, string | undefined> = process.env
): void {
  // Without a session the signal could reach the wrong call's client.
  if (!sessionId || !replyToneEnabled(env)) return;
  const payload = { emotion: tone.emotion ?? null, speed: tone.speed };
  sendFrontendSignal(REPLY_TONE_MESSAGE, payload, sessionId).then(
    (sent) => {
      if (!sent) log.debug({ sessionId }, 'reply_tone not sent: no frontend signal for session');
    },
    (err: unknown) => log.warn({ err: String(err), sessionId }, 'reply_tone send failed')
  );
}
