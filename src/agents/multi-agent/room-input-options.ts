/**
 * What cleans the caller's audio before VAD, STT and the interruption model.
 *
 * Phone callers get AGC + high-pass (pre-stt-frame-processor.ts), unchanged.
 * Web callers got nothing on this path: background voice cancellation was set
 * up only in the legacy entry (voice-agent/phases/noise-cancellation.ts), and
 * prod logged it 0 times in 14 sessions (2026-10-13 SDK audit, G3).
 *
 * WEB_NOISE_CANCEL=on gives a web caller LiveKit's BVC
 * (@livekit/noise-cancellation-node). It runs natively inside the room's
 * AudioStream, so every consumer of the caller's audio hears the cleaned
 * signal, the adaptive interruption model included. That is the risk to
 * measure: BVC must not soften a real barge-in ("wait") into something the
 * model rules a backchannel. (The Krisp-plugin bug fixed upstream in #2130,
 * which fed the model zero frames, came from a JS frame processor handing
 * back frames from a second rtc-node copy; BVC returns plain options and
 * stays in the native path.)
 *
 * @module agents/multi-agent/room-input-options
 */
import type { voice } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  type CallParticipantLike,
  createPreSTTFrameProcessor,
  isPhoneParticipant,
  wantsPhonePreStt,
} from '../integrations/pre-stt-frame-processor.js';

const log = getLogger();

type Env = Record<string, string | undefined>;
interface InputOptions {
  inputOptions?: Partial<voice.RoomInputOptions>;
}

async function backgroundVoiceCancellation(
  sessionId: string
): Promise<voice.RoomInputOptions['noiseCancellation'] | null> {
  try {
    const nc = await import('@livekit/noise-cancellation-node');
    return nc.BackgroundVoiceCancellation();
  } catch (err) {
    log.warn({ error: String(err), sessionId }, 'WEB_NOISE_CANCEL: BVC not available');
    return null;
  }
}

/** session.start() fields for the caller's audio input. */
export async function roomInputOptions(
  participant: CallParticipantLike | undefined,
  sessionId: string,
  env: Env = process.env
): Promise<InputOptions> {
  if (isPhoneParticipant(participant)) {
    const phone = wantsPhonePreStt(participant, env)
      ? await createPreSTTFrameProcessor(sessionId)
      : null;
    return phone ? { inputOptions: { noiseCancellation: phone } } : {};
  }
  // An unknown caller might be on the phone: leave their audio alone.
  if (!participant || !flagOn('WEB_NOISE_CANCEL', env)) return {};
  const bvc = await backgroundVoiceCancellation(sessionId);
  if (!bvc) return {};
  log.info({ sessionId }, 'WEB_NOISE_CANCEL: BVC on web caller audio');
  return { inputOptions: { noiseCancellation: bvc } };
}
