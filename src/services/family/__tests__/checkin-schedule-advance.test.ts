/**
 * A check-in slot rings at most once. Over LiveKit SIP nothing reports the
 * call's end, so the schedule moves to its next slot as soon as Ferni dials;
 * before this, a SIP check-in stayed due and rang again every scheduler run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateCheckinSchedule = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}));
const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._a: unknown[]) => ({ participantId: 'PA_1' })),
}));
vi.mock('../family-call-consent.js', () => ({
  familyCheckinCallsOn: () => true,
  familyCallBlockReason: async () => null,
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = sip.createSipParticipant;
  },
}));
vi.mock('../proactive-family-checkin.js', () => ({
  getDueSchedules: vi.fn(),
  getCheckinSchedule: vi.fn(),
  getRecentCallRecords: vi.fn(async () => []),
  createCallRecord: vi.fn(async () => ({ id: 'call-1' })),
  completeCallRecord: vi.fn(async () => {}),
  updateCheckinSchedule,
}));
vi.mock('../../identity/sponsored-identity.js', () => ({
  getSponsoredIdentity: vi.fn(async () => ({ sponsorUserId: 'seth-uid', displayName: 'Mom' })),
}));
vi.mock('../../../intelligence/context-builders/family/family-wellbeing-context.js', () => ({
  buildFamilyCheckinContext: vi.fn(async () => ({ sponsorName: 'Seth', openingLine: 'Hi.' })),
  generateFamilyCheckinSystemPrompt: vi.fn(() => 'Check in.'),
}));

const { initiateCheckinCall } = await import('../family-checkin-caller.js');
const { advanceScheduleAfterDial } = await import('../checkin-schedule-advance.js');

const schedule = {
  id: 'sched-1',
  sponsorUserId: 'seth-uid',
  sponsoredIdentityId: 'mom-id',
  familyMemberName: 'Mom',
  relationship: 'mother',
  phoneNumber: '8015550100',
  maxDurationMinutes: 10,
  frequency: 'daily',
  preferredTime: '18:00',
  timezone: 'America/Los_Angeles',
} as never;

beforeEach(() => {
  for (const [k, v] of Object.entries({
    SIP_TRUNK_ID: 'ST_1',
    LIVEKIT_URL: 'wss://lk.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
  }))
    vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('a family check-in over SIP', () => {
  it('moves the schedule to its next slot once the dial goes out', async () => {
    expect((await initiateCheckinCall(schedule)).success).toBe(true);
    expect(updateCheckinSchedule).toHaveBeenCalledWith('seth-uid', 'sched-1', {
      nextScheduledCall: expect.any(String),
    });
  });

  it('leaves the schedule alone when the dial fails', async () => {
    sip.createSipParticipant.mockRejectedValueOnce(new Error('trunk down'));
    expect((await initiateCheckinCall(schedule)).success).toBe(false);
    expect(updateCheckinSchedule).not.toHaveBeenCalled();
  });
});

describe('advanceScheduleAfterDial', () => {
  it('sets the next call on the family member’s clock', async () => {
    // 2026-10-17 15:00 UTC is 08:00 in Los Angeles; next is Oct 18 at 18:00 PDT.
    await advanceScheduleAfterDial(schedule, new Date('2026-10-17T15:00:00Z'));
    expect(updateCheckinSchedule).toHaveBeenCalledWith('seth-uid', 'sched-1', {
      nextScheduledCall: '2026-10-19T01:00:00.000Z',
    });
  });

  it('does not throw when the update fails', async () => {
    updateCheckinSchedule.mockRejectedValueOnce(new Error('firestore down'));
    await expect(advanceScheduleAfterDial(schedule)).resolves.toBeUndefined();
  });
});
