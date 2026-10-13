/**
 * Which keys (users) a process has read from a store, for as long as that read still counts.
 *
 * The contact services cache each user's contacts in memory and used to mark the user as
 * loaded with a plain Set, forever. The voice agent and the web server are different
 * processes writing the same stores, so a read that never expires hides whatever the other
 * process writes: a person the agent saved in a call never reached the panel, and an edit
 * made in the panel never reached the agent. A mark that expires sends the next read back
 * to the store.
 *
 * Drop-in for the Set it replaces: has, add, delete, clear.
 *
 * @module utils/expiring-marks
 */

/** How long a contacts read counts before the store is read again */
export const CONTACTS_READ_TTL_MS = 60_000;

export interface ExpiringMarks {
  has: (key: string) => boolean;
  add: (key: string) => void;
  delete: (key: string) => boolean;
  clear: () => void;
}

export function createExpiringMarks(
  ttlMs: number = CONTACTS_READ_TTL_MS,
  now: () => number = () => Date.now()
): ExpiringMarks {
  const markedAt = new Map<string, number>();
  return {
    has(key) {
      const at = markedAt.get(key);
      if (at === undefined) return false;
      if (now() - at < ttlMs) return true;
      markedAt.delete(key);
      return false;
    },
    add(key) {
      markedAt.set(key, now());
    },
    delete: (key) => markedAt.delete(key),
    clear: () => markedAt.clear(),
  };
}
