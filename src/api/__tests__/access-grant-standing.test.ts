/**
 * DURABLE_ACCESS_GRANTS (#2264): which stored grants still admit once the waitlist gate is on,
 * and isAdmitted (the one admission check) honouring that, flag on and flag off.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  APPROVAL_REASONS_SINCE,
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
const FUTURE = new Date('2099-01-01T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');
/** Paid plans as Stripe sync and the App Store write them (services/billing/paying-twice.ts). */
const STRIPE = { status: 'active', tier: 'partner', provider: 'stripe', stripeSubscriptionId: 'sub_0101' }; // prettier-ignore
const APPLE = { status: 'active', tier: 'friend', provider: 'apple', currentPeriodEnd: FUTURE };

/** One stored grant, read the way each flag state reads it. */
function store(grant: {
  entry?: StoredWaitlistEntry;
  sub?: StoredSubscription;
  account?: StoredSubscription; // bogle_users/{uid}.subscription, where Stripe and Apple write
}): AdmissionStore {
  return {
    waitlistStatus: async () => grant.entry?.status as string | undefined,
    hasActiveSubscription: async () => grant.sub?.status === 'active',
    accountCreatedAt: async () => null,
    inCohort: async () => false,
    waitlistEntry: async () => grant.entry,
    subscriptions: async () => (grant.sub ? [grant.sub] : []),
    accountSubscription: async () => grant.account,
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
    // paid: a live Stripe or App Store plan lasts whatever grantedVia says
    expect(subscriptionAdmits({ ...STRIPE, grantedVia: 'open-access' })).toBe(true);
    expect(subscriptionAdmits({ ...APPLE, grantedVia: 'open-access' })).toBe(true);
    expect(subscriptionAdmits({ ...STRIPE, status: 'canceled', grantedVia: 'open-access' })).toBe(false); // prettier-ignore
    expect(subscriptionAdmits({ ...APPLE, currentPeriodEnd: PAST, grantedVia: 'open-access' })).toBe(false); // prettier-ignore
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

  it('approvedVia decides, not source: a vote that relabels source cannot make an approval last', () => {
    const after = new Date(APPROVAL_REASONS_SINCE.getTime() + 86_400_000);
    const before = new Date(APPROVAL_REASONS_SINCE.getTime() - 86_400_000);
    expect(waitlistStanding({ status: 'approved', source: 'feature', approvedVia: 'open_access', approvedAt: after })).toBe('lapsing'); // prettier-ignore
    expect(waitlistStanding({ status: 'approved', source: 'feature', approvedVia: 'admission' })).toBe('lapsing'); // prettier-ignore
    expect(waitlistStanding({ status: 'approved', source: 'feature', approvedVia: 'admin' })).toBe('lasting'); // prettier-ignore
    expect(waitlistStanding({ status: 'approved', approvedVia: 'wave' })).toBe('lasting');
    // nothing recorded: legacy only before approvedVia was written, otherwise it lapses
    expect(waitlistStanding({ status: 'approved', source: 'feature', approvedAt: before })).toBe('legacy'); // prettier-ignore
    expect(waitlistStanding({ status: 'approved', source: 'feature', approvedAt: after })).toBe('lapsing'); // prettier-ignore
  });

  it('only acts with the flag on and the gate on', () => {
    expect(durableGrantsActive(FLAG_ON)).toBe(true);
    expect(durableGrantsActive(GATE)).toBe(false);
    expect(durableGrantsActive({ DURABLE_ACCESS_GRANTS: 'on' } as NodeJS.ProcessEnv)).toBe(false);
    const lapsed = { status: 'approved', source: 'open_access' };
    expect(admittedEntryStands(lapsed, undefined, GATE)).toBe(true);
    expect(admittedEntryStands(lapsed, undefined, FLAG_ON)).toBe(false);
    expect(admittedEntryStands({ status: 'pending' }, undefined, GATE)).toBe(false);
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

  it.each([
    ['an active Stripe plan', STRIPE],
    ['an active App Store entitlement', APPLE],
  ])('flag on: an open-access grant plus %s on the account is admitted', async (_, plan) => {
    const paying = { ...openAccess, account: plan };
    expect(await isAdmitted(WHO, { env: FLAG_ON, store: store(paying) })).toEqual({ admitted: true, reason: 'active-account' }); // prettier-ignore
    forgetAdmissionCache();
    const onProfile = { entry: openAccess.entry, sub: { ...plan, grantedVia: 'open-access' } };
    expect((await isAdmitted(WHO, { env: FLAG_ON, store: store(onProfile) })).admitted).toBe(true);
  });

  it.each([
    ['a cancelled Stripe plan', { ...STRIPE, status: 'canceled' }],
    ['an expired App Store entitlement', { ...APPLE, currentPeriodEnd: PAST }],
  ])('flag on: a lapsed grant plus %s is refused', async (_, plan) => {
    const ended = { ...openAccess, account: plan };
    expect(await isAdmitted(WHO, { env: FLAG_ON, store: store(ended) })).toEqual({ admitted: false, reason: 'not-admitted' }); // prettier-ignore
  });

  it('flag on: a free plan on the account is not a grant by itself', async () => {
    const free = { ...openAccess, account: { status: 'active', tier: 'free' } };
    expect((await isAdmitted(WHO, { env: FLAG_ON, store: store(free) })).admitted).toBe(false);
  });

  it('flag on: an inactive legacy subscription is not a grant', async () => {
    const lapsedPaid = { sub: { status: 'canceled' } };
    expect((await isAdmitted(WHO, { env: FLAG_ON, store: store(lapsedPaid) })).admitted).toBe(false); // prettier-ignore
  });
});
