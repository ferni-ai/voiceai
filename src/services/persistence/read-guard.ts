/**
 * A failed load must never let a write replace what wasn't read.
 *
 * A non-strict PersistenceStore.load answers null on a read error, the same as "no doc", so a
 * consumer holds defaults ([], 0) and its next write merge-puts them over the stored values.
 * The guard marks a key whose latest load failed; until a load succeeds, setImmediate rejects
 * with ReadFailedWriteError. (set() is not guarded yet: ten consumers remember a failed load as
 * loaded and never reload, so refusing their set() would drop every later write.)
 *
 * - Only the most recently started load sets or clears the mark, so a slow failing load can't
 *   mark a key after a newer one succeeded, and a slow success can't clear a newer failure.
 * - The mark affects only setImmediate here: get()/load() and their cache behave as before.
 * - A write that doesn't depend on a read (a new OAuth grant replacing tokens, keys merged into
 *   a map) passes `{ safeWithoutRead: true }` and is never refused.
 *
 * @module services/persistence/read-guard
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersistenceReadGuard' });

/** setImmediate for a key whose latest load failed: nothing was written. */
export class ReadFailedWriteError extends Error {
  override readonly name = 'ReadFailedWriteError';
  constructor(
    readonly collection: string,
    readonly key: string
  ) {
    super(`not written: the last read of ${collection}/${key} failed`);
  }
}

export interface WriteOptions {
  /** The data doesn't come from a read (a new grant, keys merged into a map): always written. */
  safeWithoutRead?: boolean;
}

export function readGuard(collection: string, now: () => number = () => Date.now()) {
  let generation = 0;
  const latest = new Map<string, number>(); // key -> generation of the latest load started
  const marks = new Map<string, { failures: number; at: number }>();

  return {
    /** A load is starting; pass the result to settle(). */
    begin(key: string): number {
      latest.set(key, ++generation);
      return generation;
    },
    /** A load finished; only the latest one started for the key decides the mark. */
    settle(key: string, gen: number, ok: boolean): void {
      if (latest.get(key) !== gen) return;
      latest.delete(key);
      if (ok) marks.delete(key);
      else marks.set(key, { failures: (marks.get(key)?.failures ?? 0) + 1, at: now() });
    },
    failed(key: string): boolean {
      return marks.has(key);
    },
    /** True when this write must not happen (logged). */
    refuses(key: string, options?: WriteOptions): boolean {
      if (options?.safeWithoutRead || !marks.has(key)) return false;
      log.warn({ collection, key }, 'Write refused: the last read failed');
      return true;
    },
  };
}

/**
 * load(), but this call's own failed read throws ReadFailedWriteError instead of answering null:
 * for callers that write back what they read. Decided per call, never from the shared mark,
 * which a concurrent newer load can clear between this read and the check.
 */
export async function loadOrThrow<T>(
  store: {
    load: (key: string, o?: { fresh?: boolean; strict?: boolean | 'read' }) => Promise<T | null>;
  } | null,
  key: string,
  collection: string
): Promise<T | null> {
  try {
    return (await store?.load(key, { fresh: true, strict: 'read' })) ?? null;
  } catch {
    throw new ReadFailedWriteError(collection, key);
  }
}
