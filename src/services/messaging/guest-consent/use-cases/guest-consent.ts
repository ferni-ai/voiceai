/**
 * Record and revoke a guest's yes to being called into an owner's calls, by her
 * number's key: phoneHash (outreach/checkin-replies.ts), the HMAC keyed from
 * LOG_HASH_SECRET that consent/{phoneHash} uses, so this record and her own STOP
 * share one key. check-guest-consent.ts keys a number and checks it. Only that
 * key's shape is accepted, so a raw number can never become a record's id.
 *
 * Writes that can't be saved throw, so the caller can say so. No yes can be
 * recorded for a wording that doesn't exist yet.
 *
 * @module services/messaging/guest-consent/use-cases/guest-consent
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { bqHash } from '../../../analytics/bq-events.js';
import { phoneHashKeyVersion, type Env } from '../../../outreach/checkin-replies.js';
import {
  afterRevoke,
  afterYes,
  GUEST_CONSENT_WORDING_VERSION,
  isWordingVersion,
} from '../domain/guest-consent.js';
import type { GuestConsentStore } from '../ports/guest-consent-store.js';

const log = createLogger({ module: 'guest-consent' });

/** The owner as logs name them: a keyed hash, never the uid. */
export const ownerTag = (ownerUid: string, env: Env): string | null =>
  bqHash('user', ownerUid, env);

/** A key as phoneHash makes it (64 hex); anything else, a raw number say, is refused. */
const isPhoneKey = (hash: string): boolean => /^[0-9a-f]{64}$/.test(hash);

export interface GuestConsentDeps {
  store: GuestConsentStore;
  /** Holds LOG_HASH_SECRET, the key behind the phone hash. */
  env: Env;
  now: () => Date;
}

/**
 * The guest said yes to `wordingVersion` at `saidAt`: when she said it, stamped
 * by our server and kept the same on a retry (now when not given). It clears an
 * earlier revoke, the history kept; a revoke made at `saidAt` or after stands and
 * nothing is written. Throws for a wording version above the current one, or a
 * time later than now. By the number's key: a guest's invite keeps no number.
 */
export async function recordGuestConsentByKey(
  ownerUid: string,
  hash: string,
  wordingVersion: number,
  deps: GuestConsentDeps,
  saidAt?: Date
): Promise<void> {
  if (!isWordingVersion(wordingVersion) || wordingVersion > GUEST_CONSENT_WORDING_VERSION) {
    throw new Error(
      `Guest consent needs a wording version from 1 to ${GUEST_CONSENT_WORDING_VERSION}`
    );
  }
  if (!ownerUid.trim() || !isPhoneKey(hash))
    throw new Error('Guest consent needs an owner and a key');
  const now = deps.now();
  const when = saidAt ?? now;
  // A time ahead of ours could outrank, on a retry, a revoke made after the yes.
  if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime()) {
    throw new Error('Guest consent needs the time the yes was said, not a later one');
  }
  const at = when.toISOString();
  const keyVersion = phoneHashKeyVersion(deps.env);
  let written = false;
  await deps.store.update(ownerUid, hash, (prev) => {
    const next = afterYes(prev, wordingVersion, at, keyVersion);
    written = next !== null;
    return next;
  });
  const fields = { ownerTag: ownerTag(ownerUid, deps.env), wordingVersion };
  if (written) log.info(fields, 'Guest consent recorded');
  else log.info(fields, 'Guest consent not recorded: a later revoke stands, or no account');
}

/** The guest withdrew: the record stays, with revokedAt. Nothing on record: nothing written. */
export async function revokeGuestConsentByKey(
  ownerUid: string,
  hash: string,
  deps: GuestConsentDeps
): Promise<void> {
  if (!ownerUid.trim() || !isPhoneKey(hash))
    throw new Error('Guest consent needs an owner and a key');
  const at = deps.now().toISOString();
  await deps.store.update(ownerUid, hash, (prev) => afterRevoke(prev, at));
  log.info({ ownerTag: ownerTag(ownerUid, deps.env) }, 'Guest consent revoke handled');
}
