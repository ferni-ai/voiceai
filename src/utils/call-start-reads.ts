/**
 * One Firestore read per caller document at call start, shared by every reader.
 *
 * A call's first seconds read bogle_users/{uid} from six places (identify, the
 * session profile load, cache warm-up, the intelligent loader, the trial check,
 * the language preference), each a separate get of the same 19 KB doc. While a
 * call-start window is open, reads with the same key share one promise, so the
 * doc is fetched once. Readers still get their own copy: FirestoreStore
 * hydrates (structuredClone) per caller, so nobody shares a mutable object.
 *
 * The window opens only in the voice agent (voice-agent-entry), for 15 s from
 * the start of a call, so API servers and later in-call reads behave exactly as
 * before. Writes that go through the store or the language preference drop the
 * shared entry, so a read after them is fresh.
 *
 * @module utils/call-start-reads
 */

const DEFAULT_WINDOW_MS = 15_000;

let windowEndsAt = 0;
const shared = new Map<string, Promise<unknown>>();

/** Start sharing reads for the next `windowMs`; any earlier call's entries are dropped. */
export function openCallStartReadWindow(windowMs = DEFAULT_WINDOW_MS, now = Date.now()): void {
  shared.clear();
  windowEndsAt = now + windowMs;
}

/**
 * Run `read` once per key while the window is open; outside it, run it as usual.
 * A failed read is not kept, so the next caller retries.
 */
export function readOncePerCallStart<T>(key: string, read: () => Promise<T>): Promise<T> {
  if (Date.now() >= windowEndsAt) {
    if (shared.size > 0) shared.clear();
    return read();
  }
  const existing = shared.get(key);
  if (existing) return existing as Promise<T>;
  const pending = read();
  shared.set(key, pending);
  pending.catch(() => {
    if (shared.get(key) === pending) shared.delete(key);
  });
  return pending;
}

/** Key for the caller's root document. */
export const userRootKey = (userId: string): string => `root:${userId}`;
/** Key for the conversation-days read FirestoreStore makes alongside the root doc. */
export const userDaysKey = (userId: string): string => `days:${userId}`;

/**
 * The caller's root doc data, shared at call start (undefined when missing).
 * Every caller gets its own deep copy, so no reader can change another's.
 */
export function readUserDocOnce<D>(
  userId: string,
  ref: { get(): Promise<{ data(): D | undefined }> }
): Promise<D | undefined> {
  return readOncePerCallStart(userRootKey(userId), async () => (await ref.get()).data()).then(
    (data) => data && structuredClone(data)
  );
}

/**
 * FirestoreStore.getProfile's two reads (the root doc and its conversation
 * days), shared at call start. Returns the doc data (undefined when missing).
 */
export function readUserRootOnce<
  D extends Record<string, unknown>,
  R extends { get(): Promise<{ data(): D | undefined }> },
>(
  userId: string,
  ref: R,
  readDays: (ref: R) => Promise<string[] | undefined>
): Promise<[D | undefined, string[] | undefined]> {
  return Promise.all([
    readUserDocOnce(userId, ref),
    // each reader gets its own array
    readOncePerCallStart(userDaysKey(userId), async () => readDays(ref)).then((d) => d && [...d]),
  ]);
}

/** Drop the shared reads of one caller (call after writing their root doc). */
export function forgetCallStartReads(userId: string): void {
  shared.delete(userRootKey(userId));
  shared.delete(userDaysKey(userId));
}

/** Drop one shared read (call after writing what it read). */
export function dropCallStartRead(key: string): void {
  shared.delete(key);
}

/** Close the window and drop everything (tests). */
export function resetCallStartReads(): void {
  shared.clear();
  windowEndsAt = 0;
}
