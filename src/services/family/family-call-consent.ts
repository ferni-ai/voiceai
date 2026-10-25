/**
 * A family member's yes to Ferni calling them.
 *
 * Ferni rings a family member for a check-in only when FAMILY_CHECKIN_CALLS is
 * on and that person's agreement is on record and not withdrawn. An AI voice
 * is an "artificial voice" under the TCPA (FCC declaratory ruling, Feb 2024),
 * so the called person's prior express consent is what counts. It may be
 * given on their own call to Ferni, or passed on by the sponsor, who confirms
 * that this person agreed (Seth's call, 2026-10-16, #1558). Either way they
 * can say stop at any time, and a withdrawn record is no consent.
 *
 * Consent is kept apart from the identity record, behind FamilyConsentStore
 * (the Firestore adapter is services/stores/family-call-consent-store.ts). No
 * store, no record or a failed read all mean no consent.
 *
 * @module services/family/family-call-consent
 */

import { flagOn } from '../../config/env-flag.js';
import { checkDialableNumber } from '../../utils/dialable-number.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { SponsoredIdentity } from '../identity/sponsored-identity.js';

const log = createLogger({ module: 'FamilyCallConsent' });

/** Where the yes came from: their own call, or the sponsor confirming they agreed. */
export type FamilyCallConsentSource = 'own_call' | 'sponsor_confirmed';

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
  /**
   * The shared do-not-call list (wired from services/outreach/call-retry by the
   * job). True when the number must not be rung, including when it can't be read.
   */
  isNumberOptedOut?: (phone: string) => Promise<boolean>;
}

/** True when scheduled family check-in calls may ring anyone at all. */
export function familyCheckinCallsOn(): boolean {
  const on = flagOn('FAMILY_CHECKIN_CALLS');
  if (!on) log.info('FAMILY_CHECKIN_CALLS is off, so no family check-in calls are placed');
  return on;
}

type IdentityForGate = Pick<SponsoredIdentity, 'sponsorUserId' | 'status'>;

/**
 * Sponsors whose family may be rung, from FAMILY_CHECKIN_SPONSORS (comma
 * separated user ids). Unset means every sponsor, so the first real calls can
 * be limited to one family before the feature opens to everyone.
 */
function sponsorAllowed(sponsorUserId: string): boolean {
  const list = process.env.FAMILY_CHECKIN_SPONSORS?.trim();
  if (!list) return true;
  return list.split(',').some((id) => id.trim() === sponsorUserId);
}

/**
 * Why this check-in call must not ring, or null when it may. Checks the flag,
 * the sponsor allowlist, that the identity exists, belongs to the schedule's sponsor and is active,
 * and that the family member's own consent is on record and not withdrawn.
 * With FAMILY_CHECKIN_STOP on, a number on the do-not-call list is refused too
 * (no list wired means no call). MINOR_CARE_SHARED_HOLD: a held sponsor or number is refused.
 */
export async function familyCallBlockReason(
  schedule: { sponsorUserId: string; sponsoredIdentityId: string; phoneNumber?: string },
  identity: IdentityForGate | null,
  store: FamilyConsentStore | undefined
): Promise<string | null> {
  if (!flagOn('FAMILY_CHECKIN_CALLS')) return 'Family check-in calls are off';
  if (!sponsorAllowed(schedule.sponsorUserId)) return 'Sponsor not in FAMILY_CHECKIN_SPONSORS';
  if (!identity) return 'Sponsored identity not found';
  if (identity.sponsorUserId !== schedule.sponsorUserId) return 'Sponsor mismatch';
  if (identity.status !== 'active') return `Identity is ${identity.status}`;
  // MINOR_CARE_SHARED_HOLD: not for a sponsor, or to a number, a call held under 18 (as dialled)
  const dialled = checkDialableNumber(schedule.phoneNumber ?? '');
  const { directSendHeld } = await import('../communication-service.js');
  const sponsor = { userId: schedule.sponsorUserId };
  if (await directSendHeld(dialled.ok ? dialled.e164 : '', 'call', sponsor)) return 'Held';
  if (flagOn('FAMILY_CHECKIN_STOP') && (await onDoNotCallList(schedule, store))) {
    log.info(
      { sponsoredIdentityId: schedule.sponsoredIdentityId },
      'Check-in not placed: the number is on the do-not-call list'
    );
    return 'Number is on the do-not-call list';
  }
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

async function onDoNotCallList(
  schedule: { sponsoredIdentityId: string; phoneNumber?: string },
  store: FamilyConsentStore | undefined
): Promise<boolean> {
  if (!store?.isNumberOptedOut || !schedule.phoneNumber) return true;
  try {
    return await store.isNumberOptedOut(schedule.phoneNumber);
  } catch (error) {
    log.warn(
      { sponsoredIdentityId: schedule.sponsoredIdentityId, error: String(error) },
      'Could not read the do-not-call list; not calling'
    );
    return true;
  }
}
