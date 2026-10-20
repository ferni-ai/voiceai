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

export function heldFields<T>(whenHeld?: (data: T) => Partial<T> | null) {
  const parts = new Map<string, Partial<T>>();
  return {
    /** A held user's set: keep only what whenHeld allows. True if anything was kept. */
    keep(userId: string, data: T): boolean {
      const part = whenHeld?.(data);
      if (!part || Object.keys(part).length === 0) return false;
      parts.set(userId, { ...parts.get(userId), ...part });
      return true;
    },
    /**
     * Write each kept part with a merge write. A failed part is put back (a part kept since
     * wins field by field) and its user marked dirty for the next sync: never dropped, never thrown.
     */
    async write(
      set: (userId: string, part: Partial<T>) => Promise<unknown>,
      dirty: Set<string>
    ): Promise<void> {
      for (const [userId, part] of Array.from(parts)) {
        parts.delete(userId);
        try {
          await set(userId, part);
        } catch (error) {
          parts.set(userId, { ...part, ...parts.get(userId) });
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
