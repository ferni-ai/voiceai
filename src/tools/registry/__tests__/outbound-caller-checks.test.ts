/**
 * A caller with no account (an anon: phone session) can't make Ferni call,
 * text or email anyone, and nobody is reached for a name from a persona's own
 * life (Ferni's friend Jim). The account owner's calls are unchanged.
 *
 * Drives callOnBehalf as the live agent gets it: the telephony definitions
 * registered into a ToolRegistry (register() applies the gates), the real tool
 * and on-behalf orchestrator. Mocked only at the edges: the LiveKit server SDK
 * (SipClient rings the phone), fetch (the Twilio fallback), and the contact
 * and profile stores. The owner check is not registered on these sessions
 * (outreachConfirmListeners without speakerIsOwner), the case where only these
 * checks stand between an anonymous caller and a ringing phone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._args: unknown[]) => ({ participantId: 'PA_test' })),
  createRoom: vi.fn(async () => ({})),
  createDispatch: vi.fn(async () => ({})),
}));
const contacts = vi.hoisted(() => ({
  saved: [] as Array<{ id: string; name: string; phone: string; relationship: string }>,
  searchContacts: vi.fn(),
  upsertContact: vi.fn(async () => undefined),
}));

vi.mock('livekit-server-sdk', () => ({
  SipClient: class {
    createSipParticipant = sip.createSipParticipant;
  },
  RoomServiceClient: class {
    createRoom = sip.createRoom;
  },
  AgentDispatchClient: class {
    createDispatch = sip.createDispatch;
  },
}));
vi.mock('../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: contacts.searchContacts,
  upsertContact: contacts.upsertContact,
}));
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { getTelephonyToolDefinitions } from '../../domains/telephony/index.js';
import { outreachConfirmListeners } from '../../domains/communication/outreach/outreach-confirm.js';
import { ToolRegistry } from '../index.js';
import { NO_ACCOUNT_REFUSAL, outboundDispatchRefusal } from '../outbound-gate.js';
import type { ToolContext } from '../types.js';

const fetchSpy = vi.fn(async () => new Response('{}'));
const dials = () => sip.createSipParticipant.mock.calls.length + fetchSpy.mock.calls.length;

function liveCall(userId: string) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    call: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('callOnBehalf')!.create(ctx);
      const opts = { ctx: { session, userData: { userId } }, toolCallId: callId };
      const out = await tool.execute(args, opts);
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

const RING_A_NUMBER = { contactQuery: 'my buddy', phoneNumber: '8015550142', purpose: 'say hi' };

describe('outbound tools check who is asking', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries({
      SIP_TRUNK_ID: 'ST_test',
      LIVEKIT_URL: 'wss://livekit.test',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_PHONE_NUMBER: '+15550000000',
      CALL_HOURS_GUARD: 'off',
      OUTBOUND_CONFIRM: '',
    }))
      vi.stubEnv(k, v);
    vi.stubGlobal('fetch', fetchSpy);
    contacts.saved = [];
    contacts.searchContacts.mockImplementation(async (_u: string, q: string) =>
      contacts.saved.filter((c) => q.toLowerCase().includes(c.name.toLowerCase()))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('an anonymous caller is refused: no read-back, no call on a yes, no contact saved', async () => {
    const call = liveCall('anon:4f1c');
    expect(await call.call(RING_A_NUMBER, 'c1')).toBe(NO_ACCOUNT_REFUSAL);
    call.caller('Yes, go ahead.');
    expect(await call.call(RING_A_NUMBER, 'c2')).toBe(NO_ACCOUNT_REFUSAL);
    expect(dials()).toBe(0);
    expect(contacts.upsertContact).not.toHaveBeenCalled();
    expect(contacts.searchContacts).not.toHaveBeenCalled();
  });

  it('a session with no user id is refused too', async () => {
    const call = liveCall('');
    expect(await call.call(RING_A_NUMBER, 'c1')).toBe(NO_ACCOUNT_REFUSAL);
    expect(dials()).toBe(0);
  });

  it('the account owner still gets the read-back, and the call on their yes', async () => {
    const call = liveCall('user-1');
    const preview = await call.call(RING_A_NUMBER, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain('801-555-0142');
    call.caller('Yes, go ahead.');
    await call.call(RING_A_NUMBER, 'c2');
    expect(dials()).toBe(1);
  });

  it("a name from Ferni's own life is refused when the owner has no number for it", async () => {
    const call = liveCall('user-1');
    const out = await call.call({ contactQuery: 'Jim', purpose: 'get him on the line' }, 'c1');
    expect(out).toContain('Jim is someone from my own life');
    expect(out).not.toContain('NOT SENT YET');
    call.caller('Yes.');
    await call.call({ contactQuery: 'Jim', purpose: 'get him on the line' }, 'c2');
    expect(dials()).toBe(0);
  });

  it("the owner's own Jim (saved, or given with a number) is reached as before", async () => {
    contacts.saved = [
      { id: 'c-jim', name: 'Jim', phone: '(801) 555-0163', relationship: 'friend' },
    ];
    const saved = await liveCall('user-1').call({ contactQuery: 'Jim', purpose: 'hi' }, 'c1');
    expect(saved).toContain('NOT SENT YET');
    expect(saved).toContain('801-555-0163');
    contacts.saved = [];
    const withNumber = await liveCall('user-1').call(
      { contactQuery: 'Jim', phoneNumber: '8015550199', purpose: 'hi' },
      'c1'
    );
    expect(withNumber).toContain('NOT SENT YET');
  });

  it('the executor path refuses an anonymous caller even with the confirm gate off', () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    expect(outboundDispatchRefusal('callOnBehalf', 'anon:4f1c')).toBe(NO_ACCOUNT_REFUSAL);
    expect(outboundDispatchRefusal('sendTextMessage', undefined)).toBe(NO_ACCOUNT_REFUSAL);
    expect(outboundDispatchRefusal('callOnBehalf', 'user-1')).toBeNull();
  });
});
