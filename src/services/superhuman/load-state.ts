/**
 * Loading a stored superhuman profile without turning a failed read into a wipe.
 *
 * The planning and event modules used to catch a read error and return null,
 * which their callers took to mean "new user": they built a default profile and
 * saved it with a whole-document set(), replacing everything stored. One
 * transient Firestore error erased a user's history. loadDoc keeps the two cases
 * apart: 'missing' (nothing stored, safe to create) and 'error' (the read threw,
 * so the caller must not write this request).
 */

export type LoadResult<T> =
  { status: 'found'; data: T } | { status: 'missing' } | { status: 'error' };

/** The part of a Firestore DocumentReference that loadDoc needs. */
export interface ReadableDoc {
  path?: string;
  get(): Promise<{ exists: boolean; data(): unknown }>;
}

interface WarnLogger {
  warn(obj: object, msg: string): void;
}

/**
 * Reads one document. With no Firestore configured (`ref` undefined) there is
 * nothing stored and nothing can be written, so that reads as 'missing'.
 */
export async function loadDoc<T>(
  ref: ReadableDoc | null | undefined,
  log: WarnLogger
): Promise<LoadResult<T>> {
  if (!ref) return { status: 'missing' };
  try {
    const snap = await ref.get();
    return snap.exists ? { status: 'found', data: snap.data() as T } : { status: 'missing' };
  } catch (error) {
    log.warn({ error, path: ref.path }, 'Profile read failed; not writing it this request');
    return { status: 'error' };
  }
}

/** The stored data, or null when there is none or it couldn't be read: for read-only callers. */
export function dataOf<T>(result: LoadResult<T>): T | null {
  return result.status === 'found' ? result.data : null;
}
