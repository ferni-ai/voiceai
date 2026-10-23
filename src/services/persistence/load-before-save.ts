/**
 * Read a user's stored doc before anything is saved for them.
 *
 * Several stores record into an in-memory map and save the whole map (merge write), but their
 * loader was never called. Every save then wrote this process's defaults over what was stored:
 * all of a user's voice baseline, change talk or unsaid-signal history, every session.
 *
 * `save(userId, write)` runs `write` at once when the user's doc has been read. Otherwise it reads
 * first (one read per user at a time), lets the caller merge what was stored with what it recorded
 * meanwhile, and then writes. A failed read writes nothing: the next save tries the read again.
 *
 * @module services/persistence/load-before-save
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LoadBeforeSave' });

export interface LoadBeforeSave {
  /** Read the user's doc if not yet read; true once it has been (now or before). */
  ensure: (userId: string) => Promise<boolean>;
  /** Write now if the doc was read, else read it, merge, then write. Never before a good read. */
  save: (userId: string, write: () => void) => void;
  /** Forget which users were read (shutdown/cleanup). */
  clear: () => void;
}

export function loadBeforeSave<T>(
  name: string,
  /** A read that throws on failure (PersistenceStore.load with strict: 'read'). */
  read: (userId: string) => Promise<T | null>,
  /** Fold what was stored into what this process recorded before the read finished. */
  merge: (userId: string, stored: T | null) => void
): LoadBeforeSave {
  const loaded = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();

  const ensure = (userId: string): Promise<boolean> => {
    if (loaded.has(userId)) return Promise.resolve(true);
    const inFlight = pending.get(userId);
    if (inFlight) return inFlight;
    const reading = read(userId)
      .then((stored) => {
        merge(userId, stored);
        loaded.add(userId);
        return true;
      })
      .catch((error: unknown) => {
        log.warn({ error: String(error), userId, store: name }, 'Read failed; nothing saved');
        return false;
      })
      .finally(() => pending.delete(userId));
    pending.set(userId, reading);
    return reading;
  };

  return {
    ensure,
    save: (userId, write) => {
      if (loaded.has(userId)) return write();
      void ensure(userId).then((ok) => ok && write());
    },
    clear: () => loaded.clear(),
  };
}
