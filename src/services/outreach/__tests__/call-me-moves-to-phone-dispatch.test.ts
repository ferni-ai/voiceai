/**
 * CALL_ME_MOVES_TO_PHONE through the real port (call-user-adapter.ts) down to
 * the SDK edges: a "call me" from an app call names that call's conversation
 * in the signed dispatch (an id: no conversation text goes into LiveKit's
 * dispatch metadata), and hands the live dial back so
 * the app call can end once the phone is answered. A request without a
 * hand-over (the flag off) dispatches and returns exactly what it did before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** scheduled_calls rows by call id: the set, then the status updates. */
const calls = new Map<string, Record<string, unknown>>();
const fakeDb = {
  collection: () => ({
    doc: () => ({
      collection: () => ({
        doc: (id: string) => ({
          set: async (d: Record<string, unknown>) => void calls.set(id, { ...d }),
        }),
      }),
    }),
  }),
  collectionGroup: () => ({
    where: (_field: string, _op: string, id: string) => ({
      limit: () => ({
        get: async () => {
          if (!calls.has(id)) return { empty: true, docs: [] };
          const update = async (u: Record<string, unknown>) =>
            void calls.set(id, { ...calls.get(id), ...u });
          return { empty: false, docs: [{ ref: { update } }] };
        },
      }),
    }),
  }),
};
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb }));
vi.mock('../quiet-hours.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callQuietHours: async () => ({ quiet: false }),
}));
vi.mock('../../identity/firebase-auth.js', () => ({ getFirebaseUser: vi.fn() }));
/** The account's verified phone, as userReach reads it (Firestore + Firebase Auth). */
let verifiedPhone: string | undefined = '+15555550123';
vi.mock('../user-reach.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  userReach: vi.fn(async () =>
    verifiedPhone ? { phone: verifiedPhone } : { reason: 'no_verified_phone' }
  ),
}));

const twilioCreate = vi.fn(async () => ({ sid: 'CA_twilio' }));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: twilioCreate } }) }));

const dispatches: Array<{ room: string; agent: string; metadata: string }> = [];
const dials: Array<{ trunk: string; phone: string; room: string }> = [];
/** What the phone does: answer, or a SIP status that ends the call. */
let phoneDoes: 'answer' | number = 'answer';
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    async createRoom() {}
  },
  AgentDispatchClient: class {
    async createDispatch(room: string, agent: string, opts: { metadata: string }) {
      dispatches.push({ room, agent, metadata: opts.metadata });
    }
  },
  SipClient: class {
    async createSipParticipant(trunk: string, phone: string, room: string) {
      dials.push({ trunk, phone, room });
      if (phoneDoes !== 'answer') {
        throw Object.assign(new Error('twirp error unknown: INVITE failed'), {
          metadata: { sip_status_code: String(phoneDoes) },
        });
      }
    }
  },
}));

const SECRET = 'dispatch-secret';
const ENV: Record<string, string> = {
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'k',
  LIVEKIT_API_SECRET: 's',
  SIP_TRUNK_ID: 'ST_test',
  DISPATCH_SIGNING_SECRET: SECRET,
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_PHONE_NUMBER: '+15555550100',
};

const { callUserAdapter } = await import('../call-user-adapter.js');
const { verifyOnBehalfDispatch } = await import('../on-behalf-dispatch.js');

const PHONE = '+15555550123';
const CONVERSATION = 'conv_1761234567890_abc123';
const ask = (handover?: { conversationId?: string }) =>
  callUserAdapter.call({
    userId: 'seth-uid',
    phoneNumber: PHONE,
    message: 'Calling like you asked.',
    personaId: 'ferni',
    ...(handover && { handover }),
  });

beforeEach(() => {
  calls.clear();
  dispatches.length = 0;
  dials.length = 0;
  phoneDoes = 'answer';
  verifiedPhone = PHONE;
  twilioCreate.mockClear();
  Object.assign(process.env, ENV, { CALL_USER_LIVE_AGENT: 'on' });
});
afterEach(() => {
  for (const k of [...Object.keys(ENV), 'CALL_USER_LIVE_AGENT']) delete process.env[k];
});

describe('a "call me" that moves to the phone', () => {
  it('signs the app call reference into the dispatch and hands back a dial that settles on the answer', async () => {
    const result = await ask({ conversationId: CONVERSATION });
    expect(result).toMatchObject({ success: true, live: true });
    expect(await result.dial).toBe('answered');

    const raw = dispatches[0].metadata;
    expect(JSON.parse(raw)).toMatchObject({
      type: 'proactive_outreach',
      userId: 'seth-uid',
      movedFrom: CONVERSATION,
    });
    expect(verifyOnBehalfDispatch(raw, SECRET)).toBe(true);
    // The reference is signed: a dispatch pointing at another conversation is refused.
    expect(verifyOnBehalfDispatch(raw.replace(CONVERSATION, 'conv_other'), SECRET)).toBe(false);
  });

  it('two moves placed at once each keep their own reference and dial (no per-user slot)', async () => {
    const asking = (conversationId: string) =>
      callUserAdapter.call({
        userId: 'seth-uid',
        phoneNumber: PHONE,
        message: 'Calling like you asked.',
        personaId: 'ferni',
        handover: { conversationId },
      });
    const [one, two] = await Promise.all([asking('conv_one'), asking('conv_two')]);
    expect(one.dial).toBeDefined();
    expect(two.dial).toBeDefined();
    expect(one.dial).not.toBe(two.dial);
    await vi.waitFor(() => expect(dispatches).toHaveLength(2));
    const movedFrom = dispatches.map(
      (d) => (JSON.parse(d.metadata) as { movedFrom?: string }).movedFrom
    );
    expect(movedFrom.sort()).toEqual(['conv_one', 'conv_two']);
  });

  it('a dial nobody answers comes back as no_answer, not as a call that happened', async () => {
    phoneDoes = 480;
    const result = await ask({ conversationId: CONVERSATION });
    expect(await result.dial).toBe('no_answer');
  });

  it('a dial LiveKit refuses (no such trunk) comes back failed', async () => {
    phoneDoes = 404;
    const result = await ask({});
    expect(await result.dial).toBe('failed');
    expect(JSON.parse(dispatches[0].metadata)).not.toHaveProperty('movedFrom');
  });

  it('without SIP it falls back to Twilio with no dial: callUser keeps its usual reply', async () => {
    delete process.env.SIP_TRUNK_ID;
    const result = await ask({ conversationId: CONVERSATION });
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(result.dial).toBeUndefined();
    // and the reference never waits around for a later call
    process.env.SIP_TRUNK_ID = ENV.SIP_TRUNK_ID;
    await ask();
    await vi.waitFor(() => expect(dispatches).toHaveLength(1));
    expect(JSON.parse(dispatches[0].metadata)).not.toHaveProperty('movedFrom');
  });

  it('without a hand-over (the flag off): no reference in the dispatch and no dial back, as before', async () => {
    const result = await ask();
    expect(result).toMatchObject({ success: true, status: 'initiated', live: true });
    expect(result).not.toHaveProperty('dial');
    await vi.waitFor(() => expect(dispatches).toHaveLength(1));
    expect(JSON.parse(dispatches[0].metadata)).not.toHaveProperty('movedFrom');
  });
});
