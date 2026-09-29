/**
 * "Ferni, call my mom" — end to end through the real API handler, call
 * service and orchestrator, with only the network edges faked
 * (LiveKit server SDK, auth, contacts store, LLM enrichment).
 *
 * Proves: POST /api/outbound-call/initiate → LiveKit room (persona metadata)
 * → voice agent dispatch (on_behalf_call, persona, contact) → SIP dial-out to
 * the contact's E.164 number; and the guard rails (auth, ownership, rate
 * limit, no dial when the agent can't be dispatched).
 */
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const livekit = vi.hoisted(() => ({
  createRoom: vi.fn(),
  createDispatch: vi.fn(),
  createSipParticipant: vi.fn(),
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = livekit.createRoom;
  },
  AgentDispatchClient: class {
    createDispatch = livekit.createDispatch;
  },
  SipClient: class {
    createSipParticipant = livekit.createSipParticipant;
  },
}));

const auth = vi.hoisted(() => ({ user: null as null | { userId: string; isAdmin: boolean; email?: string } }));
vi.mock('../../../api/auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/auth-middleware.js')>();
  const deny = (res: ServerResponse) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'auth required' }));
    return null;
  };
  return {
    ...actual,
    requireAuth: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => auth.user ?? deny(res)),
    requireAdmin: vi.fn(async (_req: IncomingMessage, res: ServerResponse) =>
      auth.user?.isAdmin ? auth.user : deny(res)
    ),
  };
});

const MOM = { id: 'c-mom', name: 'Mom', phone: '(555) 123-4567', relationship: 'family' };
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  getContact: vi.fn(async (userId: string, id: string) => (userId === 'alice' && id === MOM.id ? MOM : null)),
  searchContacts: vi.fn(async (userId: string, q: string) =>
    userId === 'alice' && /mom/i.test(q) ? [MOM] : []
  ),
}));

vi.mock('../message-enrichment.js', () => ({
  enrichMessage: vi.fn(async (ctx: { originalMessage: string }) => ({
    message: ctx.originalMessage,
    metadata: { enrichmentType: 'none' },
  })),
  enrichVoicemailMessage: vi.fn(),
}));

process.env.LIVEKIT_URL = 'wss://livekit.test';
process.env.LIVEKIT_API_KEY = 'k';
process.env.LIVEKIT_API_SECRET = 's';
process.env.SIP_TRUNK_ID = 'ST_trunk';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'tok';
process.env.TWILIO_PHONE_NUMBER = '+15550000000';

const { handleOutboundCallRoutes } = await import('../../../api/outbound-call-handler.js');

function call(body: unknown, method = 'POST', path = '/api/outbound-call/initiate') {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method,
    url: path,
    headers: { 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
  let status = 0;
  let payload = '';
  const res = {
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(data?: string) {
      payload = data ?? '';
    },
  } as unknown as ServerResponse;
  return handleOutboundCallRoutes(req, res, path).then(() => ({
    status,
    body: payload ? JSON.parse(payload) : undefined,
  }));
}

describe('two-way outbound call: "call my mom"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    livekit.createRoom.mockResolvedValue({});
    livekit.createDispatch.mockResolvedValue({});
    livekit.createSipParticipant.mockResolvedValue({ participantId: 'PA_phone' });
  });

  it('places a real two-way call to the user\'s own contact with the chosen persona', async () => {
    auth.user = { userId: 'alice', isAdmin: false };
    const res = await call({ contactName: 'mom', purpose: 'see how her appointment went', personaId: 'maya-santos' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, mode: 'conversation', contact: { name: 'Mom' } });
    expect(res.body.callId).toMatch(/^onbehalf_/);

    // 1. Room carries the persona for the agent
    const [roomArgs] = livekit.createRoom.mock.calls[0];
    expect(roomArgs.name).toBe(`onbehalf-${res.body.callId}`);
    expect(JSON.parse(roomArgs.metadata)).toMatchObject({ type: 'on_behalf_call', persona_id: 'maya-santos', userId: 'alice' });

    // 2. The voice agent is dispatched with the call context
    const [room, agentName, opts] = livekit.createDispatch.mock.calls[0];
    expect(room).toBe(roomArgs.name);
    expect(agentName).toBe('voice-agent');
    const meta = JSON.parse(opts.metadata);
    expect(meta).toMatchObject({
      type: 'on_behalf_call',
      persona_id: 'maya-santos',
      userId: 'alice',
      contact: { name: 'Mom', phone: MOM.phone, relationship: 'family' },
      purpose: 'see how her appointment went',
    });
    expect(meta.script).toContain('Maya');

    // 3. LiveKit SIP dials mom's number into the same room
    expect(livekit.createSipParticipant).toHaveBeenCalledWith(
      'ST_trunk',
      '+15551234567',
      roomArgs.name,
      expect.objectContaining({ participantName: 'Mom', playDialtone: false })
    );
  });

  it('refuses without a verified user', async () => {
    auth.user = null;
    expect((await call({ contactName: 'mom', purpose: 'hi' })).status).toBe(401);
    expect(livekit.createSipParticipant).not.toHaveBeenCalled();
  });

  it('only calls contacts the user owns; raw numbers are admin-only', async () => {
    auth.user = { userId: 'mallory', isAdmin: false };
    expect((await call({ contactId: MOM.id, purpose: 'hi' })).status).toBe(404);
    expect((await call({ phone: '+15559999999', purpose: 'hi' })).status).toBe(404);
    expect(livekit.createSipParticipant).not.toHaveBeenCalled();
  });

  it('never dials when the voice agent cannot join (no dead-air calls)', async () => {
    auth.user = { userId: 'alice', isAdmin: false };
    livekit.createDispatch.mockRejectedValueOnce(new Error('no workers'));
    const res = await call({ contactId: MOM.id, purpose: 'hi' });
    expect(res.status).toBe(502);
    expect(livekit.createSipParticipant).not.toHaveBeenCalled();
  });

  it('rate-limits calls per user', async () => {
    auth.user = { userId: 'alice-rate', isAdmin: true };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await call({ phone: '+15551112222', purpose: 'hi' })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it('lets the caller check the status of their own call only', async () => {
    auth.user = { userId: 'alice', isAdmin: false };
    const placed = await call({ contactId: MOM.id, purpose: 'hi' });
    const own = await call({}, 'GET', `/api/outbound-call/${placed.body.callId}`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ callId: placed.body.callId, status: 'ringing', contact: 'Mom' });

    auth.user = { userId: 'mallory', isAdmin: false };
    expect((await call({}, 'GET', `/api/outbound-call/${placed.body.callId}`)).status).toBe(404);
  });
});
