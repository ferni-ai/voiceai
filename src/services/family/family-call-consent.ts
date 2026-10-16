/**
 * A family member's own yes to Ferni calling them.
 *
 * Ferni rings a family member for a check-in only when FAMILY_CHECKIN_CALLS is
 * on and that person agreed themselves, on a call they made. The sponsor's
 * say-so is not their consent: an AI voice is an "artificial voice" under the
 * TCPA (FCC declaratory ruling, Feb 2024), so the called person's prior
 * express consent is what counts. It is also what makes the call a gift
 * rather than a robocall.
 *
 * Consent is kept apart from the identity record, behind FamilyConsentStore
 * (the Firestore adapter is services/stores/family-call-consent-store.ts). No
 * store, no record or a failed read all mean no consent.
 *
 * @module services/family/family-call-consent
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { SponsoredIdentity } from '../identity/sponsored-identity.js';

const log = createLogger({ module: 'FamilyCallConsent' });

/** Where the yes was given. Only the family member's own call counts today. */
export type FamilyCallConsentSource = 'own_call';

export interface FamilyCallConsent {
  sponsoredIdentityId: string;
  consentedAt: string;
  source: FamilyCallConsentSource;
  /** Set when they said stop; a withdrawn record is no consent. */
  withdrawnAt?: string;
}

/** Port for consent records, keyed by sponsored identity id. */
export interface FamilyConsentStore {
  /** The record, or null when there is none or it can't be read. */
  get: (sponsoredIdentityId: string) => Promise<FamilyCallConsent | null>;
  /** Save the family member's own yes; false when not saved. */
  record: (
    sponsoredIdentityId: string,
    source: FamilyCallConsentSource,
    now: Date
  ) => Promise<boolean>;
  /** They said stop; false when not saved. */
  withdraw: (sponsoredIdentityId: string, now: Date) => Promise<boolean>;
}

/** True when scheduled family check-in calls may ring anyone at all. */
export function familyCheckinCallsOn(): boolean {
  const on = flagOn('FAMILY_CHECKIN_CALLS');
  if (!on) log.info('FAMILY_CHECKIN_CALLS is off, so no family check-in calls are placed');
  return on;
}

type IdentityForGate = Pick<SponsoredIdentity, 'sponsorUserId' | 'status'>;

/**
 * Why this check-in call must not ring, or null when it may. Checks the flag,
 * that the identity exists, belongs to the schedule's sponsor and is active,
 * and that the family member's own consent is on record and not withdrawn.
 */
export async function familyCallBlockReason(
  schedule: { sponsorUserId: string; sponsoredIdentityId: string },
  identity: IdentityForGate | null,
  store: FamilyConsentStore | undefined
): Promise<string | null> {
  if (!flagOn('FAMILY_CHECKIN_CALLS')) return 'Family check-in calls are off';
  if (!identity) return 'Sponsored identity not found';
  if (identity.sponsorUserId !== schedule.sponsorUserId) return 'Sponsor mismatch';
  if (identity.status !== 'active') return `Identity is ${identity.status}`;
  const consent = store ? await store.get(schedule.sponsoredIdentityId) : null;
  if (!consent?.consentedAt || consent.withdrawnAt) {
    log.info(
      { sponsoredIdentityId: schedule.sponsoredIdentityId, hasStore: !!store },
      'Check-in not placed: the family member has not agreed to calls'
    );
    return 'No consent from the family member';
  }
  return null;
}
