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
 * stored docs without them (scrubHeldDoc), so they don't sit in Firestore until the next call.
 *
 * The window is stored too (minor_care_holds/{userId}.windows), because the scrub can fail, or the
 * process can die before it commits, and the next call may run in any process (prod runs 1 to 8
 * replicas). Each session start reads the stored windows back before the stores load
 * (loadHeldWindows), and redoes a scrub that never completed; so does the held-scrub sweep, for a
 * caller who never calls again (held-scrub-sweep.ts). A read that fails keeps the stores
 * unwritable for that user (reload-before-save.ts), never "no windows".
 *
 * A window is kept KEEP_DAYS after its purge only once it is scrubbed. Until then it is never
 * pruned and the doc has no TTL: the window is all that hides entries still stored.
 *
 * @module services/trust-systems/held-window
 */
import { setHeldWindowCheck } from '../../utils/held-window-check.js';
import { minorCareOn } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getTrustDb } from './trust-doc.js';

const log = createLogger({ module: 'minor-care-held-window' });

/** Past this many users, the oldest windows go (the purge's scrub already cleaned their docs). */
const MAX_USERS = 5000;
/** userId -> [from, to] in ms: held calls whose entries storage may still have. */
const windows = new Map<string, Array<[number, number]>>();

/** A held call ran from `from` to `to` (its purge): what was recorded then is the held caller's. */
export function noteHeldWindow(userId: string, from: number, to = Date.now()): [number, number] {
  const window: [number, number] = [Math.min(from, to), to];
  const list = (windows.get(userId) ?? []).filter(([a, b]) => a !== window[0] || b !== to);
  windows.delete(userId);
  windows.set(userId, [...list, window]);
  if (windows.size > MAX_USERS) windows.delete(windows.keys().next().value!);
  return window;
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

// ---- The stored windows: minor_care_holds/{userId} (minor-care-shared-hold.ts writes heldUntil there)

/** A scrubbed window is kept 90 days after its purge: pruned on every read and write, and the TTL. */
export const KEEP_DAYS = 90;
const KEEP_MS = KEEP_DAYS * 24 * 60 * 60 * 1000;
const MAX_STORED = 50;
export const HOLDS = 'minor_care_holds';

interface StoredWindow {
  start: number;
  end: number;
  scrubbed: boolean; // the purge's (or a later session start's) scrub of the stored docs completed
}

const holdRef = (userId: string) => getTrustDb().collection(HOLDS).doc(userId);

function storedWindows(data: Record<string, unknown> | undefined, now: number): StoredWindow[] {
  const list = Array.isArray(data?.windows) ? (data.windows as Partial<StoredWindow>[]) : [];
  return list
    .filter((w) => typeof w?.start === 'number' && typeof w.end === 'number')
    .map((w) => ({ start: w.start!, end: w.end!, scrubbed: w.scrubbed === true }))
    .filter((w) => !w.scrubbed || w.end + KEEP_MS > now); // unscrubbed: kept until it is
}

/** The newest MAX_STORED windows, except that an unscrubbed one is never dropped. */
function capped(list: StoredWindow[]): StoredWindow[] {
  let excess = list.length - MAX_STORED;
  return list.filter((w) => {
    if (excess <= 0 || !w.scrubbed) return true;
    excess--; // the oldest scrubbed go first
    return false;
  });
}

/**
 * Rewrite the stored windows, in a transaction. Once every window is scrubbed, keepUntil (and
 * expireAt, the TTL) is KEEP_DAYS after the latest purge; each write adds or keeps one window, so
 * it is always later than heldUntil (6 h). While one is unscrubbed both are null (a TTL policy
 * skips a field that isn't a timestamp), and unscrubbedSince, its purge, is what the sweep finds.
 */
async function updateStored(
  userId: string,
  change: (list: StoredWindow[]) => StoredWindow[] | null
): Promise<void> {
  const db = getTrustDb();
  const ref = holdRef(userId);
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const next = change(storedWindows(data, Date.now()));
    if (!next?.length) return;
    const list = capped(next);
    const pending = list.filter((w) => !w.scrubbed).map((w) => w.end);
    const keepUntil = pending.length ? null : Math.max(...list.map((w) => w.end + KEEP_MS));
    const expireAt = keepUntil === null ? null : new Date(keepUntil);
    const unscrubbedSince = pending.length ? Math.min(...pending) : null;
    tx.set(ref, { windows: list, keepUntil, expireAt, unscrubbedSince }, { merge: true });
  });
}

/** The purge: store its window, not yet scrubbed. Resolves false on a failure (logged). */
export async function storeHeldWindow(
  userId: string,
  [start, end]: [number, number]
): Promise<boolean> {
  try {
    await updateStored(userId, (list) => [
      ...list.filter((w) => w.start !== start || w.end !== end),
      { start, end, scrubbed: false },
    ]);
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'MINOR_CARE held window not stored');
    return false;
  }
}

/** The scrub covered every window this process knows for the user: mark those stored. */
export async function markHeldWindowsScrubbed(userId: string): Promise<boolean> {
  const known = windows.get(userId) ?? [];
  const covered = (w: StoredWindow) => known.some(([a, b]) => a === w.start && b === w.end);
  try {
    await updateStored(userId, (list) =>
      list.some((w) => !w.scrubbed && covered(w))
        ? list.map((w) => (covered(w) ? { ...w, scrubbed: true } : w))
        : null
    );
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'MINOR_CARE held window not marked scrubbed');
    return false;
  }
}

/**
 * A retry failed: rewrite the doc by the rules above, so one stored before them (with a TTL while
 * unscrubbed) never expires first. Never rejects.
 */
export async function keepUnscrubbedWindows(userId: string): Promise<void> {
  await updateStored(userId, (list) => (list.some((w) => !w.scrubbed) ? list : null)).catch(
    (error) => log.warn({ error: String(error), userId }, 'MINOR_CARE held windows not rewritten')
  );
}

/** loadHeldWindows for the sweep, whatever this process's MINOR_CARE. Rejects on a failed read. */
export async function loadStoredHeldWindows(userId: string): Promise<{ unscrubbed: boolean }> {
  const stored = storedWindows((await holdRef(userId).get()).data(), Date.now());
  for (const w of stored) noteHeldWindow(userId, w.start, w.end);
  return { unscrubbed: stored.some((w) => !w.scrubbed) };
}

/** Purges of this doc's windows still unscrubbed (stored data; no read). */
export const unscrubbedEnds = (data: Record<string, unknown> | undefined): number[] =>
  storedWindows(data, Date.now())
    .filter((w) => !w.scrubbed)
    .map((w) => w.end);

/**
 * Session start, in any process: read the user's stored windows into memory, so every read drops
 * what they cover. Answers whether one was never scrubbed. Rejects when they can't be read (the
 * caller keeps the stores unwritable). With MINOR_CARE off, reads nothing.
 */
export async function loadHeldWindows(userId: string): Promise<{ unscrubbed: boolean }> {
  if (!minorCareOn()) return { unscrubbed: false };
  const stored = storedWindows((await holdRef(userId).get()).data(), Date.now());
  for (const w of stored) noteHeldWindow(userId, w.start, w.end);
  return { unscrubbed: stored.some((w) => !w.scrubbed) };
}

/** The earliest start of the user's known windows: the scrubs' lower bound (addHeldScrub). */
export const heldSince = (userId: string): number | undefined =>
  windows.get(userId)?.reduce((min, [from]) => Math.min(min, from), Infinity);
// Any process loading this applies its windows to every store's reads (an API server too)
setHeldWindowCheck(recordedWhileHeld);
