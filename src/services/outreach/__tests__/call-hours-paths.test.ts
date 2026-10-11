/**
 * CALL_HOURS_GUARD on the real call paths: an on-behalf call asked for at
 * 11pm the recipient's time waits for 9:00 and is then placed by the job; a
 * proactive call to the user at 11pm their time waits too. At 10am each goes
 * straight out. Flag off, nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const docs: Record<string, Record<string, unknown>> = {};
const db = () => {
  const base = fakeFirestore(rows);
  return {
    ...base,
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...base.collection().doc(id),
        get: async () => ({ exists: !!docs[`${name}/${id}`], data: () => docs[`${name}/${id}`] }),
      }),
    }),
  };
};
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db() }));
const contactInfo = vi.fn(async (_id: string) => ({ timezone: 'America/New_York' }));
vi.mock('../user-contact.js', () => ({ getUserContactInfo: contactInfo }));

const createRoom = vi.fn(async () => ({}));
const createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = createRoom;
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = createSipParticipant;
  },
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => config },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => []),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServicesSync: () => null }));

process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'k';
process.env.LIVEKIT_API_SECRET = 's';
process.env.SIP_TRUNK_ID = 'ST_test';

const { createCallOnBehalfTool } =
  await import('../../../tools/domains/telephony/call-on-behalf.js');
const { executeDueDeferredCalls } = await import('../deferred-calls.js');
const { scheduleProactiveCall } = await import('../conversational-calls.js');

const ELEVEN_PM_LA = new Date('2026-10-14T06:00:00Z'); // Tue 23:00 in Los Angeles
const TEN_AM_LA = new Date('2026-10-13T17:00:00Z'); // Tue 10:00 in Los Angeles
const NINE_AM_LA_NEXT = '2026-10-14T16:00:00.000Z'; // Wed 09:00 in Los Angeles
const deferred = () => rows.filter((r) => r.collection === 'deferred_calls');

const tool = createCallOnBehalfTool({ userId: 'seth', sessionId: 's1' } as never) as unknown as {
  execute: (p: Record<string, unknown>) => Promise<string>;
};
const callDad = () =>
  tool.execute({
    contactQuery: 'Dad',
    phoneNumber: '213-555-0100', // Los Angeles area code
    purpose: 'wish him happy birthday',
    recordingConsent: false,
  });

beforeEach(() => {
  rows = [];
  for (const k of Object.keys(docs)) delete docs[k];
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  process.env.CALL_HOURS_GUARD = 'on';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALL_HOURS_GUARD;
});

describe('on-behalf call', () => {
  it('at 11pm the recipient’s time: waits, tells the user when, then the job places it', async () => {
    vi.setSystemTime(ELEVEN_PM_LA);
    const reply = await callDad();

    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(reply).toBe(
      "It's not a good hour to call Dad right now, so I'll call tomorrow at 9:00 AM their time to wish him happy birthday."
    );
    expect(deferred()).toHaveLength(1);
    expect(deferred()[0].data).toMatchObject({
      kind: 'on_behalf',
      status: 'pending',
      scheduledFor: NINE_AM_LA_NEXT,
      timezone: 'America/Los_Angeles',
      timezoneSource: 'area_code',
    });

    // Not yet due at 8:59.
    vi.setSystemTime(new Date('2026-10-14T15:59:00Z'));
    expect(await executeDueDeferredCalls()).toMatchObject({ due: 0, placed: 0 });

    vi.setSystemTime(new Date('2026-10-14T16:01:00Z'));
    expect(await executeDueDeferredCalls()).toMatchObject({ due: 1, placed: 1 });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(createSipParticipant.mock.calls[0]).toContain('+12135550100');
    expect(deferred()[0].data.status).toBe('placed');
  });

  it('at 10am the recipient’s time: calls now', async () => {
    vi.setSystemTime(TEN_AM_LA);
    const reply = await callDad();
    expect(reply).toMatch(/^Got it! I'm calling Dad now/);
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(deferred()).toHaveLength(0);
  });

  it('with the flag off, calls even at 11pm', async () => {
    delete process.env.CALL_HOURS_GUARD;
    vi.setSystemTime(ELEVEN_PM_LA);
    expect(await callDad()).toMatch(/^Got it! I'm calling Dad now/);
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
  });
});

describe('proactive call to the user', () => {
  const request = {
    userId: 'u1',
    phoneNumber: '+12125550100',
    message: 'Thinking of you',
    ssml: '<speak>Thinking of you</speak>',
    personaId: 'ferni',
    reason: 'thinking_of_you',
  };
  const placed = () => rows.filter((r) => r.collection === 'scheduled_calls');

  it('at 11pm in the user’s own time zone, waits for 9:00 there', async () => {
    contactInfo.mockImplementation(async (id) => ({
      timezone: id === 'u1' ? 'America/Los_Angeles' : 'America/New_York',
    }));
    vi.setSystemTime(ELEVEN_PM_LA);
    const result = await scheduleProactiveCall(request);

    expect(result).toMatchObject({ success: true, status: 'scheduled' });
    expect(placed()).toHaveLength(0);
    expect(deferred()[0].data).toMatchObject({
      kind: 'proactive',
      scheduledFor: NINE_AM_LA_NEXT,
      timezoneSource: 'stored',
    });
  });

  it('at 10am goes ahead', async () => {
    contactInfo.mockResolvedValue({ timezone: 'America/Los_Angeles' });
    vi.setSystemTime(TEN_AM_LA);
    await scheduleProactiveCall(request);
    expect(deferred()).toHaveLength(0);
    expect(placed()).toHaveLength(1);
  });
});
