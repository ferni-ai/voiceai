/**
 * Client Timing
 *
 * Sends the agent one message per call with when this call started, so its
 * "Time to first word" line (src/agents/shared/time-to-first-word.ts, TTFW_METRIC)
 * covers what only the app sees: the start-call tap, the room join, Ferni's first
 * audio track and the moment his audio played. The last two are the moments the
 * "Agent audio start timing" line is made from (audio-start-timing.ts), handed
 * over as that line goes out: when his audio first plays, or at hang-up or
 * teardown if it never did (then firstAudioHeardAt is left out).
 *
 * The message is the agent's ClientTiming (time-to-first-word-record.ts): UTF-8
 * JSON on `ferni.client_timing`, reliable, each moment epoch ms on this device's
 * clock (the agent only subtracts them from each other), plus platform 'web'.
 * Moments only: no identity, room name, track or element id, no text.
 *
 * Off unless CLIENT_TIMING_SEND (config/client-timing-send-flag.ts): with it off,
 * nothing is sent.
 */

import { isClientTimingSendOn } from '../config/client-timing-send-flag.js';
import { createLogger } from '../utils/logger.js';
import type { AudioStartMoments } from './audio-start-timing.js';

const log = createLogger('ClientTiming');

/** The agent's topic for it (CLIENT_TIMING_TOPIC in time-to-first-word-record.ts). */
export const CLIENT_TIMING_TOPIC = 'ferni.client_timing';

/** The call's own moments, on the performance.now() clock the audio moments use. */
export interface CallStartMoments {
  /** The start-call tap (app.ts connect()). */
  tapAt: number;
  /** The app joined the LiveKit room. */
  roomConnectedAt: number;
}

/** The slice of a LiveKit Room this needs. */
export interface ClientTimingRoom {
  localParticipant: {
    publishData(data: Uint8Array, options: { reliable: boolean; topic: string }): Promise<void>;
  };
}

const toEpochMs = (at: number | null): number | undefined =>
  at === null ? undefined : Math.round(performance.timeOrigin + at);

/** The message: the four moments as epoch ms (a step never reached left out), and the platform. */
export function encodeClientTiming(call: CallStartMoments, audio: AudioStartMoments): Uint8Array {
  const timing = {
    tapAt: toEpochMs(call.tapAt),
    roomConnectedAt: toEpochMs(call.roomConnectedAt),
    agentAudioTrackAt: toEpochMs(audio.trackAt),
    firstAudioHeardAt: toEpochMs(audio.playingAt),
    platform: 'web',
  };
  return new TextEncoder().encode(JSON.stringify(timing));
}

/**
 * The listener that sends this call's message, for AudioStartDeps.onAudioStartTimed;
 * undefined with CLIENT_TIMING_SEND off. A send that fails (the room already closed)
 * is dropped: the agent logs its line without the app's moments.
 */
export function clientTimingSender(
  room: ClientTimingRoom,
  call: CallStartMoments
): ((audio: AudioStartMoments) => void) | undefined {
  if (!isClientTimingSendOn()) return undefined;
  return (audio) => {
    const payload = encodeClientTiming(call, audio);
    const options = { reliable: true, topic: CLIENT_TIMING_TOPIC };
    Promise.resolve(room.localParticipant.publishData(payload, options)).catch((error: unknown) =>
      log.debug('Call-start timing not sent', { error: String(error) })
    );
  };
}
