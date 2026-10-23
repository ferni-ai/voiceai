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
import { FieldValue } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersistenceHeldFields' });

/** At this many failed writes in a row, one error is logged (alerting); retries continue. */
const ALERT_AFTER = 5;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
/** The longest anything waits for a held write in flight: a delete, a sync, shutdown. */
const WAIT_CAP_MS = 10_000;
const TIMED_OUT = Symbol('timed out');

interface Pending<T> {
  part: Partial<T>;
  tries: number;
  notBefore: number;
  /** When it was kept (monotonic): an older part never overwrites fields a newer one wrote. */
  stamp: number;
}

/** A write that landed after its user's delete: its stamp and the fields it wrote. */
interface StaleWrite {
  stamp: number;
  keys: string[];
}

type SetPart<T> = (userId: string, part: Partial<T>) => Promise<unknown>;
type Remove = (userId: string) => Promise<unknown>;

const omit = <P extends object>(part: P, keys: Set<string>): P =>
  Object.fromEntries(Object.entries(part).filter(([k]) => !keys.has(k))) as P;

/** The promise's value, or TIMED_OUT after WAIT_CAP_MS. */
function within<V>(promise: Promise<V>): Promise<V | typeof TIMED_OUT> {
  const cap = new Promise<typeof TIMED_OUT>((resolve) => {
    setTimeout(() => resolve(TIMED_OUT), WAIT_CAP_MS).unref?.();
  });
  return Promise.race([promise, cap]);
}

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
  /** Compensating deletes that failed: retried first on every flush, before any newer part */
  const removeAgain = new Map<string, StaleWrite>();

  /**
   * Undo a write that landed after its user's delete. With nothing newer kept or written, the
   * whole document goes. Otherwise only the stale write's fields that no newer write covers are
   * deleted, so a newer opt-out is never wiped. A failure is retried on the next flush.
   */
  const compensate = async (
    userId: string,
    stale: StaleWrite,
    io: { set: SetPart<T>; remove: Remove; dirty: Set<string> }
  ): Promise<void> => {
    const newest = written.get(userId);
    const newer = Math.max(newest?.stamp ?? 0, parts.get(userId)?.stamp ?? 0) > stale.stamp;
    const fields = stale.keys.filter(
      (k) => !(newest && newest.stamp > stale.stamp && newest.keys.has(k))
    );
    try {
      if (!newer) await io.remove(userId);
      else if (fields.length > 0)
        await io.set(
          userId,
          Object.fromEntries(fields.map((f) => [f, FieldValue.delete()])) as Partial<T>
        );
      removeAgain.delete(userId);
    } catch {
      removeAgain.set(userId, stale);
      io.dirty.add(userId); // keeps the sync running until the delete lands
      log.error({ userId }, 'Compensating delete failed; retried on the next flush');
    }
  };

  return {
    /** A held user's set: keep only what whenHeld allows. True if anything was kept. */
    keep(userId: string, data: T): boolean {
      const part = whenHeld?.(data as never) as Partial<T> | null | undefined;
      if (!part || Object.keys(part).length === 0) return false;
      // New fields reset the backoff: written on the next sync (after any pending delete)
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
        written.clear(); // a pending compensating delete stays: it is a deletion obligation
        return;
      }
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
      parts.delete(userId);
      written.delete(userId);
      if (isDelete && inFlight.has(userId)) deleted.add(userId);
    },
    /** Once this user's write in flight has settled, or after 10 s: a delete waits, never hangs. */
    async settled(userId: string): Promise<void> {
      await within(inFlight.get(userId)?.catch(() => undefined) ?? Promise.resolve());
    },
    /** The store's delete of this user's document succeeded: no compensating delete is owed. */
    documentDeleted(userId: string): void {
      removeAgain.delete(userId);
    },
    /** True while a compensating delete is owed: the sync keeps running until it lands. */
    owed(): boolean {
      return removeAgain.size > 0;
    },
    /** At most 10 s for a promise (shutdown's final flush); false when it timed out. */
    async capped(promise: Promise<unknown>): Promise<boolean> {
      return (await within(promise)) !== TIMED_OUT;
    },
    /** At shutdown, after the final forced write: one error for anything still pending. */
    reportPending(collection: string): void {
      if (parts.size === 0 && inFlight.size === 0) return;
      const users = Array.from(parts, ([userId, p]) => ({
        userId,
        fields: Object.keys(p.part).length,
      }));
      const hung = Array.from(inFlight.keys());
      log.error({ collection, users, hung }, 'Held-user consent writes still pending at shutdown');
    },
    /**
     * Write each kept part that is due (all of them when forced: shutdown, explicit flush) with
     * a merge write. Pending compensating deletes run first, and a user's newer part waits for
     * theirs. A failed part is put back for a later sync, waiting syncIntervalMs x 2^tries (at
     * most 10 min), unless forget ran meanwhile; a part kept since wins field by field; fields a
     * newer part already wrote are dropped before every try. A write still in flight after 10 s
     * is left running (its outcome is handled when it settles) and the sync goes on. Never thrown.
     */
    async write(
      set: SetPart<T>,
      dirty: Set<string>,
      force = false,
      remove?: Remove
    ): Promise<void> {
      const io = remove ? { set, remove, dirty } : undefined;
      if (io)
        for (const [userId, stale] of Array.from(removeAgain)) await compensate(userId, stale, io);
      for (const [userId, queued] of Array.from(parts)) {
        dirty.add(userId); // keeps the sync running until the part is written
        // Waits for a pending compensating delete (so it can't wipe this) and a hung write
        if (removeAgain.has(userId) || inFlight.has(userId)) continue;
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
        const settle = writing.then(
          async () => {
            if (!parts.has(userId) && !removeAgain.has(userId)) dirty.delete(userId);
            if (generation(userId) !== before) {
              // Landed after its user's delete: undo it, or only its fields if a newer part exists
              if (deleted.delete(userId) && io)
                await compensate(
                  userId,
                  { stamp: pending.stamp, keys: Object.keys(pending.part) },
                  io
                );
              return;
            }
            const last = written.get(userId);
            if (!last || last.stamp < pending.stamp)
              written.set(userId, {
                stamp: pending.stamp,
                keys: new Set(Object.keys(pending.part)),
              });
          },
          (error: unknown) => {
            if (generation(userId) !== before) {
              deleted.delete(userId); // deleted or cleared meanwhile: nothing landed, nothing to undo
              return;
            }
            const tries = pending.tries + 1;
            const wait = Math.min(syncIntervalMs * 2 ** tries, MAX_BACKOFF_MS);
            const newer = parts.get(userId);
            const last = written.get(userId);
            const covered = last && last.stamp > pending.stamp ? last.keys : new Set<string>();
            const part = omit(pending.part, covered);
            if (newer) parts.set(userId, { ...newer, part: { ...part, ...newer.part } });
            else if (Object.keys(part).length > 0)
              parts.set(userId, {
                part,
                tries,
                notBefore: Date.now() + wait,
                stamp: pending.stamp,
              });
            if (parts.has(userId)) dirty.add(userId);
            const fields = { userId, tries, error: String(error) };
            if (tries === ALERT_AFTER) log.error(fields, 'Held-user consent write keeps failing');
            else log.warn(fields, 'Held-user field write failed; retrying with backoff');
          }
        );
        const done = settle.finally(() => {
          if (inFlight.get(userId) === writing) inFlight.delete(userId);
        });
        if ((await within(done)) === TIMED_OUT) {
          dirty.add(userId); // still in flight: settles on its own, and the sync goes on
          log.warn({ userId }, 'Held-user field write still in flight after 10 s; sync continues');
        }
      }
    },
  };
}
