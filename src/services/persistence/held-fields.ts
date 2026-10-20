/**
 * MINOR_CARE field-level hold for createPersistenceStore. For a held caller under 18 (not a
 * verified owner), a store's whenHeld picks the fields that must still persist: preferences,
 * cancellations, do-not-contact. Only those are queued, and they go out as a merge write, so
 * no stored field is blanked. Without whenHeld (the default), nothing is kept.
 *
 * A kept part is consent, so a failed write is never dropped: it is retried with backoff until
 * it succeeds, or until the user's data is deleted or cleared (forget). Like every pending write
 * in createPersistenceStore, it lives in memory and does not survive a process restart.
 *
 * @module services/persistence/held-fields
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersistenceHeldFields' });

/** At this many failed writes in a row, one error is logged (alerting); retries continue. */
const ALERT_AFTER = 5;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

interface Pending<T> {
  part: Partial<T>;
  tries: number;
  notBefore: number;
}

export function heldFields<T>(
  whenHeld: ((data: never) => Record<string, unknown> | null) | undefined,
  syncIntervalMs: number
) {
  const parts = new Map<string, Pending<T>>();
  // Bumped by forget: a write in flight from before then is never put back
  let epoch = 0;
  const generations = new Map<string, number>();
  const generation = (userId: string) => `${epoch}:${generations.get(userId) ?? 0}`;
  return {
    /** A held user's set: keep only what whenHeld allows. True if anything was kept. */
    keep(userId: string, data: T): boolean {
      const part = whenHeld?.(data as never) as Partial<T> | null | undefined;
      if (!part || Object.keys(part).length === 0) return false;
      // New fields reset the backoff: written on the next sync
      parts.set(userId, { part: { ...parts.get(userId)?.part, ...part }, tries: 0, notBefore: 0 });
      return true;
    },
    /** The user's data was deleted or cleared (all users without one): drop their pending part. */
    forget(userId?: string): void {
      if (userId === undefined) {
        epoch++;
        parts.clear();
        generations.clear();
        return;
      }
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
      parts.delete(userId);
    },
    /**
     * Write each kept part that is due with a merge write. A failed part is put back for a later
     * sync, waiting syncIntervalMs x 2^tries (at most 10 min), unless forget ran meanwhile; a part
     * kept since wins field by field and is due at once. Never dropped, never thrown.
     */
    async write(
      set: (userId: string, part: Partial<T>) => Promise<unknown>,
      dirty: Set<string>
    ): Promise<void> {
      for (const [userId, pending] of Array.from(parts)) {
        dirty.add(userId); // keeps the sync running until the part is written
        if (pending.notBefore > Date.now()) continue;
        parts.delete(userId);
        const before = generation(userId);
        try {
          await set(userId, pending.part);
          if (!parts.has(userId)) dirty.delete(userId);
        } catch (error) {
          if (generation(userId) !== before) continue; // deleted or cleared meanwhile
          const tries = pending.tries + 1;
          const wait = Math.min(syncIntervalMs * 2 ** tries, MAX_BACKOFF_MS);
          const newer = parts.get(userId)?.part;
          parts.set(
            userId,
            newer
              ? { part: { ...pending.part, ...newer }, tries: 0, notBefore: 0 }
              : { part: pending.part, tries, notBefore: Date.now() + wait }
          );
          dirty.add(userId);
          const fields = { userId, tries, error: String(error) };
          if (tries === ALERT_AFTER) log.error(fields, 'Held-user consent write keeps failing');
          else log.warn(fields, 'Held-user field write failed; retrying with backoff');
        }
      }
    },
  };
}
