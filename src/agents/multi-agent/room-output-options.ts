/**
 * OUTPUT_QUEUE_MS: how much of Ferni's audio the room output may buffer.
 *
 * The SDK's room audio output queues up to 1000 ms by default in
 * @livekit/agents 1.5.1 (AudioSource's default; 1.9.x lowers it to 200 ms).
 * TTS runs faster than real time, so that queue fills, and audio sits in it
 * before it reaches WebRTC. A LiveKit forum case measured echo round trip
 * 803 ms at the 1000 ms default and 392 ms at 10 ms; the cost is worst on the
 * phone path (voice-research "Realtime voice agent architecture 2026").
 *
 * Unset leaves the SDK's default. A value is used only if it is a whole number
 * of milliseconds from 10 to 1000: 0 needs exactly 10 ms frames, and more than
 * the default buys nothing. Anything else is ignored with a warning.
 *
 * @module agents/multi-agent/room-output-options
 */
import type { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export const OUTPUT_QUEUE_MS_RANGE = { min: 10, max: 1000 } as const;

/** The room output queue in ms, or undefined for the SDK default. */
export function outputQueueMs(
  env: Record<string, string | undefined> = process.env
): number | undefined {
  const raw = env.OUTPUT_QUEUE_MS?.trim();
  if (!raw) return undefined;
  const ms = Number(raw);
  const { min, max } = OUTPUT_QUEUE_MS_RANGE;
  if (!Number.isInteger(ms) || ms < min || ms > max) {
    log.warn({ value: raw, min, max }, 'OUTPUT_QUEUE_MS ignored: not a whole ms in range');
    return undefined;
  }
  return ms;
}

/** session.start() fields for the room output: none unless OUTPUT_QUEUE_MS is set. */
export function roomOutputOptions(env: Record<string, string | undefined> = process.env): {
  outputOptions?: Partial<voice.RoomOutputOptions>;
} {
  const queueSizeMs = outputQueueMs(env);
  return queueSizeMs === undefined ? {} : { outputOptions: { queueSizeMs } };
}
