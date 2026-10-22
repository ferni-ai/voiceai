/**
 * CALL_USER_LIVE_AGENT, through the real port (call-user-adapter.ts) down to
 * the SDK edges: "Alex, call me" rings with Alex live on the line (a signed
 * LiveKit dispatch as alex, then a SIP dial to the verified phone), not
 * Twilio <Say> reading his message in Twilio's voice (prod 2026-10-22).
 * Flag off, no SIP, or a call the user didn't ask for: Twilio, as before.
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
const { scheduleProactiveCall } = await import('../conversational-calls.js');
const { verifyOnBehalfDispatch } = await import('../on-behalf-dispatch.js');

const PHONE = '+15555550123';
const lastCallId = (): string => [...calls.keys()].at(-1) ?? '';
const askAlex = () =>
  callUserAdapter.call({
    userId: 'seth-uid',
    phoneNumber: PHONE,
    message: 'Calling like you asked, about the trip.',
    personaId: 'alex',
  });

beforeEach(() => {
  calls.clear();
  dispatches.length = 0;
  dials.length = 0;
  phoneDoes = 'answer';
  twilioCreate.mockClear();
  Object.assign(process.env, ENV, { CALL_USER_LIVE_AGENT: 'on' });
});
afterEach(() => {
  for (const k of [...Object.keys(ENV), 'CALL_USER_LIVE_AGENT']) delete process.env[k];
});

describe('CALL_USER_LIVE_AGENT=on', () => {
  it('rings with Alex live on the line: a signed dispatch as alex, then a SIP dial; no Twilio', async () => {
    const result = await askAlex();

    expect(result).toMatchObject({ success: true, status: 'initiated' });
    expect(twilioCreate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(dials).toHaveLength(1));
    expect(dispatches).toHaveLength(1);
    expect(dials[0]).toEqual({ trunk: 'ST_test', phone: PHONE, room: dispatches[0].room });

    const metadata = JSON.parse(dispatches[0].metadata) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      type: 'proactive_outreach',
      userId: 'seth-uid',
      persona_id: 'alex',
      triggerType: 'promise',
      triggerReason: 'Calling like you asked, about the trip.',
    });
    const raw = dispatches[0].metadata;
    expect(verifyOnBehalfDispatch(raw, SECRET)).toBe(true);
    // The persona is signed: a dispatch rewritten to speak as someone else is refused.
    expect(verifyOnBehalfDispatch(raw.replace('"alex"', '"ferni"'), SECRET)).toBe(false);
  });

  it('records the outcome, and a call nobody answered is not rung again by the job', async () => {
    await askAlex();
    const answered = lastCallId();
    await vi.waitFor(() =>
      expect(calls.get(answered)).toMatchObject({
        status: 'completed',
        outcome: 'live_agent_answered',
      })
    );

    phoneDoes = 480;
    await askAlex();
    const missed = lastCallId();
    expect(missed).not.toBe(answered);
    await vi.waitFor(() =>
      expect(calls.get(missed)).toMatchObject({
        status: 'failed',
        outcome: 'live_agent_no_answer',
      })
    );
  });

  it('without a SIP trunk, falls back to the Twilio call it placed before', async () => {
    delete process.env.SIP_TRUNK_ID;
    await askAlex();
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(dispatches).toEqual([]);
  });

  it('leaves calls the user did not ask for (scripted outreach) on Twilio', async () => {
    await scheduleProactiveCall({
      userId: 'seth-uid',
      phoneNumber: PHONE,
      message: 'Weekly check-in.',
      ssml: '<speak>Weekly check-in.</speak>',
      personaId: 'ferni',
      reason: 'ceo_coaching',
    });
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(dispatches).toEqual([]);
  });
});

describe('CALL_USER_LIVE_AGENT off (the default)', () => {
  it('places the Twilio call, as before', async () => {
    delete process.env.CALL_USER_LIVE_AGENT;
    const result = await askAlex();
    expect(result).toMatchObject({ success: true, status: 'initiated' });
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(dispatches).toEqual([]);
    expect(dials).toEqual([]);
  });
});
