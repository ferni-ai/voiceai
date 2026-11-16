/**
 * A guest's opt-in to being called into an owner's calls (three-way calls).
 * Seth's rule: Ferni only ever dials a guest who opted in beforehand, and that
 * yes is recorded. Callers import this file, which wires the use cases to the
 * Firestore store; the rules are in domain/, the store's shape in ports/.
 *
 * This is the owner-scoped yes for group calls only. Whether Ferni may reach
 * the number at all (a STOP, a do-not-call) stays with messaging/policy.ts.
 *
 * @module services/messaging/guest-consent
 */
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { firestoreGuestConsentStore } from './adapters/firestore-guest-consent-store.js';
import * as useCases from './use-cases/guest-consent.js';
import type { GuestConsentDeps } from './use-cases/guest-consent.js';

export { GUEST_CONSENT_WORDING_VERSION } from './domain/guest-consent.js';
export type { GuestConsentDeps } from './use-cases/guest-consent.js';

function defaultGuestConsentDeps(): GuestConsentDeps {
  return {
    store: firestoreGuestConsentStore(getFirestoreDb()),
    env: process.env,
    now: () => new Date(),
  };
}

/** True only when the guest's yes for this owner stands, for the current wording or newer. */
export async function hasGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps = defaultGuestConsentDeps()
): Promise<boolean> {
  return useCases.hasGuestConsent(ownerUid, e164, deps);
}

/** Records the guest's yes to `wordingVersion`. Throws when it can't be keyed or saved. */
export async function recordGuestConsent(
  ownerUid: string,
  e164: string,
  wordingVersion: number,
  deps: GuestConsentDeps = defaultGuestConsentDeps()
): Promise<void> {
  return useCases.recordGuestConsent(ownerUid, e164, wordingVersion, deps);
}

/** Records the guest's revoke; the record stays. Throws when it can't be keyed or saved. */
export async function revokeGuestConsent(
  ownerUid: string,
  e164: string,
  deps: GuestConsentDeps = defaultGuestConsentDeps()
): Promise<void> {
  return useCases.revokeGuestConsent(ownerUid, e164, deps);
}
