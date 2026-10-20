/**
 * MINOR_CARE field-level hold for createPersistenceStore. For a held caller under 18 (not a
 * verified owner), a store's whenHeld picks the fields that must still persist: preferences,
 * cancellations, do-not-contact. Only those are queued, and they go out as a merge write, so
 * no stored field is blanked. Without whenHeld (the default), nothing is kept.
 *
 * @module services/persistence/held-fields
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersistenceHeldFields' });

/** Writes per part before it is dropped (logged as an error). */
const MAX_TRIES = 5;

export function heldFields<T>(whenHeld?: (data: T) => Partial<T> | null) {
  const parts = new Map<string, { part: Partial<T>; tries: number }>();
  // Bumped by forget: a write in flight from before then is never put back
  let epoch = 0;
  const generations = new Map<string, number>();
  const generation = (userId: string) => `${epoch}:${generations.get(userId) ?? 0}`;
  return {
    /** A held user's set: keep only what whenHeld allows. True if anything was kept. */
    keep(userId: string, data: T): boolean {
      const part = whenHeld?.(data);
      if (!part || Object.keys(part).length === 0) return false;
      const kept = parts.get(userId);
      parts.set(userId, { part: { ...kept?.part, ...part }, tries: kept?.tries ?? 0 });
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
     * Write each kept part with a merge write. A failed part is put back (a part kept since
     * wins field by field) and its user marked dirty for the next sync, unless forget ran
     * meanwhile; after MAX_TRIES failures it is dropped and logged as an error. Never throws.
     */
    async write(
      set: (userId: string, part: Partial<T>) => Promise<unknown>,
      dirty: Set<string>
    ): Promise<void> {
      for (const [userId, { part, tries }] of Array.from(parts)) {
        parts.delete(userId);
        const before = generation(userId);
        try {
          await set(userId, part);
        } catch (error) {
          if (generation(userId) !== before) continue; // deleted or cleared meanwhile
          if (tries + 1 >= MAX_TRIES) {
            log.error(
              { userId, tries: tries + 1, error: String(error) },
              'Held-user field write failed too often; dropped'
            );
            continue;
          }
          const newer = parts.get(userId)?.part;
          parts.set(userId, { part: { ...part, ...newer }, tries: tries + 1 });
          dirty.add(userId);
          log.warn(
            { userId, error: String(error) },
            'Held-user field write failed; retried next sync'
          );
        }
      }
    },
  };
}
