/**
 * MINOR_CARE_SHARED_HOLD on the scheduled family check-in call (it dials Twilio itself): no call
 * for a sponsor, or to a family member's number, held by a call under 18. The real consent gate
 * (family-call-consent.ts) and caller run; only the LiveKit SDK, fetch (Twilio), the schedule
 * and identity stores and the hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../proactive-family-checkin.js', () => ({
  getDueSchedules: vi.fn(),
  getCheckinSchedule: vi.fn(),
  getRecentCallRecords: vi.fn(async () => []),
  createCallRecord: vi.fn(async () => ({ id: 'call-1' })),
  completeCallRecord: vi.fn(async () => {}),
}));
vi.mock('../../identity/sponsored-identity.js', () => ({
  getSponsoredIdentity: vi.fn(async () => ({ sponsorUserId: 'sponsor-uid', status: 'active' })),
}));
vi.mock('../../../intelligence/context-builders/family/family-wellbeing-context.js', () => ({
  buildFamilyCheckinContext: vi.fn(async () => ({ sponsorName: 'Sam', openingLine: 'Hi.' })),
  generateFamilyCheckinSystemPrompt: vi.fn(() => 'Check in.'),
}));

const { initiateCheckinCall } = await import('../family-checkin-caller.js');
const { phoneHoldId } = await import('../../outreach/checkin-replies.js');
const { setHoldStore, sharedHeld } = await import('../../outreach/minor-care-shared-hold.js');

const RAW = '(202) 555-0143'; // dialled as +12025550143
const DIALLED = '+12025550143';
const SPONSOR = 'sponsor-uid';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);
const fetchSpy = vi.fn(async (..._a: unknown[]) => new Response('{"sid":"CA1"}', { status: 201 }));
const twilioDials = () =>
  fetchSpy.mock.calls.filter(([u]) => new URL(String(u)).hostname === 'api.twilio.com').length;
const consent = {
  get: async () => ({ sponsoredIdentityId: 'fam-id', consentedAt: 'x', source: 'own_call' }),
  record: async () => true,
  withdraw: async () => true,
} as never;
const call = () =>
  initiateCheckinCall(
    {
      id: 'sched-1',
      sponsorUserId: SPONSOR,
      sponsoredIdentityId: 'fam-id',
      familyMemberName: 'Pat',
      relationship: 'father',
      phoneNumber: RAW,
      maxDurationMinutes: 10,
    } as never,
    consent
  );

beforeEach(() => {
  for (const [k, v] of Object.entries({
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    SIP_TRUNK_ID: '', // the Twilio path
    FAMILY_CHECKIN_CALLS: 'on',
    MINOR_CARE: 'on',
    MINOR_CARE_SHARED_HOLD: 'on',
    LOG_HASH_SECRET: 'test-secret',
  }))
    vi.stubEnv(k, v);
  vi.stubGlobal('fetch', fetchSpy);
  holds.clear();
  setHoldStore({ heldUntil: async (key) => holds.get(key), write: async () => undefined });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setHoldStore();
});

describe('a family check-in call', () => {
  it.each([
    ['the sponsor', () => SPONSOR],
    ['the number as dialled', () => phoneHoldId(DIALLED)], // keyed once LOG_HASH_SECRET is set
  ])('held by %s: not dialled', async (_name, key) => {
    holdFor(key());
    expect(await sharedHeld(key())).toBe(true);
    expect(await call()).toMatchObject({ success: false, error: 'Held' });
    expect(twilioDials()).toBe(0);
  });

  it('not held: dialled as before', async () => {
    expect(await sharedHeld(SPONSOR)).toBe(false);
    expect(await sharedHeld(phoneHoldId(DIALLED))).toBe(false);
    expect((await call()).success).toBe(true);
    expect(twilioDials()).toBe(1);
  });

  it('flag off: dialled as before, even with a hold on record', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    holdFor(SPONSOR);
    holdFor(phoneHoldId(DIALLED));
    expect(await sharedHeld(SPONSOR)).toBe(false);
    expect((await call()).success).toBe(true);
    expect(twilioDials()).toBe(1);
  });
});
