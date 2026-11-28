/**
 * One BACKCHANNEL_PLAYED line per clip Ferni plays in the caller's pause (an "mm-hm"
 * or a laugh, live-backchanneling-integration.ts), so its placement can be measured:
 *
 *   { sessionId, clip, callerRunMs, quietMs, cancelledBy }
 *
 * - `clip`: 'backchannel' or 'laugh'. Never the clip's words.
 * - `callerRunMs`: how long the caller had been talking this turn when the pause began
 *   (null when their start wasn't heard).
 * - `quietMs`: how long the pause had lasted when the clip played.
 * - `cancelledBy`: the clip was taken back because the caller carried on: 'pause_ended'
 *   (our pause clock heard them) or 'vad' (LiveKit's VAD did, direct-clip-track.ts).
 *   Null when it played out.
 *
 * A clip can only be taken back in its first CANCEL_WINDOW_MS (200 ms,
 * direct-clip-track.ts), so the line is written once a little more than that has
 * passed, or at once when it is taken back.
 *
 * Behind BACKCHANNEL_PLAYED (off): off, nothing is kept and no line is written.
 *
 * @module agents/integrations/backchannel-played
 */
import { flagOn } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'BackchannelPlayed' });

/** Past the 200 ms take-back window (direct-clip-track.ts CANCEL_WINDOW_MS). */
const SETTLE_MS = 250;

export type ClipKind = 'backchannel' | 'laugh';
export type CancelledBy = 'pause_ended' | 'vad';

interface BackchannelPlayed {
  sessionId: string;
  clip: ClipKind;
  callerRunMs: number | null;
  quietMs: number;
  cancelledBy: CancelledBy | null;
}

interface Pending {
  line: Omit<BackchannelPlayed, 'cancelledBy'>;
  timer: ReturnType<typeof setTimeout>;
}

// Keyed by the AgentSession: both places that take a clip back hold it.
const pending = new WeakMap<object, Pending>();

const write = (line: BackchannelPlayed): void =>
  log.info({ event: 'BACKCHANNEL_PLAYED', ...line }, 'BACKCHANNEL_PLAYED');

function settle(session: object, cancelledBy: CancelledBy | null): void {
  const open = pending.get(session);
  if (!open) return;
  pending.delete(session);
  clearTimeout(open.timer);
  write({ ...open.line, cancelledBy });
}

const ms = (n: number): number => Math.max(0, Math.round(n));

/** A clip played in the caller's pause. `pauseStartedAt`, `speechStartedAt`, `now`: epoch ms. */
export function noteBackchannelPlayed(
  session: object,
  sessionId: string,
  clip: ClipKind,
  at: { pauseStartedAt: number },
  speechStartedAt: number | null,
  now = Date.now()
): void {
  if (!flagOn('BACKCHANNEL_PLAYED')) return;
  settle(session, null); // an earlier clip still open has played out by now
  const callerRun = speechStartedAt === null ? null : ms(at.pauseStartedAt - speechStartedAt);
  const line = { sessionId, clip, callerRunMs: callerRun, quietMs: ms(now - at.pauseStartedAt) };
  const timer = setTimeout(() => settle(session, null), SETTLE_MS);
  timer.unref?.();
  pending.set(session, { line, timer });
}

/** The clip just played was taken back because the caller carried on. */
export function noteBackchannelCancelled(session: object, by: CancelledBy): void {
  settle(session, by);
}
