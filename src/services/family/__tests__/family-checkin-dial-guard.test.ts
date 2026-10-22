/**
 * A scheduled family check-in rings a real phone (LiveKit SIP, else Twilio).
 * It never rings for a test account, and never an emergency, premium-rate or
 * malformed number. Mocked at the edges: the LiveKit SDK, fetch (Twilio) and
 * the schedule / identity stores.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._a: unknown[]) => ({ participantId: 'PA_1' })),
}));
// The consent gate has its own tests; here the family member has said yes.
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
  buildFamilyCheckinContext: vi.fn(async () => ({
    sponsorName: 'Seth',
    openingLine: "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you.",
  })),
  generateFamilyCheckinSystemPrompt: vi.fn(() => 'Check in on Doug.'),
}));

const { initiateCheckinCall } = await import('../family-checkin-caller.js');

const fetchSpy = vi.fn(async () => new Response('{}'));
const schedule = (sponsorUserId: string, phoneNumber: string) =>
  ({
    id: 'sched-1',
    sponsorUserId,
    sponsoredIdentityId: 'doug-id',
    familyMemberName: 'Doug',
    relationship: 'father',
    phoneNumber,
    maxDurationMinutes: 10,
  }) as never;

describe('a family check-in call', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({
      SIP_TRUNK_ID: 'ST_1',
      LIVEKIT_URL: 'wss://lk.test',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
    }))
      vi.stubEnv(k, v);
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never rings for a test account', async () => {
    const result = await initiateCheckinCall(schedule('voice-eval-sam', '8015550100'));
    expect(result).toMatchObject({ success: false, error: 'Test account' });
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never dials an emergency, premium-rate or malformed number', async () => {
    for (const phoneNumber of ['911', '1-900-555-0100', '555']) {
      expect((await initiateCheckinCall(schedule('seth-uid', phoneNumber))).success).toBe(false);
    }
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dials a real number for a real sponsor (control)', async () => {
    expect((await initiateCheckinCall(schedule('seth-uid', '8015550100'))).success).toBe(true);
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550100');
  });

  it('rings long enough for voicemail to answer, and caps the call at its length', async () => {
    await initiateCheckinCall(schedule('seth-uid', '8015550100'));
    // A missed call with no message on 2026-10-18: the trunk default gave up first
    expect(sip.createSipParticipant.mock.calls[0][3]).toMatchObject({
      ringingTimeout: 45,
      maxCallDuration: 10 * 60,
    });
  });
});
