/**
 * A family check-in call rings only when FAMILY_CHECKIN_CALLS is on and the
 * family member's yes is on record (their own, or confirmed by the sponsor).
 * A schedule alone is not enough.
 * The Firestore adapter runs against an in-memory map; the job test mocks the
 * schedule store and counts dial attempts at the identity lookup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          docs.set(id, opts?.merge ? { ...docs.get(id), ...data } : data);
        },
      }),
    }),
  }),
}));
const getDueSchedules = vi.fn();
vi.mock('../proactive-family-checkin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../proactive-family-checkin.js')>()),
  getDueSchedules,
}));
const getSponsoredIdentity = vi.fn(async () => null);
vi.mock('../../identity/sponsored-identity.js', () => ({ getSponsoredIdentity }));

const { familyCallBlockReason } = await import('../family-call-consent.js');
const { createFamilyConsentStore } = await import('../../stores/family-call-consent-store.js');
const { runFamilyCheckinJob } = await import('../family-checkin-caller.js');

const schedule = { sponsorUserId: 'seth', sponsoredIdentityId: 'mom-id' };
const mom = { sponsorUserId: 'seth', status: 'active' as const };
const now = new Date('2026-10-16T20:00:00Z');
const store = createFamilyConsentStore();

beforeEach(() => {
  docs.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe('a family check-in call with FAMILY_CHECKIN_CALLS on', () => {
  beforeEach(() => vi.stubEnv('FAMILY_CHECKIN_CALLS', 'on'));

  it('does not ring when the family member never said yes', async () => {
    expect(await familyCallBlockReason(schedule, mom, store)).toBe(
      'No consent from the family member'
    );
  });

  it('rings once she agreed on her own call', async () => {
    expect(await store.record('mom-id', 'own_call', now)).toBe(true);
    expect(await familyCallBlockReason(schedule, mom, store)).toBeNull();
  });

  it('stops ringing when she says stop', async () => {
    await store.record('mom-id', 'own_call', now);
    expect(await store.withdraw('mom-id', now)).toBe(true);
    expect(await familyCallBlockReason(schedule, mom, store)).toBe(
      'No consent from the family member'
    );
  });

  it('rings when the sponsor confirmed she agreed', async () => {
    await store.record('mom-id', 'sponsor_confirmed', now);
    expect(await familyCallBlockReason(schedule, mom, store)).toBeNull();
  });

  it('does not ring a family outside FAMILY_CHECKIN_SPONSORS', async () => {
    vi.stubEnv('FAMILY_CHECKIN_SPONSORS', 'someone-else, another');
    await store.record('mom-id', 'sponsor_confirmed', now);
    expect(await familyCallBlockReason(schedule, mom, store)).toBe(
      'Sponsor not in FAMILY_CHECKIN_SPONSORS'
    );
  });

  it('rings a family whose sponsor is on FAMILY_CHECKIN_SPONSORS', async () => {
    vi.stubEnv('FAMILY_CHECKIN_SPONSORS', 'someone-else, seth');
    await store.record('mom-id', 'sponsor_confirmed', now);
    expect(await familyCallBlockReason(schedule, mom, store)).toBeNull();
  });

  it('rings again when she says yes after saying stop', async () => {
    await store.record('mom-id', 'own_call', now);
    await store.withdraw('mom-id', now);
    await store.record('mom-id', 'own_call', now);
    expect(await familyCallBlockReason(schedule, mom, store)).toBeNull();
  });

  it('does not ring with no consent store at all', async () => {
    await store.record('mom-id', 'own_call', now);
    expect(await familyCallBlockReason(schedule, mom, undefined)).toBe(
      'No consent from the family member'
    );
  });

  it('treats a malformed record as no consent', async () => {
    docs.set('mom-id', { consentedAt: 42 });
    expect(await familyCallBlockReason(schedule, mom, store)).toBe(
      'No consent from the family member'
    );
  });

  it('does not ring a missing, pending or someone else’s identity, even with consent', async () => {
    await store.record('mom-id', 'own_call', now);
    expect(await familyCallBlockReason(schedule, null, store)).toBe('Sponsored identity not found');
    expect(await familyCallBlockReason(schedule, { ...mom, status: 'pending' }, store)).toBe(
      'Identity is pending'
    );
    expect(await familyCallBlockReason(schedule, { ...mom, sponsorUserId: 'other' }, store)).toBe(
      'Sponsor mismatch'
    );
  });
});

describe('the do-not-call list in the gate', () => {
  const dialed = { ...schedule, phoneNumber: '+12125550100' };
  const listed = vi.fn(async (phone: string) => phone === '+12125550100');
  const withList = { ...store, isNumberOptedOut: listed };
  beforeEach(async () => {
    vi.stubEnv('FAMILY_CHECKIN_CALLS', 'on');
    await store.record('mom-id', 'sponsor_confirmed', now);
  });

  it('with FAMILY_CHECKIN_STOP on, refuses a number on the list even with consent', async () => {
    vi.stubEnv('FAMILY_CHECKIN_STOP', 'on');
    expect(await familyCallBlockReason(dialed, mom, withList)).toBe(
      'Number is on the do-not-call list'
    );
    expect(listed).toHaveBeenCalledWith('+12125550100');
  });

  it('with FAMILY_CHECKIN_STOP on, rings a number not on the list', async () => {
    vi.stubEnv('FAMILY_CHECKIN_STOP', 'on');
    const other = { ...dialed, phoneNumber: '+12125550199' };
    expect(await familyCallBlockReason(other, mom, withList)).toBeNull();
  });

  it('with FAMILY_CHECKIN_STOP on, no list wired or a failed read means no call', async () => {
    vi.stubEnv('FAMILY_CHECKIN_STOP', 'on');
    expect(await familyCallBlockReason(dialed, mom, store)).toBe(
      'Number is on the do-not-call list'
    );
    const broken = {
      ...store,
      isNumberOptedOut: vi.fn(async () => Promise.reject(new Error('x'))),
    };
    expect(await familyCallBlockReason(dialed, mom, broken)).toBe(
      'Number is on the do-not-call list'
    );
  });

  it('with FAMILY_CHECKIN_STOP off, the list is not consulted', async () => {
    expect(await familyCallBlockReason(dialed, mom, withList)).toBeNull();
    expect(listed).not.toHaveBeenCalled();
  });
});

describe('with FAMILY_CHECKIN_CALLS off (the default)', () => {
  it('does not ring even a family member who agreed', async () => {
    await store.record('mom-id', 'own_call', now);
    expect(await familyCallBlockReason(schedule, mom, store)).toBe('Family check-in calls are off');
  });

  it('the job looks at no schedules and dials nobody', async () => {
    getDueSchedules.mockResolvedValue([{ ...schedule, id: 's1', phoneNumber: '+12125550100' }]);
    const result = await runFamilyCheckinJob(store);
    expect(getDueSchedules).not.toHaveBeenCalled();
    expect(getSponsoredIdentity).not.toHaveBeenCalled();
    expect(result.callsInitiated).toBe(0);
  });

  it('with the flag on, the same job reaches the call path', async () => {
    vi.stubEnv('FAMILY_CHECKIN_CALLS', 'on');
    getDueSchedules.mockResolvedValue([{ ...schedule, id: 's1', phoneNumber: '+12125550100' }]);
    await runFamilyCheckinJob(store);
    expect(getSponsoredIdentity).toHaveBeenCalledWith('mom-id');
  });
});
