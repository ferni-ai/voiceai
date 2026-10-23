/**
 * PAUSE_HOLD on a call: a reply to a turn ink ended hesitantly waits out the pause
 * (speech/output-control/pause-hold.ts). It stands down when LiveKit's end-of-turn model
 * decides alone (turn-detector-sole.ts). A phone (SIP) caller's hold follows
 * PAUSE_HOLD_PHONE_CAP.
 *
 * @module agents/multi-agent/pause-hold-wiring
 */

export interface PauseHoldInput {
  session: unknown;
  sessionId: string;
  cleanupFunctions: Array<() => void>;
  /** A phone (SIP) caller; undefined when not known. */
  phone?: boolean;
}

/** Install the session's pause hold, unless the end-of-turn model decides alone. */
export async function installPauseHold(input: PauseHoldInput): Promise<void> {
  const { attachPauseHold } = await import('../../speech/output-control/pause-hold.js');
  const { holdsStandDown } = await import('../shared/turn-detector-sole.js');
  const detach = holdsStandDown(input.session)
    ? null
    : attachPauseHold(input.session as never, input.sessionId, process.env, input.phone);
  if (detach) input.cleanupFunctions.push(detach);
}
