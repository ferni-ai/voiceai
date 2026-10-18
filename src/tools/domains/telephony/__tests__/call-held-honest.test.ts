/**
 * Prod call 2026-10-17 (build c20c77407): the caller asked Nayan to call their
 * mom at 8:42 AM her time. The call-hours guard held it until 9:00 AM, and the
 * spoken reply was "Well, I'm placing the call now."
 *
 * These run the real callOnBehalf tool, orchestrator, call-hours guard and
 * deferred-calls store (only Firestore and LiveKit are faked): a held call's
 * result says nothing was dialed, and when it will be.
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
    expect(reply).toMatch(/later today at 9:00\sAM their time/);
    expect(reply).not.toMatch(/\b(?:i'm calling|calling \w+ now|right now)\b/i);
  });
});
