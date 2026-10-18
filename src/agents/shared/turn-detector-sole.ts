/**
 * TURN_DETECTOR_SOLE=on: when LiveKit's end-of-turn model decides the end of
 * the caller's turn (TURN_DETECTOR, turn-patience.ts), our own end-of-turn
 * holds stand down so their waits don't stack on the model's. Off by default,
 * so the dev A/B can run the model with the holds and the model alone.
 *
 * Per layer, with the model on:
 * - UNFINISHED_TURN_HOLD (unfinished-turn.ts and its hunk in the LiveKit
 *   patch, which only acts when the app installs unfinishedTurnHoldMs) and
 *   ENDPOINT_FAST_FINISHED: stand down. They guess from the words whether the
 *   caller is mid-thought; the model already waits its maximum then, so the
 *   hold adds up to 2 s on top, and the fast floor overrides the model's
 *   minimum.
 * - PAUSE_HOLD (pause-hold.ts): stands down. It reads ink's hesitation from
 *   the gap between the caller's last words and the commit; with the model
 *   that gap is the model's own wait, so it would hold replies the model has
 *   already judged finished.
 * - The turn keeper stays: it answers a turn LiveKit lost (never committed or
 *   cut), which no end-of-turn model sees, and it adds no wait to a normal turn.
 * - END_OF_SPEECH_PASSTHROUGH (LiveKit patch) stays: it re-sends ink's end of
 *   speech, which LiveKit ignores with the model on, so it is inert there.
 *
 * Only a detector the session really has counts: LiveKit drops it without
 * VAD, and then the holds keep running.
 *
 * @module agents/shared/turn-detector-sole
 */
import { inference } from '@livekit/agents';

type Env = Record<string, string | undefined>;

/** The layers that stand down under TURN_DETECTOR_SOLE, for the session log. */
export const SOLE_STANDS_DOWN = ['UNFINISHED_TURN_HOLD', 'ENDPOINT_FAST_FINISHED', 'PAUSE_HOLD'];

/** LiveKit's end-of-turn model on this session, or null when its turns end another way. */
export function sessionTurnDetector(session: unknown): inference.TurnDetector | null {
  const s = session as { turnDetection?: unknown; vad?: unknown } | null | undefined;
  return s?.turnDetection instanceof inference.TurnDetector && s.vad !== undefined
    ? s.turnDetection
    : null;
}

/** Whether our end-of-turn holds stand down on this session (TURN_DETECTOR_SOLE=on and a model). */
export function holdsStandDown(session: unknown, env: Env = process.env): boolean {
  return env.TURN_DETECTOR_SOLE === 'on' && sessionTurnDetector(session) !== null;
}
