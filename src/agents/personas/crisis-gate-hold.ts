/**
 * The reply gate's hold (crisis-gate.ts): the model's reply waits, unspoken, until the crisis
 * read settles, then goes out as it was or gives way to what the read calls for.
 *
 * @module CrisisGateHold
 */

import { ReadableStream } from 'node:stream/web';
import { createLogger } from '../../utils/safe-logger.js';
import { noteCrisisHold } from '../safety/crisis-hold-timing.js';
import { escalationFailsClosed } from './crisis-gate-failure.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines, as before

/** How the hold ends: see holdUntilCleared. */
interface HoldOptions<C> {
  failClosed?: boolean;
  unreleased?: () => Promise<ReadableStream<C> | null> | null;
}

/**
 * Hold the model's reply until the escalation settles. No escalation: release
 * what was held and pass the rest through. An escalation: drop the reply and
 * stream the replacement instead. A rejected escalation counts as none, unless
 * `failClosed` (CRISIS_GATE_FAIL_CLOSED): then the reply is dropped, never
 * released, and the stream errors. `unreleased`, asked when the escalation settles with no
 * decision: null releases the reply; a stream replaces it (the dev model trial's unclean read).
 */
export function holdUntilCleared<C, D>(
  reply: ReadableStream<C>,
  escalation: Promise<D | null>,
  replacement: (decision: D) => Promise<ReadableStream<C> | null>,
  { failClosed = false, unreleased }: HoldOptions<C> = {}
): ReadableStream<C> {
  const reader = reply.getReader();
  let dropped = false;
  const dropReply = async (error: unknown): Promise<never> => {
    dropped = true;
    await reader.cancel().catch(() => undefined);
    throw error;
  };
  return new ReadableStream<C>({
    async start(controller) {
      const held: C[] = [];
      let firstHeldAt = 0;
      let released = false;
      let pumpError: unknown;
      const pump = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || dropped) return;
          if (released) controller.enqueue(value);
          else if (held.push(value) === 1) firstHeldAt = Date.now();
        }
      })().catch((error: unknown) => {
        pumpError = error;
      });

      try {
        const decision = await escalation.catch(failClosed ? dropReply : () => null);
        const instead = decision ? null : unreleased?.();
        if (!decision && !instead) {
          released = true;
          // How long a ready reply waited on the classifier: the latency this gate adds.
          log.info({ delayedMs: noteCrisisHold(escalation, firstHeldAt) }, 'CRISIS_HOLD');
          for (const chunk of held) controller.enqueue(chunk);
          held.length = 0;
          await pump;
          if (pumpError !== undefined) throw pumpError;
          controller.close();
          return;
        }
        dropped = true;
        await reader.cancel().catch(() => undefined);
        const next = await (decision ? replacement(decision) : instead);
        if (next)
          for await (const chunk of next as unknown as AsyncIterable<C>) controller.enqueue(chunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      dropped = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

/**
 * The hold for this env: CRISIS_GATE_FAIL_CLOSED's never releases a reply on a rejection.
 * `unreleased`: see holdUntilCleared.
 */
export function holdFor(
  env: Record<string, string | undefined>,
  { unreleased }: Pick<HoldOptions<unknown>, 'unreleased'> = {}
): typeof holdUntilCleared {
  const failClosed = escalationFailsClosed(env);
  if (!failClosed && !unreleased) return holdUntilCleared;
  return (reply, escalation, replacement, options) =>
    holdUntilCleared(reply, escalation, replacement, {
      ...options,
      failClosed,
      unreleased: unreleased as HoldOptions<never>['unreleased'],
    });
}
