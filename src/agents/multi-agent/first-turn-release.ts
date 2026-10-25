import { setImmediate as yieldToLoop } from 'node:timers/promises';

/**
 * FIRST_TURN_DEFER_RELEASE: what lifts turn 1's held context build once Ferni
 * replies (first-turn-defer.ts). Kept apart from that module, which loads the
 * crisis guard, so the call-path warm-up can read the flag without loading it.
 *
 * @module agents/multi-agent/first-turn-release
 */

/** What lifts the hold once Ferni replies: 600 ms into the reply, or its end. */
export type FirstTurnRelease = 'settle' | 'reply_end';

/** FIRST_TURN_DEFER_RELEASE: `reply_end`, or `settle` (the default) for anything else. */
export function firstTurnDeferRelease(
  env: Record<string, string | undefined> = process.env
): FirstTurnRelease {
  return env.FIRST_TURN_DEFER_RELEASE?.trim().toLowerCase() === 'reply_end'
    ? 'reply_end'
    : 'settle';
}

/**
 * True only when FIRST_TURN_DEFER_RELEASE=reply_end. It alone turns on the
 * turn-1 build's event-loop yields and the Vertex warm-up, which are otherwise
 * as on main.
 */
export const replyEndRelease = (env: Record<string, string | undefined> = process.env): boolean =>
  firstTurnDeferRelease(env) === 'reply_end';

/**
 * Between the turn-1 build's cold steps, under reply_end only: back to back
 * they starved the reply's audio pump (LOOP_STALL), so each one yields.
 */
export const yieldIfReplyEnd = async (): Promise<void> => {
  if (replyEndRelease()) await yieldToLoop();
};
