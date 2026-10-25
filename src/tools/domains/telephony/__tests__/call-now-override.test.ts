/**
 * The owner's "call now" (CALL_NOW_OWNER_OVERRIDE) and the held call's two clocks.
 *
 * Prod call 2026-10-24 (phone-calls audit rows 3 and 4): asked to call his mom
 * at 8:43 AM her time, the call was held to 9:00 AM "their time"; the model
 * turned that into "nine our time, ten for her" (it was 11 his time), and
 * "she's an early riser, call now" got "it's already set".
 *
 * These run the real callOnBehalf tool, its confirm read-back, the orchestrator,
 * the call-hours guard and the deferred-calls store (Firestore and LiveKit faked).
 * A call that rings reaches LiveKit's createSipParticipant; a held one doesn't.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { uid: string; collection: string; id: string; data: Record<string, unknown> };
let docs: Doc[] = [];
/** Runs once right after the next query read: the deferred-calls job claiming a call in between. */
let afterNextRead: (() => void) | undefined;
type Ref = { get: () => Promise<{ data: () => unknown }>; update: (p: object) => Promise<void> };
/**
 * bogle_users/{uid}/{collection}: doc(id).set/get/update, where(field, '==', v).get(),
 * and runTransaction over get/update, like Firestore's.
 */
const fakeDb = {
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({ get: (ref: Ref) => ref.get(), update: (ref: Ref, patch: object) => ref.update(patch) }),
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
            const result = { docs: found.map((d) => ({ id: d.id, data: () => d.data })) };
            afterNextRead?.();
            afterNextRead = undefined;
            return result;
          },
        });
        return {
          ...query([]),
          doc: (id: string) => ({
            get: async () => {
              const found = docs.find(
                (d) => d.uid === uid && d.collection === collection && d.id === id
              );
              return { data: () => found?.data };
            },
            update: async (patch: Record<string, unknown>) => {
              const found = docs.find(
                (d) => d.uid === uid && d.collection === collection && d.id === id
              );
              if (!found) throw new Error(`NOT_FOUND: ${collection}/${id}`);
              Object.assign(found.data, patch);
            },
            set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
              const old = docs.find(
                (d) => d.uid === uid && d.collection === collection && d.id === id
              );
              docs = docs.filter((d) => d !== old);
              const merged = opts?.merge ? { ...old?.data, ...data } : { ...data };
              docs.push({ uid, collection, id, data: merged });
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
// The requester's saved zone: New York. Mom's number (303) is Denver, the dentist's (602) Phoenix.
const getUserContactInfo = vi.hoisted(() =>
  vi.fn(async (): Promise<{ timezone?: string }> => ({ timezone: 'America/New_York' }))
);
vi.mock('../../../../services/outreach/user-contact.js', () => ({ getUserContactInfo }));
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
const CONTACTS: Record<string, Record<string, string>> = {
  'my mom': { id: 'c-mom', name: 'Mom', phone: '(303) 555-0100', relationship: 'mother' },
  'my dentist': { id: 'c-dds', name: 'Dentist', phone: '(303) 555-0142', relationship: 'dentist' },
  'my aunt': { id: 'c-aunt', name: 'Aunt Jo', phone: '(602) 555-0100', relationship: 'aunt' },
};
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_uid: string, query: string) =>
    CONTACTS[query] ? [CONTACTS[query]] : []
  ),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'k';
process.env.LIVEKIT_API_SECRET = 's';
process.env.SIP_TRUNK_ID = 'ST_test';

const { createCallOnBehalfTool } = await import('../call-on-behalf.js');
const { callConfirm } = await import('../call-confirm.js');
const { isFamilyCallee, isCallNowOverrideOn } =
  await import('../../../../services/outreach/call-now-override.js');

const AT_8_43_DENVER = new Date('2026-10-24T14:43:00Z'); // the prod call: 10:43 AM in New York
const AT_11_30_PM_DENVER = new Date('2026-10-25T05:30:00Z');
const held = () =>
  docs.filter((d) => d.collection === 'deferred_calls' && d.data.status === 'pending');

type Exec = { execute: (args: Record<string, unknown>) => Promise<unknown> };
const call = (contactQuery: string, extra: Record<string, unknown> = {}) =>
  (createCallOnBehalfTool({ userId: 'u1', sessionId: 's1' } as never) as unknown as Exec).execute({
    contactQuery,
    purpose: 'ask about dinner plans',
    recordingConsent: false,
    ...extra,
  }) as Promise<string>;

beforeEach(() => {
  docs = [];
  afterNextRead = undefined;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT_8_43_DENVER);
  vi.stubEnv('CALL_HOURS_GUARD', 'on');
  vi.stubEnv('CALL_NOW_OWNER_OVERRIDE', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('call now, before 9 AM where Mom is', () => {
  it('flag off: held as before, whatever the caller asked', async () => {
    vi.stubEnv('CALL_NOW_OWNER_OVERRIDE', 'off');
    const reply = await call('my mom', { callNow: true });
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(held()).toHaveLength(1);
    expect(reply).toMatch(/^Nothing was dialed yet: /);
  });

  it('flag on, family, callNow: rings now and nothing is held', async () => {
    expect(held()).toHaveLength(0);
    const reply = await call('my mom', { callNow: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(held()).toHaveLength(0);
    expect(reply).toMatch(/^Got it! I'm calling Mom now/);
  });

  it('flag on, family, but no callNow: held', async () => {
    await call('my mom');
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(held()).toHaveLength(1);
  });

  it('flag on, callNow to someone not family: held', async () => {
    const reply = await call('my dentist', { callNow: true });
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(held()).toHaveLength(1);
    expect(reply).toMatch(/^Nothing was dialed yet: /);
  });
});

describe('call now, late at night where Mom is (11:30 PM)', () => {
  beforeEach(() => vi.setSystemTime(AT_11_30_PM_DENVER));

  it('held, and the reply asks for one more yes; then lateConfirmed rings and replaces it', async () => {
    const first = await call('my mom', { callNow: true });
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(held()).toHaveLength(1);
    expect(held()[0].data.request).not.toHaveProperty('callNow');
    expect(first).toMatch(/^Nothing was dialed yet: it's 11:30\sPM where Mom is/);
    expect(first).toMatch(/callNow and lateConfirmed/);
    const heldId = held()[0].id;

    // The second yes: the read-back skips "already set", then the call rings.
    const args = { contactQuery: 'my mom', purpose: 'ask about dinner plans', callNow: true };
    const prepared = await callConfirm.prepare(
      { ...args, lateConfirmed: true },
      'u1',
      async () => undefined
    );
    expect(prepared).toMatchObject({ readBack: expect.stringMatching(/, right now, /) });
    const second = await call('my mom', { callNow: true, lateConfirmed: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(second).toMatch(/^Got it! I'm calling Mom now/);
    expect(held()).toHaveLength(0);
    expect(docs.find((d) => d.id === heldId)?.data.status).toBe('superseded');
  });
});

describe('the 10-24 replay: "she\'s an early riser, call now" after the call was held', () => {
  it('flag on: the read-back offers to call right now, and the held call is replaced', async () => {
    await call('my mom');
    expect(held()).toHaveLength(1);
    const prepared = await callConfirm.prepare(
      { contactQuery: 'my mom', purpose: 'ask about dinner plans', callNow: true },
      'u1',
      async () => undefined
    );
    expect(prepared).toMatchObject({
      readBack: expect.stringMatching(/^a call to Mom at .+, right now, to ask about dinner/),
    });
    await call('my mom', { callNow: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(held()).toHaveLength(0);
  });

  it('flag off: "already set", as before', async () => {
    vi.stubEnv('CALL_NOW_OWNER_OVERRIDE', 'off');
    await call('my mom');
    const prepared = await callConfirm.prepare(
      { contactQuery: 'my mom', purpose: 'ask about dinner plans', callNow: true },
      'u1',
      async () => undefined
    );
    expect(prepared).toMatch(/^Nothing was dialed yet: a call to Mom is already set/);
  });
});

describe('both clocks on a held call', () => {
  it('the prod call: 9:00 AM her time is 11:00 AM his, worked out in code', async () => {
    const reply = await call('my mom');
    expect(reply).toMatch(/later today at 9:00\sAM Mom's time, 11:00\sAM yours, to ask/);
    expect(reply).toMatch(/say them as written/);
  });

  it('the US DST edge: Phoenix has none, so New York is 11, not 12, after the change', async () => {
    // 10 PM Saturday in Phoenix, 1 AM Sunday Nov 1 in New York (still EDT, UTC-4).
    vi.setSystemTime(new Date('2026-11-01T05:00:00Z'));
    const reply = await call('my aunt');
    // 9 AM Phoenix = 16:00Z; New York is on EST (UTC-5) by then: 11:00 AM, not 12:00 PM.
    expect(reply).toMatch(/tomorrow at 9:00\sAM Aunt Jo's time, later today at 11:00\sAM yours/);
  });

  it("a call already set says both clocks too, from the held call's stored zone", async () => {
    await call('my mom');
    const again = await call('my mom');
    expect(again).toMatch(
      /^Nothing was dialed yet: a call to Mom is already set for later today at 9:00\sAM Mom's time, 11:00\sAM yours/
    );
  });

  it("the requester's zone unknown: their time only, as before (never a default zone)", async () => {
    getUserContactInfo.mockResolvedValue({});
    const reply = await call('my mom');
    expect(reply).toMatch(/later today at 9:00\sAM their time to ask/);
    expect(reply).not.toMatch(/yours/);
  });
});

describe('call now replaces exactly one held call, and never rings twice', () => {
  const heldRow = (uid: string, id: string, phone: string) =>
    docs.push({
      uid,
      collection: 'deferred_calls',
      id,
      data: {
        kind: 'on_behalf',
        status: 'pending',
        scheduledFor: '2026-10-24T15:00:00.000Z',
        timezone: 'America/Denver',
        request: { contactQuery: 'my mom', resolvedContact: { name: 'Mom', phone } },
      },
    });
  const status = (uid: string, id: string) =>
    docs.find((d) => d.uid === uid && d.id === id)?.data.status;

  it("only this requester's call to this number: Mom's other number and another requester's stay pending", async () => {
    heldRow('u1', 'same', '+13035550100');
    heldRow('u1', 'mom-cell', '+13035550111'); // the same person, a second number
    heldRow('u2', 'other-requester', '+13035550100'); // someone else's call to the same number
    await call('my mom', { callNow: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(status('u1', 'same')).toBe('superseded');
    expect(status('u1', 'mom-cell')).toBe('pending');
    expect(status('u2', 'other-requester')).toBe('pending');
  });

  it('the job claims the held call between the read and the dial: exactly one ring, ours not dialed', async () => {
    heldRow('u1', 'same', '+13035550100');
    // The job claims it (pending -> placing) right after placeOrHold reads the pending calls,
    // and dials it: that ring is the job's.
    afterNextRead = () => {
      const row = docs.find((d) => d.id === 'same');
      if (row) row.data.status = 'placing';
      void createSipParticipant();
    };
    const reply = await call('my mom', { callNow: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1); // the job's ring only
    expect(status('u1', 'same')).toBe('placing');
    expect(reply).toMatch(/^Nothing new was dialed: the call to Mom .* already being placed/);
  });
});

describe('call now after the job already took the held call', () => {
  const MIN = 60_000;
  const takenRow = (uid: string, status: 'placing' | 'placed', minutesAgo: number) => {
    const at = new Date(AT_8_43_DENVER.getTime() - minutesAgo * MIN).toISOString();
    docs.push({
      uid,
      collection: 'deferred_calls',
      id: `${uid}-${status}`,
      data: {
        kind: 'on_behalf',
        status,
        ...(status === 'placing' ? { claimedAt: at } : { placedAt: at }),
        scheduledFor: at,
        timezone: 'America/Denver',
        request: {
          contactQuery: 'my mom',
          resolvedContact: { name: 'Mom', phone: '+13035550100' },
        },
      },
    });
  };

  it("the job claimed it (placing) before call-now read: exactly one ring, the job's", async () => {
    takenRow('u1', 'placing', 0.5);
    void createSipParticipant(); // the job's dial of the call it claimed
    const reply = await call('my mom', { callNow: true });
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/^Nothing new was dialed: the call to Mom .* already being placed/);
    expect(held()).toHaveLength(0);
  });

  it('placed 2 minutes ago: nothing new dialed; placed 10 minutes ago: a new call rings', async () => {
    takenRow('u1', 'placed', 2);
    expect(await call('my mom', { callNow: true })).toMatch(/^Nothing new was dialed/);
    expect(createSipParticipant).not.toHaveBeenCalled();

    docs = [];
    takenRow('u1', 'placed', 10);
    expect(await call('my mom', { callNow: true })).toMatch(/^Got it! I'm calling Mom now/);
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
  });

  it("another requester's call to this number, or this requester's to another number, doesn't stop it", async () => {
    takenRow('u2', 'placing', 0.5);
    takenRow('u1', 'placing', 0.5);
    const mine = docs.find((d) => d.uid === 'u1')!;
    (mine.data.request as { resolvedContact: { phone: string } }).resolvedContact.phone =
      '+13035550111'; // Mom's other number
    expect(await call('my mom', { callNow: true })).toMatch(/^Got it! I'm calling Mom now/);
    expect(createSipParticipant).toHaveBeenCalledTimes(1);
  });

  it('flag off: unchanged (no call-now, so the check never runs)', async () => {
    vi.stubEnv('CALL_NOW_OWNER_OVERRIDE', 'off');
    takenRow('u1', 'placing', 0.5);
    await call('my mom', { callNow: true });
    expect(held()).toHaveLength(1); // held for 9 AM as before
    expect(createSipParticipant).not.toHaveBeenCalled();
  });
});

describe('CALL_NOW_OWNER_OVERRIDE default', () => {
  it('is off with no env set', () => {
    expect(isCallNowOverrideOn({})).toBe(false);
    expect(isCallNowOverrideOn({ CALL_NOW_OWNER_OVERRIDE: 'on' })).toBe(true);
  });
});

describe('isFamilyCallee', () => {
  const as = (contactQuery: string, relationship?: string) =>
    isFamilyCallee({ contactQuery, resolvedContact: { name: 'X', phone: '1', relationship } });
  it('by relationship or by asking for them as family; never a family word inside another', () => {
    expect(as('Pat', 'mother')).toBe(true);
    expect(as('Pat', 'family')).toBe(true);
    expect(as('Pat', 'Mother-in-law')).toBe(true);
    expect(as('my sister')).toBe(true);
    expect(as("my mom's doctor", 'doctor')).toBe(false);
    expect(as('Mason', 'person')).toBe(false);
    expect(as('Pat', 'friend')).toBe(false);
  });
});
