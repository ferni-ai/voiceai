/**
 * Firestore store for the owner's booking preferences, one document per kind of place:
 * bogle_users/{uid}/booking_prefs/{kind}. A human assistant learns "mornings before 10,
 * ask for Dr. Lee, a table for four by the window" once; this is where Ferni keeps it, so
 * a booking doesn't re-ask. callOnBehalf reading and saving these is the next slice.
 * What is stored, field by field, is in booking-prefs-fields.ts: structured values only,
 * no free text.
 *
 * Writes only when BOOKING_PREFS is on, for the account's verified owner on a live session
 * (the check is handed in: caller-recognition.ts is a layer above), never for a guest, an
 * unrecognised or phone-only caller, a minor-care-held session or account (the cross-process
 * hold is handed in too), or a record being erased (read in the write's transaction, as
 * erase-user-record.ts asks). A provenance other than said_by_owner or inferred, or a
 * partial that isn't an object, writes nothing. Off: no reads, no writes, no Firestore call.
 *
 * Erased with bogle_users/{uid} (account deletion is recursive); exported as
 * bogle_users/{uid}/booking_prefs (user-records-export.ts). No client reads or writes it:
 * firestore.rules denies unlisted subcollections.
 *
 * @module services/stores/booking-prefs-store
 */
import type { CollectionReference, DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { sharedId, writeHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  clean,
  FIELDS,
  isKind,
  isProvenance,
  isRecord,
  merged,
  toPrefs,
  type BookingKind,
  type BookingPrefs,
  type PrefsInput,
  type Provenance,
} from './booking-prefs-fields.js';

const log = createLogger({ module: 'booking-prefs-store' });

const COLLECTION = 'booking_prefs';
/** One person's id that names one document: never a placeholder, shared or path-like id */
const usable = (uid: unknown): uid is string =>
  typeof uid === 'string' && !sharedId(uid) && !uid.includes('/');

interface Deps {
  /** This session is the account's verified owner (caller-recognition.ts sessionIsVerifiedOwner) */
  verifiedOwner: (sessionId: string) => boolean;
  /** Held by minor care in any process, failing closed (minor-care-shared-hold.ts sharedHeldStrict) */
  accountHeld: (uid: string, env: Env) => Promise<boolean>;
  env?: Env;
  now?: () => Date;
}

interface BookingPrefsStore {
  get: (uid: string, kind: BookingKind) => Promise<BookingPrefs | null>;
  remember: (
    uid: string,
    kind: BookingKind,
    partial: PrefsInput,
    by: Provenance,
    sessionId: string | undefined
  ) => Promise<boolean>;
  forget: (uid: string, sessionId: string | undefined, kind?: BookingKind) => Promise<boolean>;
}

export function createBookingPrefsStore(db: Firestore, deps: Deps): BookingPrefsStore {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const on = (): boolean => flagOn('BOOKING_PREFS', env);
  const record = (uid: string): DocumentReference => db.collection('bogle_users').doc(uid);
  const prefs = (uid: string): CollectionReference => record(uid).collection(COLLECTION);
  const owner = (uid: string, sessionId: string | undefined): boolean =>
    usable(uid) && !!sessionId && deps.verifiedOwner(sessionId);

  /** Why this write may not happen, or null when it may */
  async function refusal(uid: string, sessionId: string | undefined): Promise<string | null> {
    if (!on()) return 'flag off';
    if (!owner(uid, sessionId)) return 'not the verified owner';
    // Fails closed: an unreadable shared hold counts as held, and nothing is saved
    if (writeHeld(uid, sessionId, env) || (await deps.accountHeld(uid, env))) return 'minor care';
    return null;
  }

  return {
    async get(uid, kind) {
      if (!on() || !usable(uid) || !isKind(kind)) return null;
      try {
        const snap = await prefs(uid).doc(kind).get();
        return snap.exists ? toPrefs(kind, snap.data() ?? {}) : null;
      } catch (error) {
        log.warn({ kind, error: String(error) }, 'Could not read booking prefs');
        return null;
      }
    },

    /** Merge `partial` into this kind's prefs; true when something was saved */
    async remember(uid, kind, partial, by, sessionId) {
      if (!isKind(kind) || !isProvenance(by) || !isRecord(partial)) return false;
      const why = await refusal(uid, sessionId);
      if (why) {
        log.info({ kind, why }, 'Booking prefs not saved');
        return false;
      }
      const next = clean(kind, partial);
      const dropped = FIELDS.filter((f) => f in partial && !(f in next));
      if (dropped.length > 0) log.info({ kind, dropped }, 'Booking prefs fields left out');
      if (Object.keys(next).length === 0) return false;
      const at = now().toISOString();
      const ref = prefs(uid).doc(kind);
      try {
        return await db.runTransaction(async (tx) => {
          const [user, snap] = await Promise.all([tx.get(record(uid)), tx.get(ref)]);
          if (isErasedOrErasing(user)) return false;
          const current = snap.exists
            ? toPrefs(kind, snap.data() ?? {})
            : { kind, updatedAt: at, provenance: {} };
          const out = merged(current, next, by, at);
          if (out) tx.set(ref, out);
          return !!out;
        });
      } catch (error) {
        log.error({ kind, error: String(error) }, 'Could not save booking prefs');
        return false;
      }
    },

    /** Delete one kind's prefs, or all of them; only for the verified owner */
    async forget(uid, sessionId, kind) {
      if (!on() || !owner(uid, sessionId) || (kind !== undefined && !isKind(kind))) return false;
      try {
        const refs = kind
          ? [prefs(uid).doc(kind)]
          : (await prefs(uid).get()).docs.map((d) => d.ref);
        await Promise.all(refs.map(async (ref) => ref.delete()));
        log.info({ kind: kind ?? 'all', count: refs.length }, 'Booking prefs forgotten');
        return true;
      } catch (error) {
        log.error({ kind, error: String(error) }, 'Could not forget booking prefs');
        return false;
      }
    },
  };
}
