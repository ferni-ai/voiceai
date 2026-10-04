/**
 * Batched knowledge capture. captureTurn() makes an LLM entity-extraction
 * call per turn: 36 runs across 7 dev calls, on the single event loop the
 * live call shares. Turns now collect per session and run as one capture
 * every few turns. Later turns still find the entities (BM25 search reads
 * entity_store live), a few turns later than before.
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { createTurnBatcher, type TurnBatcherOptions } from '../../dynamic/turn-batcher.js';
import { captureTurn, type TurnCaptureInput } from './knowledge-capture.js';

const log = createLogger({ module: 'KnowledgeCaptureBatch' });

export const KNOWLEDGE_CAPTURE_BATCH_TURNS = 4;
export const KNOWLEDGE_CAPTURE_IDLE_MS = 8_000;

/** One capture covering several turns of a session, in turn order (latest emotion/topic win). */
export function mergeTurnCaptures(inputs: readonly TurnCaptureInput[]): TurnCaptureInput {
  const byTurn = new Map<number, TurnCaptureInput>();
  for (const input of inputs) byTurn.set(input.turnNumber, input); // a turn queued twice counts once
  const ordered = [...byTurn.values()].sort((a, b) => a.turnNumber - b.turnNumber);
  const last = ordered[ordered.length - 1];
  return { ...last, transcript: ordered.map((i) => i.transcript).join('\n') };
}

export type KnowledgeCaptureBatchOptions = Pick<
  TurnBatcherOptions<TurnCaptureInput>,
  'setTimer' | 'clearTimer'
> & {
  capture?: (input: TurnCaptureInput) => Promise<unknown>;
};

/** Queue that runs merged captures and can be drained at shutdown. */
export function createKnowledgeCaptureQueue(options: KnowledgeCaptureBatchOptions = {}): {
  queue: (input: TurnCaptureInput) => void;
  drain: (timeoutMs: number) => Promise<void>;
} {
  const capture = options.capture ?? captureTurn;
  const inFlight = new Set<Promise<unknown>>();
  const batcher = createTurnBatcher<TurnCaptureInput>({
    maxItems: KNOWLEDGE_CAPTURE_BATCH_TURNS,
    idleMs: KNOWLEDGE_CAPTURE_IDLE_MS,
    keyOf: (input) => `${input.userId}:${input.sessionId}`,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    flush: (_key, inputs) => {
      const merged = mergeTurnCaptures(inputs);
      const run = capture(merged)
        .catch((error: unknown) =>
          log.debug({ error: String(error) }, 'Batched knowledge capture failed')
        )
        .finally(() => inFlight.delete(run));
      inFlight.add(run);
    },
  });
  return {
    queue: (input) => batcher.add(input),
    async drain(timeoutMs: number): Promise<void> {
      batcher.flushAll();
      const timeout = new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs).unref?.();
      });
      await Promise.race([Promise.allSettled([...inFlight]).then(() => undefined), timeout]);
    },
  };
}

const defaultQueue = createKnowledgeCaptureQueue();

/** Queue a turn for knowledge capture; it runs with the next few turns of the session. */
export function queueTurnCapture(input: TurnCaptureInput): void {
  defaultQueue.queue(input);
}

/** Run every pending capture now and wait for them (bounded), for worker shutdown. */
export function drainTurnCaptures(timeoutMs = 10_000): Promise<void> {
  return defaultQueue.drain(timeoutMs);
}
