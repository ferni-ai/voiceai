/**
 * The rules for a guest's yes to being called into an owner's calls (three-way
 * calls): Ferni dials a guest only after she has opted in for that owner, and
 * only while that yes stands, for the wording she was shown or a newer one.
 * Pure: no I/O, no clock, no keys. The record holds no phone number; its key
 * is the phone's keyed hash (use-cases/guest-consent.ts).
 *
 * @module services/messaging/guest-consent/domain/guest-consent
 */

/**
 * The version of the page wording a guest says yes to. Raise it whenever the
 * wording changes: every yes to an older wording then stops counting.
 */
export const GUEST_CONSENT_WORDING_VERSION = 1;

/** How many changes a record remembers (as in messaging/consent.ts). */
const HISTORY_MAX = 20;

/** One guest's consent for one owner: bogle_users/{owner}/guest_consents/{phoneHash}. */
export interface GuestConsent {
  /** The wording version of the latest yes. */
  wordingVersion: number;
  /** ISO time of the latest yes. */
  consentedAt: string;
  /** ISO time of a revoke after the latest yes; absent while the yes stands. */
  revokedAt?: string;
  /** Which key hashed the phone in the record's id, to find stale ones after a key rotation. */
  keyVersion?: string;
  /** Each change as "<ISO time> yes v<n>" or "<ISO time> revoked", oldest first. */
  history: string[];
}

export const isWordingVersion = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

const withChange = (history: readonly string[], change: string): string[] =>
  [...history, change].slice(-HISTORY_MAX);

/**
 * A yes made at `at` (when the guest said it): clears any revoke and takes the
 * new wording version; the history is kept. Null (nothing to write) when a
 * revoke on record is as late as this yes or later, or its time can't be read: a
 * slow or retried yes never undoes a stop that came after it, and a tie is a stop.
 */
export function afterYes(
  prev: GuestConsent | null,
  wordingVersion: number,
  at: string,
  keyVersion: string | null
): GuestConsent | null {
  if (prev?.revokedAt !== undefined && !(Date.parse(prev.revokedAt) < Date.parse(at))) {
    return null;
  }
  return {
    wordingVersion,
    consentedAt: at,
    ...(keyVersion !== null && { keyVersion }),
    history: withChange(prev?.history ?? [], `${at} yes v${wordingVersion}`),
  };
}

/**
 * A revoke keeps the record and marks when the yes ended. Null (nothing to
 * write) when there is no yes on record, or it is already revoked: the first
 * revoke's time stands.
 */
export function afterRevoke(prev: GuestConsent | null, at: string): GuestConsent | null {
  if (!prev || prev.revokedAt !== undefined) return null;
  return { ...prev, revokedAt: at, history: withChange(prev.history, `${at} revoked`) };
}

/** A stored record, or null when it is not one (a malformed record never reads as a yes). */
export function parseGuestConsent(raw: unknown): GuestConsent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isWordingVersion(r.wordingVersion) || typeof r.consentedAt !== 'string') return null;
  if (r.revokedAt !== undefined && typeof r.revokedAt !== 'string') return null;
  const history = Array.isArray(r.history) ? r.history.filter((h) => typeof h === 'string') : [];
  return {
    wordingVersion: r.wordingVersion,
    consentedAt: r.consentedAt,
    ...(typeof r.revokedAt === 'string' && { revokedAt: r.revokedAt }),
    ...(typeof r.keyVersion === 'string' && { keyVersion: r.keyVersion }),
    history,
  };
}
