/**
 * Call start: load the caller's current facts and when the last call ended
 * (last-call.ts), in parallel, and work out what is new or due since then.
 *
 * Start it when the call starts, next to the other memory loads; nothing
 * waits on it. A caller that is not ready yet just gets no block.
 *
 * @module intelligence/world-model/temporal/load
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { currentFacts, formatCurrentWorld } from './current.js';
import { lastCallEndedAt as readLastCallEndedAt } from './last-call.js';
import { formatSinceLastCall, sinceLastCall, type SinceLastCallItem } from './since-last-call.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from './store.js';
import { isWorldModelTemporalOn, type TemporalFact } from './types.js';

const log = createLogger({ module: 'world-model:temporal' });

export interface TemporalWorld {
  /** Current facts only. */
  facts: TemporalFact[];
  /** "Mindy (sister), recovering from knee surgery since Tuesday", ... */
  lines: string[];
  sinceLastCall: SinceLastCallItem[];
  /** The [SINCE YOU LAST TALKED] block, or null. */
  sinceNote: string | null;
  /** Both blocks, for the first recall note of the call; null when empty. */
  note: string | null;
}

/** What is going on now, then what came due or changed since the last call. */
export function formatTemporalNote(
  lines: readonly string[],
  sinceNote: string | null
): string | null {
  const now =
    lines.length > 0
      ? ['[GOING ON IN THEIR WORLD NOW]', ...lines.map((l) => `- ${l}`)].join('\n')
      : null;
  return [now, sinceNote].filter(Boolean).join('\n') || null;
}

export interface LoadTemporalWorldOptions {
  now?: Date;
  timeZone?: string;
  /** Text the call already carries about the past, to not repeat it. */
  alreadySaid?: readonly string[];
  store?: WorldFactStore;
  lastCallEndedAt?: (userId: string) => Promise<Date | string | null>;
  env?: Record<string, string | undefined>;
}

/** Null when WORLD_MODEL_TEMPORAL is off or the stores could not be read. */
export async function loadTemporalWorld(
  userId: string,
  options: LoadTemporalWorldOptions = {}
): Promise<TemporalWorld | null> {
  if (!isWorldModelTemporalOn(options.env) || !userId) return null;
  const when = { now: options.now ?? new Date(), timeZone: options.timeZone };
  const store = options.store ?? createFirestoreWorldFactStore();
  try {
    const [open, lastCallEndedAt] = await Promise.all([
      store.listOpen(userId),
      // Unknown (null) shows no "since" items; current facts still show.
      (options.lastCallEndedAt ?? readLastCallEndedAt)(userId).catch(() => null),
    ]);
    const facts = currentFacts(open, when);
    const items = sinceLastCall({
      ...when,
      facts,
      lastCallEndedAt,
      alreadySaid: options.alreadySaid,
    });
    const lines = formatCurrentWorld(facts, when);
    const sinceNote = formatSinceLastCall(items);
    const world = {
      facts,
      lines,
      sinceLastCall: items,
      sinceNote,
      note: formatTemporalNote(lines, sinceNote),
    };
    log.info(
      {
        userId,
        facts: facts.length,
        since: items.map((i) => i.kind),
        lastCallKnown: Boolean(lastCallEndedAt),
      },
      'WORLD_TEMPORAL_LOADED'
    );
    return world;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Temporal world not loaded');
    return null;
  }
}
