/**
 * The agent honours a family check-in only when its dispatch carries the
 * server's signature (the same gate as on-behalf calls), so the caller must
 * sign what it dispatches, or every real check-in would be refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createDispatch } = vi.hoisted(() => ({ createDispatch: vi.fn(async () => ({})) }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
  },
  AgentDispatchClient: class {
    createDispatch = createDispatch;
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
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
const { verifyOnBehalfDispatch } = await import('../../outreach/on-behalf-dispatch.js');

const ENV = {
  SIP_TRUNK_ID: 'ST_1',
  LIVEKIT_URL: 'wss://lk.test',
  LIVEKIT_API_KEY: 'key',
  LIVEKIT_API_SECRET: 'test-livekit-secret',
};
let prior: Record<string, string | undefined> = {};

describe('a family check-in dispatch', () => {
  beforeEach(() => {
    prior = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
    Object.assign(process.env, ENV);
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('is signed so the agent will honour it, and names the sponsor', async () => {
    const result = await initiateCheckinCall({
      id: 'sched-1',
      sponsorUserId: 'seth-uid',
      sponsoredIdentityId: 'doug-id',
      familyMemberName: 'Doug',
      relationship: 'father',
      phoneNumber: '8015550100',
      maxDurationMinutes: 10,
    } as never);
    expect(result.success).toBe(true);

    const raw = (createDispatch.mock.calls[0] as unknown[])[2] as { metadata: string };
    expect(verifyOnBehalfDispatch(raw.metadata, ENV.LIVEKIT_API_SECRET)).toBe(true);
    expect(JSON.parse(raw.metadata)).toMatchObject({
      type: 'family_checkin',
      sponsorName: 'Seth',
      sponsorUserId: 'seth-uid',
    });
  });
});
