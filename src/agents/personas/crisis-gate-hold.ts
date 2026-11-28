/**
 * The reply gate's hold (crisis-gate.ts): the model's reply waits, unspoken, until the crisis
 * read settles, then goes out as it was or gives way to what the read calls for.
 *
 * @module CrisisGateHold
 */

import { ReadableStream } from 'node:stream/web';
import type { CallTurnIds } from '../../utils/call-turn.js';
import { createLogger } from '../../utils/safe-logger.js';
import { noteCrisisHold } from '../safety/crisis-hold-timing.js';
import { escalationFailsClosed } from './crisis-gate-failure.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines, as before

/**
 * Hold the model's reply until the escalation settles. No escalation: release
 * what was held and pass the rest through. An escalation: drop the reply and
 * stream the replacement instead. A rejected escalation counts as none, unless
 * `failClosed` (CRISIS_GATE_FAIL_CLOSED): then the reply is dropped, never
 * released, and the stream errors. `ids`: the call and turn on the CRISIS_HOLD line.
 */
export function holdUntilCleared<C, D>(
  reply: ReadableStream<C>,
  escalation: Promise<D | null>,
  ids: CallTurnIds,
  replacement: (decision: D) => Promise<ReadableStream<C> | null>,
  { failClosed = false }: { failClosed?: boolean } = {}
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
        if (!decision) {
          released = true;
          // How long a ready reply waited on the classifier: the latency this gate adds.
          log.info({ ...ids, delayedMs: noteCrisisHold(escalation, firstHeldAt) }, 'CRISIS_HOLD');
          for (const chunk of held) controller.enqueue(chunk);
          held.length = 0;
          await pump;
          if (pumpError !== undefined) throw pumpError;
          controller.close();
          return;
        }
        dropped = true;
        await reader.cancel().catch(() => undefined);
        const next = await replacement(decision);
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

/** The hold for this env: CRISIS_GATE_FAIL_CLOSED's never releases a reply on a rejection. */
export function holdFor(env: Record<string, string | undefined>): typeof holdUntilCleared {
  if (!escalationFailsClosed(env)) return holdUntilCleared;
  return (reply, escalation, ids, replacement) =>
    holdUntilCleared(reply, escalation, ids, replacement, { failClosed: true });
}
