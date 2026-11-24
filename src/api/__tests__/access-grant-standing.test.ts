/**
 * DURABLE_ACCESS_GRANTS (#2264): which stored grants still admit once the waitlist gate is on,
 * and isAdmitted (the one admission check) honouring that, flag on and flag off.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  admittedEntryStands,
  approvalLapses,
  durableGrantsActive,
  subscriptionAdmits,
  waitlistStanding,
} from '../access-grant-standing.js';
import { forgetAdmissionCache, isAdmitted, type AdmissionStore } from '../admission.js';
import type { StoredSubscription, StoredWaitlistEntry } from '../access-grant-standing.js';

const GATE: NodeJS.ProcessEnv = { WAITLIST_GATE: 'on' };
const FLAG_ON: NodeJS.ProcessEnv = { ...GATE, DURABLE_ACCESS_GRANTS: 'on' };
const WHO = { uid: 'uid-0101', email: 'robin.example@example.test' };

/** One stored grant, read the way each flag state reads it. */
function store(grant: { entry?: StoredWaitlistEntry; sub?: StoredSubscription }): AdmissionStore {
  return {
    waitlistStatus: async () => grant.entry?.status as string | undefined,
    hasActiveSubscription: async () => grant.sub?.status === 'active',
    accountCreatedAt: async () => null,
    inCohort: async () => false,
    waitlistEntry: async () => grant.entry,
    subscriptions: async () => (grant.sub ? [grant.sub] : []),
  };
}

beforeEach(() => forgetAdmissionCache());

describe('grant standing', () => {
  it('a subscription from open access or admission lapses; admin and paid ones last; none recorded is legacy', () => {
    const active = (grantedVia?: string) => subscriptionAdmits({ status: 'active', grantedVia });
    expect(active('open-access')).toBe(false);
    expect(active('admission')).toBe(false);
    expect(active('waitlist-approval-auto')).toBe(false);
    expect(active('waitlist-approval')).toBe(true);
    expect(active()).toBe(true); // legacy
    expect(subscriptionAdmits({ status: 'canceled', grantedVia: 'waitlist-approval' })).toBe(false);
  });

  it('a waitlist approval from open access or admission lapses; admin approvals and wave seats last', () => {
    expect(waitlistStanding({ status: 'approved', source: 'open_access' })).toBe('lapsing');
    expect(waitlistStanding({ status: 'approved', source: 'admission' })).toBe('lapsing');
    expect(waitlistStanding({ status: 'approved', source: 'open_access', approvedBy: 'cli' })).toBe('lasting'); // prettier-ignore
    expect(waitlistStanding({ status: 'approved', approvedReason: 'beta tester' })).toBe('lasting');
    expect(waitlistStanding({ status: 'joined', source: 'admission' })).toBe('lasting');
    expect(waitlistStanding({ status: 'admitted' })).toBe('lasting');
    expect(waitlistStanding({ status: 'approved', source: 'landing' })).toBe('legacy');
  });

  it('only acts with the flag on and the gate on', () => {
    expect(durableGrantsActive(FLAG_ON)).toBe(true);
    expect(durableGrantsActive(GATE)).toBe(false);
    expect(durableGrantsActive({ DURABLE_ACCESS_GRANTS: 'on' } as NodeJS.ProcessEnv)).toBe(false);
    const lapsed = { status: 'approved', source: 'open_access' };
    expect(admittedEntryStands(lapsed, GATE)).toBe(true);
    expect(admittedEntryStands(lapsed, FLAG_ON)).toBe(false);
    expect(admittedEntryStands({ status: 'pending' }, GATE)).toBe(false);
  });

  it('an admin may re-approve a lapsing approval with the flag on, gate or no gate', () => {
    const lapsed = { status: 'approved', source: 'open_access' };
    expect(approvalLapses(lapsed, { DURABLE_ACCESS_GRANTS: 'on' } as NodeJS.ProcessEnv)).toBe(true);
    expect(approvalLapses(lapsed, {})).toBe(false);
    expect(approvalLapses({ ...lapsed, approvedBy: 'admin-api' }, FLAG_ON)).toBe(false);
  });
});

describe('isAdmitted with stored grants', () => {
  const openAccess = {
    entry: { status: 'approved', source: 'open_access' },
    sub: { status: 'active', grantedVia: 'open-access' },
  };

  it('flag off: an open-access grant keeps admitting once the gate is on (main)', async () => {
    expect(await isAdmitted(WHO, { env: GATE, store: store(openAccess) })).toEqual({ admitted: true, reason: 'waitlist-approved' }); // prettier-ignore
  });

  it('flag on: the same grant no longer admits by itself', async () => {
    expect(await isAdmitted(WHO, { env: FLAG_ON, store: store(openAccess) })).toEqual({ admitted: false, reason: 'not-admitted' }); // prettier-ignore
  });

  it('flag on: an admin approval and a legacy grant still admit', async () => {
    const admin = { entry: { status: 'approved', source: 'open_access', approvedBy: 'admin-api' } };
    expect(await isAdmitted(WHO, { env: FLAG_ON, store: store(admin) })).toEqual({ admitted: true, reason: 'waitlist-approved' }); // prettier-ignore
    forgetAdmissionCache();
    const legacy = { sub: { status: 'active' } };
    expect(await isAdmitted(WHO, { env: FLAG_ON, store: store(legacy) })).toEqual({ admitted: true, reason: 'active-account' }); // prettier-ignore
  });

  it('flag on: an inactive legacy subscription is not a grant', async () => {
    const lapsedPaid = { sub: { status: 'canceled' } };
    expect((await isAdmitted(WHO, { env: FLAG_ON, store: store(lapsedPaid) })).admitted).toBe(false); // prettier-ignore
  });
});
