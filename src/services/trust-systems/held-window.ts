/**
 * MINOR_CARE: what a held call left in storage before its hold began.
 *
 * The voice prosody and celebration momentum stores flush on their own timers (every 10 s and
 * 3 s). So what a held caller said before giving their age is already stored when the hold
 * starts. The purge (purgeHeldUser) empties memory, but the next session start reads the stored
 * doc back, and the save after it would keep those entries for good, inside the owner's history.
 *
 * So the purge notes the held call's window here: from its session start to the purge. Each of
 * those stores drops the entries recorded inside a window whenever it reads a user back, and
 * rebuilds what it derives from them (a voice baseline, win counts). The purge also rewrites the
 * stored docs without them (scrubHeldDoc), so they don't sit in Firestore until the next call, or
 * come back in a process that never saw the window.
 *
 * @module services/trust-systems/held-window
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getTrustDb } from './trust-doc.js';

const log = createLogger({ module: 'minor-care-held-window' });

/** Past this many users, the oldest windows go (the purge's scrub already cleaned their docs). */
const MAX_USERS = 5000;
/** userId -> [from, to] in ms: held calls whose entries storage may still have. */
const windows = new Map<string, Array<[number, number]>>();

/** A held call ran from `from` to `to` (its purge): what was recorded then is the held caller's. */
export function noteHeldWindow(userId: string, from: number, to = Date.now()): void {
  const list = windows.get(userId) ?? [];
  windows.delete(userId);
  windows.set(userId, [...list, [Math.min(from, to), to]]);
  if (windows.size > MAX_USERS) windows.delete(windows.keys().next().value!);
}

type When = Date | string | number | undefined;
const ms = (at: When): number =>
  at instanceof Date ? at.getTime() : typeof at === 'string' ? Date.parse(at) : (at ?? NaN);

/** Recorded during a held call this process purged (at or after its start, up to its purge). */
export function recordedWhileHeld(userId: string, at: When): boolean {
  const t = ms(at);
  return (windows.get(userId) ?? []).some(([from, to]) => t >= from && t <= to);
}

/** These entries minus those recorded while held; the same array when none was. */
export function withoutHeld<T>(userId: string, entries: T[], at: (entry: T) => When): T[] {
  if (!windows.has(userId)) return entries;
  const kept = entries.filter((entry) => !recordedWhileHeld(userId, at(entry)));
  return kept.length === entries.length ? entries : kept;
}

/** JSON-shaped data without its undefined fields (the stores' docs hold no Timestamps). */
const plain = (data: object): Record<string, unknown> => JSON.parse(JSON.stringify(data));

/** Tests only. */
export function resetHeldWindows(): void {
  windows.clear();
}

/**
 * Rewrite one store's doc (bogle_users/{userId}/{collection}/{docId}) without the entries recorded
 * while held, in a transaction. `clean` answers the doc's new data, or null when none of it was
 * recorded while held. It is written here, not through the store, because the store refuses
 * every write while the user is held; this write only removes the held caller's entries.
 * Resolves false on a failure (logged; the next read still drops them); never rejects.
 */
export async function scrubHeldDoc<T extends object>(
  userId: string,
  collection: string,
  docId: string,
  clean: (userId: string, data: T) => T | null
): Promise<boolean> {
  if (!windows.has(userId)) return true;
  try {
    const db = getTrustDb();
    const ref = db.collection('bogle_users').doc(userId).collection(collection).doc(docId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
      const next = raw && clean(userId, raw as T); // the stores write dates as ISO strings
      if (next) tx.set(ref, plain({ ...raw, ...next, _updatedAt: new Date().toISOString() }));
    });
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId, collection }, 'MINOR_CARE held-entry scrub failed');
    return false;
  }
}
