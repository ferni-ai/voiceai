/**
 * STREAM_ERROR_REPAIR (off by default): when the reply model's stream fails after some words
 * already reached the caller, the turn ends with one short spoken repair line instead of a
 * cut-off sentence and silence (#4011).
 *
 * The error is rethrown, as before, on an abort or barge-in, before any words, and on any call
 * with crisis risk (crisisRiskThisCall: risk noted, or a read still in flight), so a safety
 * reply's own ending is never followed by this line. The line is kept out of what memory
 * records (withoutStreamRepair).
 *
 * @module agents/personas/stream-repair
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { filterSilenceReply } from '../voice-agent/presence-check.js';
import { contentOf, type ReplyChunk } from './reply-chunks.js';
import { dropLeadingSaidBy } from './said-by.js';

const log = createLogger({ module: 'stream-repair' });

/** The one repair line, for every persona for now. Per-persona wording is a later follow-up. */
const STREAM_REPAIR_LINE = 'Sorry, I lost my train of thought there.';

/** How long a spoken repair line is held out of memory: the reply is recorded as it ends. */
const HOLD_MS = 30_000;

type ReplyStream = ReadableStream<llm.ChatChunk | string>;

/** Calls whose reply just ended with the repair line, and when. */
const repaired = new Map<string, number>();

function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * The reply, ending with STREAM_REPAIR_LINE when its source fails after spoken words on a call
 * with no crisis risk. Any other failure is rethrown, as before.
 */
function withStreamRepair<T extends ReplyChunk>(
  sessionId: string | undefined,
  reply: ReadableStream<T> | null
): ReadableStream<T> | null {
  if (!reply || !flagOn('STREAM_ERROR_REPAIR')) return reply;
  const reader = reply.getReader();
  let spoken = 0; // characters of reply text passed on so far
  let cancelled = false;
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        spoken += contentOf(value)?.trim().length ?? 0;
        controller.enqueue(value);
      } catch (error) {
        if (cancelled || isAbort(error) || spoken === 0) throw error;
        if (!sessionId || crisisRiskThisCall(sessionId)) throw error;
        repaired.set(sessionId, Date.now());
        log.warn({ sessionId, spokenChars: spoken }, 'Reply stream failed mid-reply; repair line');
        controller.enqueue(` ${STREAM_REPAIR_LINE}` as T);
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason);
    },
  });
}

/**
 * A reply's last steps, the stream repair outermost: llmNode's tail (ferni-agent.ts).
 * `sessionId` is the call's id (userData.services.sessionId), the key crisis risk is noted under.
 */
export function finishedReply<T extends ReplyChunk>(
  sessionId: string | undefined,
  session: object,
  reply: ReadableStream<T> | null
): ReplyStream | null {
  const said = dropLeadingSaidBy(filterSilenceReply(session, reply));
  return withStreamRepair(sessionId, said) as ReplyStream | null;
}

/**
 * What memory records of a reply: the spoken text without a repair line this call just
 * ended a reply with. Unchanged for any other reply, and always when the flag never fired.
 */
export function withoutStreamRepair(
  sessionId: string,
  spoken: string,
  now: () => number = Date.now
): string {
  const at = repaired.get(sessionId);
  if (at === undefined) return spoken;
  if (now() - at > HOLD_MS) {
    repaired.delete(sessionId);
    return spoken;
  }
  const text = spoken.trimEnd();
  return text.endsWith(STREAM_REPAIR_LINE)
    ? text.slice(0, -STREAM_REPAIR_LINE.length).trimEnd()
    : spoken;
}
