/**
 * The reply gate's hold (crisis-gate.ts): the model's reply waits, unspoken, until the crisis
 * read settles, then goes out as it was or gives way to what the read calls for.
 *
 * @module CrisisGateHold
 */

import { ReadableStream } from 'node:stream/web';
import { createLogger } from '../../utils/safe-logger.js';
import { noteCrisisHold } from '../safety/crisis-hold-timing.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines, as before

/**
 * Hold the model's reply until the escalation settles. No escalation: release
 * what was held and pass the rest through. An escalation: drop the reply and
 * stream the replacement instead.
 */
export function holdUntilCleared<C, D>(
  reply: ReadableStream<C>,
  escalation: Promise<D | null>,
  replacement: (decision: D) => Promise<ReadableStream<C> | null>
): ReadableStream<C> {
  const reader = reply.getReader();
  let dropped = false;
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
        const decision = await escalation.catch(() => null);
        if (!decision) {
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
