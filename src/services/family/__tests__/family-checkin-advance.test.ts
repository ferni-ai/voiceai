/**
 * A placed family check-in moves its schedule on at once. Over LiveKit SIP no
 * completion ever comes back, so a schedule left due was rung again by every
 * two-hourly job run. Mocked at the edges: the LiveKit SDK, identity, context
 * and the call-record writes; schedules live in an in-memory writer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckinScheduleWriter } from '../advance-checkin-schedule.js';

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
}));
vi.mock('../../identity/sponsored-identity.js', () => ({
  getSponsoredIdentity: vi.fn(async () => ({ sponsorUserId: 'seth-uid', displayName: 'Doug' })),
}));
vi.mock('../../../intelligence/context-builders/family/family-wellbeing-context.js', () => ({
  buildFamilyCheckinContext: vi.fn(async () => ({ sponsorName: 'Seth', openingLine: 'Hi Doug.' })),
  generateFamilyCheckinSystemPrompt: vi.fn(() => 'Check in on Doug.'),
}));

const { initiateCheckinCall } = await import('../family-checkin-caller.js');
const { advanceScheduleAfterDial } = await import('../advance-checkin-schedule.js');

const DUE = '2026-10-17T10:00:00.000Z';
const next = new Map<string, string>();
const store: CheckinScheduleWriter = {
  setNextCall: vi.fn(async (_uid: string, id: string, at: string) => (next.set(id, at), true)),
};
const schedule = {
  id: 'sched-1',
  sponsorUserId: 'seth-uid',
  sponsoredIdentityId: 'doug-id',
  familyMemberName: 'Doug',
  relationship: 'father',
  phoneNumber: '8015550100',
  frequency: 'daily',
  preferredTime: '10:00',
  timezone: 'America/Denver',
  maxDurationMinutes: 10,
  nextScheduledCall: DUE,
} as never;
const nextCall = () => next.get('sched-1');

describe('a placed family check-in', () => {
  beforeEach(() => {
    next.set('sched-1', DUE);
    for (const [k, v] of Object.entries({
      SIP_TRUNK_ID: 'ST_1',
      LIVEKIT_URL: 'wss://lk.test',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
    }))
      vi.stubEnv(k, v);
  });
  afterEach(() => {
    next.clear();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is no longer due once the SIP dial is accepted', async () => {
    expect(nextCall()).toBe(DUE);
    const before = Date.now();
    expect((await initiateCheckinCall(schedule, undefined, store)).success).toBe(true);
    expect(sip.createSipParticipant).toHaveBeenCalledOnce();
    expect(Date.parse(String(nextCall()))).toBeGreaterThan(before);
  });

  it('stays due when the dial fails, so the next run retries', async () => {
    sip.createSipParticipant.mockRejectedValueOnce(new Error('trunk down'));
    expect((await initiateCheckinCall(schedule, undefined, store)).success).toBe(false);
    expect(nextCall()).toBe(DUE);
  });

  it('stays due when nothing is dialled (test account)', async () => {
    const testAccount = { ...(schedule as object), sponsorUserId: 'voice-eval-sam' } as never;
    expect((await initiateCheckinCall(testAccount, undefined, store)).success).toBe(false);
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
    expect(nextCall()).toBe(DUE);
  });

  it('does not ring at all without a way to move the schedule on', async () => {
    const result = await initiateCheckinCall(schedule);
    expect(result).toMatchObject({ success: false, error: 'No schedule store' });
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
  });
});

describe('advanceScheduleAfterDial', () => {
  afterEach(() => next.clear());

  it('moves the slot to the next day at the preferred time in the family member zone', async () => {
    // 16:30Z is 10:30 in Denver, just after today's 10:00 slot
    const at = await advanceScheduleAfterDial(schedule, store, new Date('2026-10-17T16:30:00Z'));
    expect(at).toBe('2026-10-18T16:00:00.000Z');
    expect(nextCall()).toBe(at);
  });

  it('returns null, and does not throw, when the write is not saved', async () => {
    const failing: CheckinScheduleWriter = { setNextCall: async () => false };
    expect(await advanceScheduleAfterDial(schedule, failing, new Date())).toBeNull();
  });

  it('returns null, and does not throw, on schedule data it cannot read', async () => {
    vi.mocked(store.setNextCall).mockClear();
    const bad = { id: 'sched-1', sponsorUserId: 'seth-uid', frequency: 'daily' } as never;
    expect(await advanceScheduleAfterDial(bad, store, new Date())).toBeNull();
    expect(store.setNextCall).not.toHaveBeenCalled();
  });
});
