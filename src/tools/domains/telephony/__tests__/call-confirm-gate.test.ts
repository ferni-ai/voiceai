/**
 * callOnBehalf / callAndConverse ring a real phone only after the caller's
 * spoken yes to a read-back of who, which number, and why.
 *
 * Before: the model could place a real call to any number it heard or made up
 * (no confirmation, no allowlist, a compliance check that always passed, and
 * test accounts dialed too).
 *
 * Drives the tool exactly as the live agent gets it: the telephony domain's
 * definitions registered into a ToolRegistry (register() applies the gate),
 * then the real tool, the real
 * on-behalf orchestrator and compliance check. Mocked only at the edges: the
 * LiveKit server SDK (SipClient is what rings a phone), fetch (the Twilio
 * fallback), and the contact / profile stores.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._args: unknown[]) => ({ participantId: 'PA_test' })),
  createRoom: vi.fn(async () => ({})),
  createDispatch: vi.fn(async () => ({})),
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
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [
    { id: 'c-lee', name: 'Dr. Lee', phone: '(801) 555-0163', relationship: 'doctor' },
  ]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { ToolRegistry } from '../../../registry/index.js';
import { gateOutboundTool, outboundDispatchRefusal } from '../../../registry/outbound-gate.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import {
  confirmedActionNote,
  outreachConfirmListeners,
} from '../../communication/outreach/outreach-confirm.js';
import { createCallOnBehalfTool } from '../call-on-behalf.js';
import { checkDialableNumber } from '../compliance.js';
import { getTelephonyToolDefinitions } from '../index.js';

const fetchSpy = vi.fn(async () => new Response('{}'));
const CALL_DR_LEE = { contactQuery: 'my doctor', purpose: 'reschedule my appointment' };

function registered(defs: ToolDefinition[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const def of defs) registry.register(def);
  return registry;
}

function liveCall(userId = 'user-1', registry = registered(getTelephonyToolDefinitions())) {
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    session,
    call: async (id: string, args: Record<string, unknown>, callId: string) => {
      const tool = registry.get(id)!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

const dials = () => sip.createSipParticipant.mock.calls.length + fetchSpy.mock.calls.length;

describe('calls on behalf wait for the caller', () => {
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reads back the number and never rings without a yes', async () => {
    const call = liveCall();
    const preview = await call.call('callOnBehalf', CALL_DR_LEE, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain('Dr. Lee at 801-555-0163');
    call.caller('hmm, what was that?');
    await call.call('callOnBehalf', CALL_DR_LEE, 'c2');
    expect(dials()).toBe(0);
    expect(sip.createRoom).not.toHaveBeenCalled();
  });

  it('a no cancels it', async () => {
    const call = liveCall();
    await call.call('callAndConverse', CALL_DR_LEE, 'c1');
    call.caller('no, wait');
    expect(await call.call('callAndConverse', CALL_DR_LEE, 'c2')).toContain('NOT SENT YET');
    expect(dials()).toBe(0);
  });

  it('with no live call (semantic router, chat) nothing rings', async () => {
    const tool = registered(getTelephonyToolDefinitions())
      .get('callOnBehalf')!
      .create({ userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' });
    const out = String(await tool.execute(CALL_DR_LEE, { toolCallId: 'x', ctx: {} }));
    expect(out).toMatch(/^Nothing was sent/);
    expect(dials()).toBe(0);
    expect(outboundDispatchRefusal('callOnBehalf', 'user-1')).toMatch(/^Nothing was sent/);
    expect(outboundDispatchRefusal('call_make', 'user-1')).toMatch(/^Nothing was sent/);
    expect(outboundDispatchRefusal('inviteFriendByCall', 'user-1')).toMatch(/^Nothing was sent/);
    expect(outboundDispatchRefusal('getWeather', 'user-1')).toBeNull();
  });

  it('a yes rings exactly the number read back, once', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DR_LEE, 'c1');
    call.caller('Yes, call her.');
    // The confirming call's own purpose is ignored: it dials and says what was read back.
    const placed = await call.call('callOnBehalf', { ...CALL_DR_LEE, purpose: 'chat' }, 'c2');
    expect(placed).toContain('calling Dr. Lee');
    expect(placed).toContain('to reschedule my appointment');
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550163');
    // A repeat is a new request: another read-back, not a second call.
    expect(await call.call('callOnBehalf', CALL_DR_LEE, 'c3')).toContain('NOT SENT YET');
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a test account never dials, even with the escape hatch off', async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const call = liveCall('voice-eval-sam');
    const out = await call.call('callOnBehalf', CALL_DR_LEE, 'c1');
    expect(out).toContain('test account');
    expect(dials()).toBe(0);
    expect(outboundDispatchRefusal('reachOut', 'voice-eval-sam')).toContain('test account');
  });

  it('never offers to dial emergency, premium-rate or malformed numbers', async () => {
    for (const phoneNumber of ['911', '1-900-555-0100', '12345']) {
      const out = await liveCall().call('callOnBehalf', { ...CALL_DR_LEE, phoneNumber }, 'c1');
      expect(out).toMatch(/^Nothing was dialed/);
    }
    expect(checkDialableNumber('(801) 555-0163')).toMatchObject({ ok: true, e164: '+18015550163' });
    expect(checkDialableNumber('+1 801 976 1234').ok).toBe(false);
    expect(checkDialableNumber('411').ok).toBe(false);
    expect(dials()).toBe(0);
  });

  it('the registry gates an outbound tool even if its domain did not', async () => {
    const raw: ToolDefinition = {
      id: 'callOnBehalf',
      name: 'Call On Behalf',
      description: 'raw, unwrapped',
      domain: 'telephony',
      create: (ctx) => createCallOnBehalfTool(ctx),
    };
    const out = await liveCall('user-1', registered([raw])).call('callOnBehalf', CALL_DR_LEE, 'c1');
    expect(out).toContain('NOT SENT YET');
    expect(dials()).toBe(0);
    const gatedOnce = gateOutboundTool(getTelephonyToolDefinitions()[2]);
    expect(gateOutboundTool(gatedOnce)).toBe(gatedOnce);
  });

  it('OUTBOUND_CONFIRM=off skips the read-back in tests only, never in production', async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1')).toContain('NOT SENT YET');
    expect(dials()).toBe(0);
    vi.stubEnv('NODE_ENV', 'test');
    expect(await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1')).toContain('calling Dr. Lee');
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
  });

  // Owner call 2026-10-18 (paraphrased, fictional number): four yeses and no call. The yes was
  // judged per tool and broken by a misheard name, so each confirming call read back again.
  describe('a yes confirms the call read back, whichever call tool places it', () => {
    const DAD = { contactQuery: 'my dad', phoneNumber: '801-555-0142', purpose: 'check in on him' };

    it('"Uh, go ahead, Fred." (a misheard name) confirms; callOnBehalf rings', async () => {
      const call = liveCall();
      expect(await call.call('callOnBehalf', DAD, 'c1')).toContain('NOT SENT YET');
      call.caller('Uh, go ahead, Fred.');
      expect(await call.call('callOnBehalf', DAD, 'c2')).not.toContain('NOT SENT YET');
      expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
      expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550142');
    });

    it("callAndConverse after callOnBehalf's read-back of the same number rings, once", async () => {
      const call = liveCall();
      await call.call('callOnBehalf', DAD, 'c1');
      call.caller('Yes, go ahead.');
      const placed = await call.call(
        'callAndConverse',
        { ...DAD, phoneNumber: '+1 (801) 555-0142' },
        'c2'
      );
      expect(placed).not.toContain('NOT SENT YET');
      expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
      expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550142');
      expect(await call.call('callOnBehalf', DAD, 'c3')).toContain('NOT SENT YET');
      expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    });

    it('the same person with no number given is the same call', async () => {
      const call = liveCall();
      await call.call('callOnBehalf', DAD, 'c1');
      call.caller('Yes.');
      await call.call('callAndConverse', { contactQuery: 'Dad', purpose: 'say hi' }, 'c2');
      expect(sip.createSipParticipant.mock.calls[0]?.[1]).toBe('+18015550142');
    });

    it('a different number after the yes is read back first, by either tool', async () => {
      const asked = async (tool: string): Promise<string> => {
        const call = liveCall();
        await call.call('callOnBehalf', DAD, 'c1');
        call.caller('Yes, go ahead.');
        return call.call(tool, { ...DAD, phoneNumber: '801-555-0177' }, 'c2');
      };
      for (const out of await Promise.all([asked('callOnBehalf'), asked('callAndConverse')])) {
        expect(out).toContain('NOT SENT YET');
        expect(out).toContain('801-555-0177');
      }
      expect(dials()).toBe(0);
    });

    it('a yes that adds someone, or a yes spoken over Ferni, rings nothing', async () => {
      const added = liveCall();
      await added.call('callOnBehalf', DAD, 'c1');
      added.caller('Go ahead, call Bob.');
      expect(await added.call('callAndConverse', DAD, 'c2')).toContain('NOT SENT YET');
      const over = liveCall();
      await over.call('callOnBehalf', DAD, 'c1');
      over.session.agentState = 'speaking';
      over.caller('Yes, go ahead.');
      over.session.agentState = 'listening';
      expect(await over.call('callAndConverse', DAD, 'c2')).toContain('NOT SENT YET');
      expect(dials()).toBe(0);
    });

    it('after the yes, the turn asks for the tool call; once it runs, the note is gone', async () => {
      const call = liveCall();
      await call.call('callOnBehalf', DAD, 'c1');
      expect(confirmedActionNote(call.session)).toBe('');
      call.caller('Yes.');
      const note = confirmedActionNote(call.session);
      expect(note).toContain('said yes to a call to my dad at');
      expect(note).toContain('Call callOnBehalf now');
      await call.call('callOnBehalf', DAD, 'c2');
      expect(confirmedActionNote(call.session)).toBe('');
    });
  });
});
