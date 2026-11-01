/**
 * Whether a turn's build gets the call-opening context: team huddle (2d),
 * outreach bridge (2e) and cross-channel context (2f) in context-injections.ts.
 *
 * Off (FIRST_TURN_BY_CALLER_TURN, default), as before: turnCount 0. On the live
 * voice path the hook builds after user-input-transcribed.ts has stepped
 * turnCount, so that is never true there and these blocks never run (#3114).
 *
 * On: the call's first caller turn (callerTurnOf; turnCount + 1 where no hook
 * names the turn, as call-report.ts reads it), and no other. A first turn whose
 * build was skipped or lost its 150 ms race is not made up on a later turn: the
 * blocks set up the call's opening ("I'm glad you called"), which turn 5 is past.
 * The hook may build turn 1 more than once; each build reads the same caller
 * turn, so each request of that turn carries the blocks and no later one does.
 * A turn with safety guidance gets none of them.
 *
 * @module agents/processors/turn-processor/first-turn-context
 */

import { flagOn } from '../../../config/env-flag.js';
import { diag } from '../../../services/diagnostic-logger.js';
import { callerTurnOf } from '../../shared/caller-turn-count.js';

/**
 * True when this build gets the first-turn blocks. `turnZero`: the builder's own
 * turnCount 0 test, returned unchanged when off. `crisis`: the turn carries safety guidance.
 */
export function firstTurnContextDue(
  turnZero: boolean,
  userData: { turnCount?: number },
  crisis: boolean
): boolean {
  if (!flagOn('FIRST_TURN_BY_CALLER_TURN')) return turnZero;
  return !crisis && (callerTurnOf(userData) ?? (userData.turnCount ?? 0) + 1) === 1;
}

/** The debug line for a first turn's parallel blocks: how many came back, how many did not. */
export function logFirstTurnContext(results: ReadonlyArray<PromiseSettledResult<unknown>>): void {
  const settled = results.filter((r) => r.status === 'fulfilled' && Boolean(r.value)).length;
  diag.debug('First-turn parallel context complete', {
    settled,
    timedOut: results.length - settled,
  });
}
