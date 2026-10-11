/**
 * CALL_HOURS_GUARD on the family check-in job: a check-in due at 11pm the
 * family member's time moves to 9:00 their time instead of ringing; one due
 * at 10am goes ahead. Flag off, nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../outreach/user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/New_York' })),
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const updateCheckinSchedule = vi.fn(async () => undefined);
const getDueSchedules = vi.fn();
vi.mock('../proactive-family-checkin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../proactive-family-checkin.js')>()),
  getDueSchedules,
  updateCheckinSchedule,
}));
// Reaching the identity lookup means the call path started.
const getSponsoredIdentity = vi.fn(async () => null);
vi.mock('../../identity/sponsored-identity.js', () => ({ getSponsoredIdentity }));

const { runFamilyCheckinJob } = await import('../family-checkin-caller.js');

const ELEVEN_PM_LA = new Date('2026-10-14T06:00:00Z'); // Tue 23:00 in Los Angeles
const TEN_AM_LA = new Date('2026-10-13T17:00:00Z'); // Tue 10:00 in Los Angeles
const schedule = {
  id: 'sch1',
  sponsorUserId: 'seth',
  sponsoredIdentityId: 'id1',
  familyMemberName: 'Doug',
  relationship: 'father',
  phoneNumber: '+12125550100', // a New York number, but Doug lives in Los Angeles
  timezone: 'America/Los_Angeles',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  getDueSchedules.mockResolvedValue([schedule]);
  process.env.CALL_HOURS_GUARD = 'on';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALL_HOURS_GUARD;
});

describe('family check-in job with CALL_HOURS_GUARD', () => {
  it('moves a check-in due at 11pm Doug’s time to 9:00 his time', async () => {
    vi.setSystemTime(ELEVEN_PM_LA);
    const result = await runFamilyCheckinJob();

    expect(updateCheckinSchedule).toHaveBeenCalledWith('seth', 'sch1', {
      nextScheduledCall: '2026-10-14T16:00:00.000Z', // Wed 09:00 in Los Angeles
    });
    expect(getSponsoredIdentity).not.toHaveBeenCalled();
    expect(result).toMatchObject({ callsSkipped: 1, callsFailed: 0 });
  });

  it('lets a check-in due at 10am go ahead', async () => {
    vi.setSystemTime(TEN_AM_LA);
    await runFamilyCheckinJob();
    expect(updateCheckinSchedule).not.toHaveBeenCalled();
    expect(getSponsoredIdentity).toHaveBeenCalledWith('id1');
  });

  it('with the flag off, calls even at 11pm', async () => {
    delete process.env.CALL_HOURS_GUARD;
    vi.setSystemTime(ELEVEN_PM_LA);
    await runFamilyCheckinJob();
    expect(updateCheckinSchedule).not.toHaveBeenCalled();
    expect(getSponsoredIdentity).toHaveBeenCalledWith('id1');
  });
});
