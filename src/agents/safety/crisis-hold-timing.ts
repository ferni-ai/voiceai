/**
 * The crisis gate's hold on a turn's TURN_RECEIPT: while the classifier's verdict is
 * pending, the model's reply is held (crisis-gate.ts holdUntilCleared). The wait its
 * first words had goes to turn-timing.ts, keyed by the session the verdict holds
 * (crisis-gate-signal.ts), so a latency A/B can see the crisis share of a slow turn.
 *
 * @module agents/safety/crisis-hold-timing
 */
import { noteTurnTiming, sessionIdIn } from '../../speech/output-control/turn-timing.js';
import { sessionHeldBy } from './crisis-gate-signal.js';

/** A reply held on `verdict` was released: the ms its first words waited (0: none held). */
export function noteCrisisHold(verdict: Promise<unknown>, firstHeldAt: number): number {
  const delayedMs = firstHeldAt ? Date.now() - firstHeldAt : 0;
  const session = sessionHeldBy(verdict) as { userData?: unknown } | undefined;
  noteTurnTiming(sessionIdIn(session?.userData), 'crisis', delayedMs);
  return delayedMs;
}
