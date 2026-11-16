/**
 * Record, revoke and check a guest's yes to being called into an owner's calls.
 *
 * The guest's number is normalised to E.164 (outreach/checkin-replies.ts
 * toE164) and kept only as its keyed hash: phoneHash, the HMAC keyed from
 * LOG_HASH_SECRET that consent/{phoneHash} uses, so this record and the
 * guest's own STOP share one key. A plain SHA-256 would not do: the phone
 * number space is small enough to brute-force. The number is never stored,
 * logged or returned.
 *
 * Checks fail closed (no key, no number, an unreadable store: no consent);
 * writes that can't be keyed or saved throw, so the caller can say so.
 *
 * @module services/messaging/guest-consent/use-cases/guest-consent
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import {
  phoneHash,
  phoneHashKeyVersion,
  toE164,
  type Env,
} from '../../../outreach/checkin-replies.js';
import {
  afterRevoke,
  afterYes,
  consentStands,
  GUEST_CONSENT_WORDING_VERSION,
  isWordingVersion,
} from '../domain/guest-consent.js';
import type { GuestConsentStore } from '../ports/guest-consent-store.js';

const log = createLogger({ module: 'guest-consent' });

export interface GuestConsentDeps {
  store: GuestConsentStore;
  /** Holds LOG_HASH_SECRET, the key behind the phone hash. */
  env: Env;
  now: () => Date;
  /** The wording version a yes must be at or above; GUEST_CONSENT_WORDING_VERSION unless a test says otherwise. */
  wordingVersion?: number;
}

/** The record's key for this owner and number, or null when it can't be keyed. */
function keyOf(ownerUid: string, e164: string, env: Env): string | null {
  const number = ownerUid.trim() ? toE164(e164) : null;
  return number ? phoneHash(number, env) : null;
}

function requireKey(ownerUid: string, e164: string, env: Env): string {
  const hash = keyOf(ownerUid, e164, env);
  if (!hash)
    throw new Error('Guest consent cannot be keyed: no owner, no valid number or no hash key');
  return hash;
}

/** True only when the guest's yes for this owner stands, for the current wording or newer. */
export async function hasGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps
): Promise<boolean> {
  const hash = keyOf(ownerUid, e164, deps.env);
  if (!hash) {
    log.warn(
      { ownerUid },
      'Guest consent not checkable (no valid number or hash key); treated as no'
    );
    return false;
  }
  try {
    const current = deps.wordingVersion ?? GUEST_CONSENT_WORDING_VERSION;
    return consentStands(await deps.store.read(ownerUid, hash), current);
  } catch (error) {
    log.error({ error: String(error), ownerUid }, 'Guest consent not readable; treated as no');
    return false;
  }
}

/** The guest said yes to `wordingVersion`: any earlier revoke is cleared, the history kept. */
export async function recordGuestConsent(
  ownerUid: string,
  e164: string,
  wordingVersion: number,
  deps: GuestConsentDeps
): Promise<void> {
  if (!isWordingVersion(wordingVersion)) {
    throw new Error('Guest consent needs a wording version that is a whole number from 1');
  }
  const hash = requireKey(ownerUid, e164, deps.env);
  const at = deps.now().toISOString();
  const keyVersion = phoneHashKeyVersion(deps.env);
  await deps.store.update(ownerUid, hash, (prev) => afterYes(prev, wordingVersion, at, keyVersion));
  log.info({ ownerUid, wordingVersion }, 'Guest consent recorded');
}

/** The guest withdrew: the record stays, with revokedAt. Nothing on record: nothing written. */
export async function revokeGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps
): Promise<void> {
  const hash = requireKey(ownerUid, e164, deps.env);
  const at = deps.now().toISOString();
  await deps.store.update(ownerUid, hash, (prev) => afterRevoke(prev, at));
  log.info({ ownerUid }, 'Guest consent revoked');
}
