/**
 * Prod call 2026-10-17 (build c20c77407): the caller asked Nayan to call their
 * mom at 8:42 AM her time. The call-hours guard held it until 9:00 AM, and the
 * spoken reply was "Well, I'm placing the call now." Then, after a handoff,
 * Ferni went to call the same mom again and asked "Should I go ahead?".
 *
 * These run the real callOnBehalf tool, orchestrator, call-hours guard and
 * deferred-calls store (only Firestore and LiveKit are faked):
 * - a held call's result says nothing was dialed, and when it will be;
 * - a second call to the same number while the first waits sets up no other,
 *   neither from the tool nor from the confirm read-back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { uid: string; collection: string; id: string; data: Record<string, unknown> };
let docs: Doc[] = [];
/** bogle_users/{uid}/{collection}: doc(id).set() and where(field, '==', v).get(). */
const fakeDb = {
  collection: () => ({
    doc: (uid: string) => ({
      collection: (collection: string) => {
        const query = (filters: Array<[string, unknown]>) => ({
          where: (field: string, _op: string, value: unknown) =>
            query([...filters, [field, value]]),
          get: async () => {
            const found = docs.filter(
              (d) =>
                d.uid === uid &&
                d.collection === collection &&
                filters.every(([f, v]) => d.data[f] === v)
            );
            return { docs: found.map((d) => ({ id: d.id, data: () => d.data })) };
          },
        });
        return {
          ...query([]),
          doc: (id: string) => ({
            set: async (data: Record<string, unknown>) => {
              docs = docs.filter(
                (d) => !(d.uid === uid && d.collection === collection && d.id === id)
              );
              docs.push({ uid, collection, id, data: { ...data } });
            },
          }),
        };
      },
    }),
  }),
};
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../../../../services/outreach/user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/Denver' })),
}));
const createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = createSipParticipant;
  },
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [
    { id: 'c-mom', name: 'Mom', phone: '(303) 555-0100', relationship: 'mother' },
  ]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'k';
process.env.LIVEKIT_API_SECRET = 's';
process.env.SIP_TRUNK_ID = 'ST_test';

const { createCallOnBehalfTool } = await import('../call-on-behalf.js');
const { callConfirm } = await import('../call-confirm.js');
const { pendingCallTo } = await import('../../../../services/outreach/deferred-calls.js');

const AT_8_42_DENVER = new Date('2026-10-17T14:42:27Z'); // the prod call, 8:42 AM in Denver
const NINE_DENVER = '2026-10-17T15:00:00.000Z';
const pending = () => docs.filter((d) => d.collection === 'deferred_calls');

type Exec = { execute: (args: Record<string, unknown>) => Promise<string> };
const callMom = () =>
  (createCallOnBehalfTool({ userId: 'seth', sessionId: 's1' } as never) as unknown as Exec).execute(
    { contactQuery: 'my mom', purpose: 'say good morning', recordingConsent: false }
  );

beforeEach(() => {
  docs = [];
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT_8_42_DENVER);
  process.env.CALL_HOURS_GUARD = 'on';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALL_HOURS_GUARD;
});

describe('a call held for call hours', () => {
  it('says nothing was dialed and when the call will ring', async () => {
    const reply = await callMom();

    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(pending()).toHaveLength(1);
    expect(pending()[0].data).toMatchObject({ status: 'pending', scheduledFor: NINE_DENVER });
    expect(reply).toMatch(/^Nothing was dialed yet: /);
    expect(reply).toMatch(/later today at 9:00\sAM, Mom's time and yours/); // both in Denver
    expect(reply).not.toMatch(/\b(?:i'm calling|calling \w+ now|right now)\b/i);
  });
});

describe('a call to the same number while one waits', () => {
  it('the tool sets up no second call and says when the first rings', async () => {
    await callMom();
    const again = await callMom();

    expect(pending()).toHaveLength(1);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(again).toMatch(/^Nothing was dialed yet: a call to Mom is already set for later today/);
    expect(again).toMatch(/9:00\sAM, Mom's time and yours/);
  });

  it('the confirm read-back says it is already set instead of asking to call again', async () => {
    await callMom();
    const prepared = await callConfirm.prepare(
      { contactQuery: 'my mom', purpose: 'check in' },
      'seth',
      async () => undefined
    );
    expect(typeof prepared).toBe('string');
    expect(prepared).toMatch(/^Nothing was dialed yet: a call to Mom is already set/);
  });

  it('with nothing waiting, the read-back is offered as before', async () => {
    const prepared = await callConfirm.prepare(
      { contactQuery: 'my mom', purpose: 'check in' },
      'seth',
      async () => undefined
    );
    expect(prepared).toMatchObject({ readBack: expect.stringMatching(/^a call to Mom at /) });
  });
});

describe('pendingCallTo', () => {
  const row = (id: string, data: Record<string, unknown>) =>
    docs.push({ uid: 'seth', collection: 'deferred_calls', id, data });
  const onBehalf = (phone: string, extra: Record<string, unknown> = {}) => ({
    kind: 'on_behalf',
    request: { resolvedContact: { name: 'Mom', phone } },
    status: 'pending',
    scheduledFor: NINE_DENVER,
    timezone: 'America/Denver',
    ...extra,
  });

  it('matches the number however it is written', async () => {
    row('deferred_1', onBehalf('3035550100'));
    const found = await pendingCallTo('seth', '+1 (303) 555-0100');
    expect(found).toMatchObject({ id: 'deferred_1', timezone: 'America/Denver' });
    expect(found?.at.toISOString()).toBe(NINE_DENVER);
  });

  it('skips other numbers, other users, placed calls, calls to the user, and stale ones', async () => {
    row('other-number', onBehalf('3035550199'));
    row('placed', onBehalf('3035550100', { status: 'placed' }));
    row('proactive', { ...onBehalf('3035550100'), kind: 'proactive' });
    row('stale', onBehalf('3035550100', { scheduledFor: '2026-10-16T01:00:00.000Z' }));
    docs.push({
      uid: 'someone-else',
      collection: 'deferred_calls',
      id: 'x',
      data: onBehalf('3035550100'),
    });
    expect(await pendingCallTo('seth', '3035550100')).toBeUndefined();
  });

  it('a failed read finds nothing rather than blocking the call', async () => {
    const spy = vi.spyOn(fakeDb, 'collection').mockImplementation(() => {
      throw new Error('unavailable');
    });
    try {
      expect(await pendingCallTo('seth', '3035550100')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
