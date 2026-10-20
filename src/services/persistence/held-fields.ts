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
/** A delete waits at most this long for a held write in flight, then deletes anyway. */
const DELETE_WAIT_MS = 10_000;

interface Pending<T> {
  part: Partial<T>;
  tries: number;
  notBefore: number;
  /** When it was kept (monotonic): an older part never overwrites fields a newer one wrote. */
  stamp: number;
}

const omit = <P extends object>(part: P, keys: Set<string>): P =>
  Object.fromEntries(Object.entries(part).filter(([k]) => !keys.has(k))) as P;

export function heldFields<T>(
  whenHeld: ((data: never) => Record<string, unknown> | null) | undefined,
  syncIntervalMs: number
) {
  const parts = new Map<string, Pending<T>>();
  const inFlight = new Map<string, Promise<unknown>>();
  /** The newest part written per user, and its fields. */
  const written = new Map<string, { stamp: number; keys: Set<string> }>();
  let stamps = 0;
  // Bumped by forget: a write in flight from before then is never put back
  let epoch = 0;
  const generations = new Map<string, number>();
  const generation = (userId: string) => `${epoch}:${generations.get(userId) ?? 0}`;
  /** Users whose document was deleted while one of their writes was in flight */
  const deleted = new Set<string>();
  return {
    /** A held user's set: keep only what whenHeld allows. True if anything was kept. */
    keep(userId: string, data: T): boolean {
      const part = whenHeld?.(data as never) as Partial<T> | null | undefined;
      if (!part || Object.keys(part).length === 0) return false;
      // New fields reset the backoff: written on the next sync
      const merged = { ...parts.get(userId)?.part, ...part };
      parts.set(userId, { part: merged, tries: 0, notBefore: 0, stamp: ++stamps });
      return true;
    },
    /** The user's data was deleted (`isDelete`) or cleared (all users without one): drop it. */
    forget(userId?: string, isDelete = false): void {
      if (userId === undefined) {
        epoch++;
        parts.clear();
        generations.clear();
        written.clear();
        return;
      }
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
      parts.delete(userId);
      written.delete(userId);
      if (isDelete && inFlight.has(userId)) deleted.add(userId);
    },
    /** Once this user's write in flight has settled, or after 10 s: a delete waits, never hangs. */
    async settled(userId: string): Promise<void> {
      const cap = new Promise<void>((resolve) => setTimeout(resolve, DELETE_WAIT_MS).unref?.());
      await Promise.race([inFlight.get(userId)?.catch(() => undefined), cap]);
    },
    /** At shutdown, after the final forced write: one error for anything still pending. */
    reportPending(collection: string): void {
      if (parts.size === 0) return;
      const users = Array.from(parts, ([userId, p]) => ({
        userId,
        fields: Object.keys(p.part).length,
      }));
      log.error({ collection, users }, 'Held-user consent writes still pending at shutdown');
    },
    /**
     * Write each kept part that is due (all of them when forced: shutdown, explicit flush) with
     * a merge write. A failed part is put back for a later sync, waiting syncIntervalMs x 2^tries
     * (at most 10 min), unless forget ran meanwhile; a part kept since wins field by field and is
     * due at once; fields a newer part already wrote are dropped from it. Never thrown.
     */
    async write(
      set: (userId: string, part: Partial<T>) => Promise<unknown>,
      dirty: Set<string>,
      force = false,
      remove?: (userId: string) => Promise<unknown>
    ): Promise<void> {
      for (const [userId, queued] of Array.from(parts)) {
        dirty.add(userId); // keeps the sync running until the part is written
        if (!force && queued.notBefore > Date.now()) continue;
        parts.delete(userId);
        // Right before each try: drop the fields a newer part has already written
        const newest = written.get(userId);
        const stale = newest && newest.stamp > queued.stamp ? newest.keys : new Set<string>();
        const pending = { ...queued, part: omit(queued.part, stale) };
        if (Object.keys(pending.part).length === 0) continue;
        const before = generation(userId);
        // Registered before the write starts, so a delete issued meanwhile always waits for it
        const writing = Promise.resolve().then(() => set(userId, pending.part));
        inFlight.set(userId, writing);
        try {
          await writing;
          if (!parts.has(userId)) dirty.delete(userId);
          // A delete that stopped waiting (10 s) ran before this write landed: delete again
          if (generation(userId) !== before && deleted.delete(userId)) await remove?.(userId);
          const last = written.get(userId);
          if (!last || last.stamp < pending.stamp)
            written.set(userId, { stamp: pending.stamp, keys: new Set(Object.keys(pending.part)) });
        } catch (error) {
          if (generation(userId) !== before) {
            deleted.delete(userId); // deleted or cleared meanwhile: nothing landed, nothing to undo
            continue;
          }
          const tries = pending.tries + 1;
          const wait = Math.min(syncIntervalMs * 2 ** tries, MAX_BACKOFF_MS);
          const newer = parts.get(userId);
          const last = written.get(userId);
          const stale = last && last.stamp > pending.stamp ? last.keys : new Set<string>();
          const part = omit(pending.part, stale);
          if (newer) parts.set(userId, { ...newer, part: { ...part, ...newer.part } });
          else if (Object.keys(part).length > 0)
            parts.set(userId, { part, tries, notBefore: Date.now() + wait, stamp: pending.stamp });
          if (parts.has(userId)) dirty.add(userId);
          const fields = { userId, tries, error: String(error) };
          if (tries === ALERT_AFTER) log.error(fields, 'Held-user consent write keeps failing');
          else log.warn(fields, 'Held-user field write failed; retrying with backoff');
        } finally {
          if (inFlight.get(userId) === writing) inFlight.delete(userId);
        }
      }
    },
  };
}
