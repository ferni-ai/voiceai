/**
 * Whether a guest's yes stands: the dial-time rule (check-guest-consent.ts). Pure.
 *
 * @module services/messaging/guest-consent/domain/consent-stands
 */
import { GUEST_CONSENT_WORDING_VERSION, type GuestConsent } from './guest-consent.js';

/** True only for a yes that stands (no revoke) to the current wording or a newer one. */
export function consentStands(
  consent: GuestConsent | null,
  currentVersion: number = GUEST_CONSENT_WORDING_VERSION
): boolean {
  return (
    consent !== null && consent.revokedAt === undefined && consent.wordingVersion >= currentVersion
  );
}
