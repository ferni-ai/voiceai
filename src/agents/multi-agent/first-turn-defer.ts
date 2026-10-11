/**
 * FIRST_TURN_DEFER_BACKGROUND=on: build turn 1's per-turn context only once Ferni speaks.
 *
 * Per-turn intelligence (turn-intelligence.ts) runs beside each reply, and on
 * turn 1 it is cold: the context builders' modules load, the Vertex client,
 * memory stores and BetterThanHuman orchestrator initialise, the semantic
 * context build takes >1 s and hybrid search runs past its budget. Dev,
 * 2026-10-11, eval calls: turn 1 ran it twice (FIRST_TURN_FAST's early end,
 * then Ink's own end), 2.2-3.2 s each, beside the reply; the event loop stalled
 * up to 300-381 ms on turn 1 (loopLagMaxMs) against 48-81 ms after.
 *
 * Nothing in turn 1's reply request comes from that work: its note can only
 * reach the chat context while Ferni is listening, after a build that takes
 * longer than the reply takes to start (createTurnContextPusher), and the
 * request path (llmNode: turn-request.ts, crisis-gate.ts, director-notes.ts,
 * fast-lane.ts) reads no other output of it. (Its incrementTurn moves the
 * session turnCount that ttsNode reads for isFirstTurn; deferred, turn 1 keeps
 * its turn-1 count.) So on turn 1 the work waits
 * until Ferni starts speaking, which is after the reply's first token; only
 * the latest segment of the turn is built, and its note reaches turn 2 as
 * before. MAX_DEFER_MS bounds the wait when turn 1 gets no spoken reply.
 * Turns 2+ are never deferred.
 *
 * @module agents/multi-agent/first-turn-defer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserTurnHook } from './turn-intelligence.js';

const log = createLogger({ module: 'FirstTurnDefer' });

/** The longest turn 1's context waits for Ferni to speak. */
export const MAX_DEFER_MS = 6000;

export function firstTurnDeferEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.FIRST_TURN_DEFER_BACKGROUND === 'on';
}

export interface FirstTurnDeferral {
  /** The hook to give createTurnContextPusher. */
  hook: UserTurnHook;
  /** Feed each non-empty final transcript as it arrives, before the pusher sees it. */
  onFinalTranscript: () => void;
  /** Feed every agent state change; 'speaking' after turn 1 began releases it. */
  onAgentState: (newState: string | undefined) => void;
  /** Clears the timer when the session ends. */
  dispose: () => void;
}

export function deferFirstTurn(hook: UserTurnHook, maxDeferMs = MAX_DEFER_MS): FirstTurnDeferral {
  let released = false;
  let armedAt = 0;
  let calls = 0;
  let firstTurnSegments = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const open = (reason: string): void => {
    if (released) return;
    released = true;
    if (timer) clearTimeout(timer);
    log.info({ reason, waitedMs: Date.now() - armedAt }, 'FIRST_TURN_DEFER released');
    release();
  };

  return {
    // The pusher calls this once per final transcript, in order.
    hook: async (turnCtx, newMessage) => {
      const call = ++calls;
      if (call > firstTurnSegments) return hook(turnCtx, newMessage);
      await gate;
      // The last segment of turn 1 carries the whole turn; build only that one.
      if (call !== firstTurnSegments) return;
      return hook(turnCtx, newMessage);
    },
    onFinalTranscript() {
      if (released) return;
      firstTurnSegments++;
      if (armedAt) return;
      armedAt = Date.now();
      timer = setTimeout(() => open('timeout'), maxDeferMs);
    },
    onAgentState(newState) {
      if (armedAt && newState === 'speaking') open('speaking');
    },
    dispose() {
      if (timer) clearTimeout(timer);
    },
  };
}
