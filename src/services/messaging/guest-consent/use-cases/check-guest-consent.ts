/**
 * A guest's yes by her number: the dial-time check (task 10 wires it at dial
 * time) and a revoke. The number is normalised to E.164 and keyed
 * (phoneHash); a check fails closed, a revoke that can't be keyed throws.
 *
 * @module services/messaging/guest-consent/use-cases/check-guest-consent
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { phoneHash, toE164, type Env } from '../../../outreach/checkin-replies.js';
import { consentStands } from '../domain/consent-stands.js';
import { GUEST_CONSENT_WORDING_VERSION } from '../domain/guest-consent.js';
import { ownerTag, revokeGuestConsentByKey, type GuestConsentDeps } from './guest-consent.js';

const log = createLogger({ module: 'guest-consent' });

/** The record's key for this owner and number, or null when it can't be keyed. */
function keyOf(ownerUid: string, e164: string, env: Env): string | null {
  const number = ownerUid.trim() ? toE164(e164) : null;
  return number ? phoneHash(number, env) : null;
}

/** True only when the guest's yes for this owner stands, for the current wording or newer. */
export async function hasGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps
): Promise<boolean> {
  try {
    const hash = keyOf(ownerUid, e164, deps.env);
    if (!hash) {
      log.warn({ ownerTag: ownerTag(ownerUid, deps.env) }, 'Guest consent not checkable; no');
      return false;
    }
    const consent = await deps.store.read(ownerUid, hash);
    return consentStands(consent, GUEST_CONSENT_WORDING_VERSION);
  } catch (error) {
    log.error({ error: String(error) }, 'Guest consent not checkable; treated as no');
    return false;
  }
}

/** revokeGuestConsentByKey by the guest's number. Throws when it can't be keyed or saved. */
export async function revokeGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps
): Promise<void> {
  const hash = keyOf(ownerUid, e164, deps.env);
  if (!hash)
    throw new Error('Guest consent cannot be keyed: no owner, no valid number or no hash key');
  await revokeGuestConsentByKey(ownerUid, hash, deps);
}
