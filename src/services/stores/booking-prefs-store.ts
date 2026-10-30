/**
 * Firestore store for the owner's booking preferences, one document per kind of place:
 * bogle_users/{uid}/booking_prefs/{kind}. A human assistant learns "mornings, ask for
 * Dr. Lee, a table for two by the window" once; this is where Ferni keeps it, so a
 * booking doesn't re-ask. callOnBehalf reading and saving these is the next slice.
 *
 * - BOOKING_PREFS off: get gives null and nothing is written or deleted.
 * - Writes only for the account's verified owner on a live session, never for a guest, an
 *   unrecognised or phone-only caller, a minor-care-held session or account, or a record
 *   being erased (read in the write's transaction, as erase-user-record.ts asks).
 * - Every field is typed and bounded. Free text (who to ask for, the note, the insurance
 *   carrier) goes through the risky-text and credential screens: a field carrying a card
 *   number, a code, a link, a money ask or an instruction aimed at the model is dropped whole.
 * - The owner check, the cross-process minor-care hold and the risky-text screen live in
 *   layers above this one (caller-recognition.ts, services/outreach), so the caller hands them
 *   in (Deps); all three are required.
 * - Each field records who said it (said_by_owner or inferred) and when. An inferred value
 *   never replaces one the owner said.
 *
 * Erased with bogle_users/{uid} (account deletion is recursive); exported as
 * bogle_users/{uid}/booking_prefs (user-records-export.ts). No client reads or writes it:
 * firestore.rules denies unlisted subcollections.
 *
 * @module services/stores/booking-prefs-store
 */
import type { CollectionReference, DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { credentialInText } from '../../memory/credential-shapes.js';
import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { sharedId, writeHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'booking-prefs-store' });

const COLLECTION = 'booking_prefs';
const KINDS = ['dentist', 'doctor', 'restaurant', 'salon', 'general'] as const;
type BookingKind = (typeof KINDS)[number];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WINDOWS = ['early_morning', 'morning', 'midday', 'afternoon', 'evening'] as const;
const SEATING = ['indoor', 'outdoor', 'window', 'booth', 'bar', 'quiet'] as const;
const FIELDS = ['days', 'windows', 'askFor', 'notes', 'partySize', 'seating', 'insurance'] as const;
type Field = (typeof FIELDS)[number];
type Provenance = 'said_by_owner' | 'inferred';

interface Prefs {
  days?: Array<(typeof DAYS)[number]>;
  windows?: Array<(typeof WINDOWS)[number]>;
  /** The provider or person to ask for ("Dr. Lee") */
  askFor?: string;
  /** Anything else, screened, at most 200 characters */
  notes?: string;
  /** Restaurants only: 1 to 20 */
  partySize?: number;
  /** Restaurants only */
  seating?: (typeof SEATING)[number];
  /** The carrier's name only ("Aetna"), never a member or group id; not for restaurants or salons */
  insurance?: string;
}

interface BookingPrefs extends Prefs {
  kind: BookingKind;
  updatedAt: string;
  provenance: Partial<Record<Field, { by: Provenance; at: string }>>;
}

/** What a caller hands remember: anything, since it comes from a model; each field is checked */
type PrefsInput = Readonly<Partial<Record<Field, unknown>>>;

const MAX_NAME = 60;
const MAX_NOTES = 200;
/** A one-time code or PIN: six digits, spaced or dashed or not (isRiskyCallerText takes 7+) */
const SIX_DIGITS = /(\d[\s.-]?){6}/;
/** A person's or carrier's name: letters, spaces and . & ' - only, so never a number */
const NAME = /^\p{L}[\p{L} .&'-]*$/u;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isKind = (x: unknown): x is BookingKind => KINDS.includes(x as BookingKind);
/** One person's id that names one document: never a placeholder, shared or path-like id */
const usable = (uid: string): boolean => !sharedId(uid) && !uid.includes('/');

/** The risky-text screen: services/outreach/caller-text.ts callerText and isRiskyCallerText */
interface Screen {
  clean: (text: string, maxLength: number) => string;
  risky: (text: string) => boolean;
}

/** Screened free text, or undefined when anything risky is in it (dropped whole, never cut) */
function screened(screen: Screen, raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (credentialInText(raw) || screen.risky(raw) || SIX_DIGITS.test(raw)) return undefined;
  const kept = screen.clean(raw, max);
  // callerText puts [removed] where an instruction to the model was (it strips real brackets)
  return kept && !kept.includes('[removed]') ? kept : undefined;
}

function named(screen: Screen, raw: unknown): string | undefined {
  const name = screened(screen, raw, MAX_NAME);
  return name && NAME.test(name) ? name : undefined;
}

function listOf<T extends string>(allowed: readonly T[], raw: unknown): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = [...new Set(raw.filter((x): x is T => allowed.includes(x as T)))];
  return kept.length > 0 ? kept : undefined;
}

/** The fields this kind keeps, each checked; anything else is left out */
function clean(screen: Screen, kind: BookingKind, raw: PrefsInput): Prefs {
  const dining = kind === 'restaurant';
  const { partySize: size, seating } = raw;
  const prefs: Prefs = {
    days: listOf(DAYS, raw.days),
    windows: listOf(WINDOWS, raw.windows),
    askFor: named(screen, raw.askFor),
    notes: screened(screen, raw.notes, MAX_NOTES),
    partySize:
      dining && typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= 20
        ? size
        : undefined,
    seating:
      dining && SEATING.some((s) => s === seating) ? (seating as Prefs['seating']) : undefined,
    insurance: dining || kind === 'salon' ? undefined : named(screen, raw.insurance),
  };
  // Firestore refuses undefined values: a field left out is absent, not undefined
  for (const f of FIELDS) if (prefs[f] === undefined) delete prefs[f];
  return prefs;
}

/** A stored document, read as defensively as it is written */
function toPrefs(screen: Screen, kind: BookingKind, data: Record<string, unknown>): BookingPrefs {
  const fields = clean(screen, kind, data);
  const raw = isRecord(data.provenance) ? data.provenance : {};
  const provenance: BookingPrefs['provenance'] = {};
  for (const f of FIELDS) {
    const p = raw[f];
    const ok = isRecord(p) && (p.by === 'said_by_owner' || p.by === 'inferred');
    if (f in fields && ok && typeof p.at === 'string')
      provenance[f] = { by: p.by as Provenance, at: p.at };
  }
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
  return { ...fields, kind, updatedAt, provenance };
}

/** `next` merged over `current`, field by field; null when nothing would change */
function merged(
  current: BookingPrefs,
  next: Prefs,
  by: Provenance,
  at: string
): BookingPrefs | null {
  const out: BookingPrefs = { ...current, provenance: { ...current.provenance } };
  let changed = false;
  for (const f of FIELDS) {
    if (!(f in next)) continue;
    if (by === 'inferred' && current.provenance[f]?.by === 'said_by_owner') continue;
    Object.assign(out, { [f]: next[f] });
    out.provenance[f] = { by, at };
    changed = true;
  }
  return changed ? { ...out, updatedAt: at } : null;
}

/** The kind of place a booking is for, from free text ("my dentist", "dinner at Luigi's") */
export function bookingKindOf(text: string): BookingKind {
  const t = text.toLowerCase();
  if (/\b(dentist|dental|teeth|tooth|orthodontist|hygienist)\b/.test(t)) return 'dentist';
  if (/\b(doctor|dr|physician|pediatrician|dermatologist|clinic|check-?up|physical)\b/.test(t))
    return 'doctor';
  if (/\b(salon|haircut|hair|barber|stylist|nails|manicure|pedicure|spa|massage)\b/.test(t))
    return 'salon';
  if (/\b(restaurant|table|dinner|lunch|brunch|breakfast|reservation|bistro|cafe)\b/.test(t))
    return 'restaurant';
  return 'general';
}

interface Deps {
  /** This session is the account's verified owner (caller-recognition.ts sessionIsVerifiedOwner) */
  verifiedOwner: (sessionId: string) => boolean;
  /** Held by minor care in any process, failing closed (minor-care-shared-hold.ts sharedHeldStrict) */
  accountHeld: (uid: string, env: Env) => Promise<boolean>;
  screen: Screen;
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
    on() && usable(uid) && !!sessionId && deps.verifiedOwner(sessionId);

  /** Why this session may not write for uid, or null when it may */
  async function refusal(uid: string, sessionId: string | undefined): Promise<string | null> {
    if (!on()) return 'flag off';
    if (!owner(uid, sessionId)) return 'not the verified owner';
    // Fails closed: an unreadable shared hold counts as held, and nothing is saved
    if (writeHeld(uid, sessionId, env) || (await deps.accountHeld(uid, env))) return 'minor care';
    return null;
  }

  return {
    async get(uid: string, kind: BookingKind): Promise<BookingPrefs | null> {
      if (!on() || !usable(uid) || !isKind(kind)) return null;
      try {
        const snap = await prefs(uid).doc(kind).get();
        return snap.exists ? toPrefs(deps.screen, kind, snap.data() ?? {}) : null;
      } catch (error) {
        log.warn({ kind, error: String(error) }, 'Could not read booking prefs');
        return null;
      }
    },

    /** Merge `partial` into this kind's prefs; true when something was saved */
    async remember(
      uid: string,
      kind: BookingKind,
      partial: PrefsInput,
      by: Provenance,
      sessionId: string | undefined
    ): Promise<boolean> {
      if (!isKind(kind)) return false;
      const why = await refusal(uid, sessionId);
      if (why) {
        log.info({ kind, why }, 'Booking prefs not saved');
        return false;
      }
      const next = clean(deps.screen, kind, partial);
      const dropped = Object.keys(partial).filter((f) => !(f in next));
      if (dropped.length > 0) log.info({ kind, dropped }, 'Booking prefs fields left out');
      if (Object.keys(next).length === 0) return false;
      const at = now().toISOString();
      const ref = prefs(uid).doc(kind);
      try {
        return await db.runTransaction(async (tx) => {
          const [user, snap] = await Promise.all([tx.get(record(uid)), tx.get(ref)]);
          if (isErasedOrErasing(user)) return false;
          const current = snap.exists
            ? toPrefs(deps.screen, kind, snap.data() ?? {})
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
    async forget(uid: string, sessionId: string | undefined, kind?: BookingKind): Promise<boolean> {
      if (!owner(uid, sessionId) || (kind !== undefined && !isKind(kind))) return false;
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
