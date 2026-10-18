/**
 * OUTREACH_SERVER_CONFIRM: the caller's yes places the call read back, from the
 * server, once; sibling call tools share the read-back.
 *
 * Before (prod 2026-10-18, session-AJ_8skUJPtD63SG): the caller asked for a call
 * to their dad four times and nothing rang. #1938 now takes "Uh, go ahead, Fred."
 * as a yes and lets callAndConverse carry callOnBehalf's read-back, but a send
 * still waits on the model calling a tool after the yes, and after "Yes." it
 * said "I'm on it" with no tool call.
 *
 * Drives the telephony domain's definitions through a ToolRegistry (register()
 * applies the gate), the real on-behalf tool and orchestrator. Mocked only at the
 * edges: the LiveKit server SDK (SipClient rings a phone), fetch, the stores.
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
  searchContacts: vi.fn(async () => []),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { ToolRegistry } from '../../../registry/index.js';
import type { ToolDefinition } from '../../../registry/types.js';
import {
  CONFIRM_WINDOW_MS,
  outreachConfirmListeners,
} from '../../communication/outreach/outreach-confirm.js';
import {
  familyOf,
  isKin,
  SERVER_CONFIRM_SETTLE_MS,
  targetOf,
} from '../../communication/outreach/outreach-confirm-family.js';
import { getTelephonyToolDefinitions } from '../index.js';

const fetchSpy = vi.fn(async () => new Response('{}'));
// What the model passed at 14:03:25, and what it passed to callAndConverse after the yes.
const CALL_DAD = { contactQuery: 'my dad', phoneNumber: '801-555-0142', purpose: 'say hi' };
const CONVERSE_DAD = { contactQuery: 'Dad', phoneNumber: '8015550142', purpose: 'catch up' };

// A legacy call tool (Alex's set) that reports its own failure as { success: false }.
const makePhoneCall = vi.fn(async (..._a: unknown[]) => ({ success: true }) as object);
const makePhoneCallDef = {
  id: 'makePhoneCall',
  name: 'makePhoneCall',
  description: 'makePhoneCall',
  domain: 'communication',
  create: () => ({ execute: makePhoneCall }),
} as unknown as ToolDefinition;

function liveCall(userId = 'user-1') {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  registry.register(makePhoneCallDef);
  const session = { agentState: 'listening' };
  let owner = true;
  const notes: string[] = [];
  const listeners = outreachConfirmListeners(
    session,
    () => owner,
    (text) => notes.push(text)
  );
  return {
    notes,
    leaves: () => {
      owner = false;
    },
    /** The model calls a tool; its output then reaches the model (function_tools_executed). */
    call: async (id: string, args: Record<string, unknown>, callId: string) => {
      const tool = registry
        .get(id)!
        .create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' });
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

const dialed = () => sip.createSipParticipant.mock.calls.map((c) => c[1]);
/** The caller goes quiet; any send the server starts runs to its end. */
async function quiet(call: ReturnType<typeof liveCall>, sends: boolean) {
  await vi.advanceTimersByTimeAsync(SERVER_CONFIRM_SETTLE_MS);
  if (sends) await vi.waitFor(() => expect(call.notes.at(-1)).toContain('reported'));
}

describe('OUTREACH_SERVER_CONFIRM: the yes places the call', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
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
      OUTREACH_SERVER_CONFIRM: 'on',
    }))
      vi.stubEnv(k, v);
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("replays 10-18: 'Uh, go ahead, Fred.' rings dad once, and the sibling call doesn't ring again", async () => {
    const call = liveCall();
    expect(await call.call('callOnBehalf', CALL_DAD, 'c1')).toContain('NOT SENT YET');
    call.caller('Uh, go ahead, Fred.');
    await quiet(call, true);
    expect(dialed()).toEqual(['+18015550142']);
    expect(call.notes[0]).toContain('is going out now');
    expect(call.notes[1]).toContain("I'm calling my dad now to say hi");

    const again = await call.call('callAndConverse', CONVERSE_DAD, 'c2');
    expect(again).toMatch(/^Already placed: a call to my dad at 801-555-0142/);
    expect(await call.call('callOnBehalf', CALL_DAD, 'c3')).toMatch(/^Already placed/);
    expect(dialed()).toEqual(['+18015550142']);
  });

  it('flag off: the yes alone rings nothing; the model calling a tool places it (#1938)', async () => {
    vi.stubEnv('OUTREACH_SERVER_CONFIRM', 'off');
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    call.caller('Uh, go ahead, Fred.');
    await quiet(call, false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dialed()).toEqual([]);
    expect(call.notes).toEqual([]);
    expect(await call.call('callAndConverse', CONVERSE_DAD, 'c2')).toContain("I'm calling my dad");
    expect(dialed()).toEqual(['+18015550142']);
  });

  it('a sibling before the yes keeps the read-back, sends nothing, and the yes still rings', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    const repeat = await call.call('callAndConverse', CONVERSE_DAD, 'c2');
    expect(repeat).toContain('still waiting');
    expect(repeat).toContain('a call to my dad at 801-555-0142, to say hi');
    expect(dialed()).toEqual([]);
    call.caller('Yes, go ahead.');
    await quiet(call, true);
    expect(dialed()).toEqual(['+18015550142']);
  });

  it('a sibling for someone else replaces the read-back; the yes rings only the new number', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    const other = { contactQuery: 'my sister', phoneNumber: '801-555-0177', purpose: 'say hi' };
    expect(await call.call('callAndConverse', other, 'c2')).toContain('my sister at 801-555-0177');
    call.caller('Yes.');
    await quiet(call, true);
    expect(dialed()).toEqual(['+18015550177']);
  });

  it('a no, a question, another person, or a yes then a change sends nothing', async () => {
    for (const answer of [
      ['No, wait.'],
      ['Which number?'],
      ['Go ahead, call Bob instead.'],
      ['Yes.', 'Call Bob instead.'],
    ]) {
      const call = liveCall();
      await call.call('callOnBehalf', CALL_DAD, 'c1');
      for (const part of answer) call.caller(part);
      await quiet(call, false);
      expect(call.notes).toEqual([]);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(dialed()).toEqual([]);
  });

  it('an expired read-back, a speaker who is not the owner, or a test account sends nothing', async () => {
    const late = liveCall();
    await late.call('callOnBehalf', CALL_DAD, 'c1');
    await vi.advanceTimersByTimeAsync(CONFIRM_WINDOW_MS + 1);
    late.caller('Yes.');
    await quiet(late, false);

    const guest = liveCall();
    await guest.call('callOnBehalf', CALL_DAD, 'c1');
    guest.leaves();
    guest.caller('Yes.');
    await quiet(guest, false);

    const test = liveCall('voice-eval-sam');
    expect(await test.call('callOnBehalf', CALL_DAD, 'c1')).toContain('test account');
    test.caller('Yes.');
    await quiet(test, false);

    expect([...late.notes, ...guest.notes, ...test.notes]).toEqual([]);
    expect(dialed()).toEqual([]);
  });

  it('two yes finals in a row ring once', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    call.caller('Yes.');
    call.caller('Yes, go ahead.'); // one answer split across finals (#1862)
    await quiet(call, true);
    await quiet(call, false);
    expect(dialed()).toEqual(['+18015550142']);
  });

  it('a second yes after the call went out rings nothing more', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    call.caller('Yes.');
    await quiet(call, true);
    call.caller('Yes, go ahead.');
    await quiet(call, false);
    expect(dialed()).toEqual(['+18015550142']);
  });

  it('a call that fails to ring is not "placed": a true note, no retry, a fresh read-back', async () => {
    sip.createSipParticipant.mockImplementationOnce(async () => {
      throw new Error('SIP 503');
    });
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DAD, 'c1');
    call.caller('Yes.');
    await vi.advanceTimersByTimeAsync(SERVER_CONFIRM_SETTLE_MS);
    await vi.waitFor(() => expect(call.notes.at(-1)).toContain('did not go through'));
    expect(call.notes.at(-1)).toContain('ask if they want to try again');
    await vi.advanceTimersByTimeAsync(60_000);
    call.caller('Yes.');
    await quiet(call, false);
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1); // tried once, never retried alone

    const sibling = await call.call('callAndConverse', CONVERSE_DAD, 'c2');
    expect(sibling).not.toMatch(/^Already placed/);
    expect(sibling).toContain('NOT SENT YET');
  });

  it('a tool that reports { success: false } is not "placed" either', async () => {
    makePhoneCall.mockImplementationOnce(async () => ({ success: false, error: 'busy' }));
    const call = liveCall();
    const toMom = { contactName: 'Mom', phoneNumber: '801-555-0111' };
    await call.call('makePhoneCall', toMom, 'p1');
    call.caller('Yes.');
    await vi.advanceTimersByTimeAsync(SERVER_CONFIRM_SETTLE_MS);
    await vi.waitFor(() => expect(call.notes.at(-1)).toContain('did not go through'));
    expect(await call.call('makePhoneCall', toMom, 'p2')).toContain('NOT SENT YET');
    expect(makePhoneCall).toHaveBeenCalledTimes(1);
  });

  it('the model calling the tool and the server confirming together ring once, either order', async () => {
    const first = liveCall();
    await first.call('callOnBehalf', CALL_DAD, 'c1');
    first.caller('Yes.');
    const byModel = first.call('callAndConverse', CONVERSE_DAD, 'c2'); // before the yes settles
    await quiet(first, false);
    expect(await byModel).toContain("I'm calling my dad now");
    expect(first.notes).toEqual([]);

    const second = liveCall();
    await second.call('callOnBehalf', CALL_DAD, 'c1');
    second.caller('Yes.');
    await quiet(second, true);
    expect(await second.call('callOnBehalf', CALL_DAD, 'c2')).toMatch(/^Already placed/);

    expect(dialed()).toEqual(['+18015550142', '+18015550142']);
  });
});

describe('who counts as the same action', () => {
  it('calls and texts are separate families', () => {
    expect(familyOf('callOnBehalf', {})).toBe('call');
    expect(familyOf('callAndConverse', {})).toBe('call');
    expect(familyOf('sendTextMessage', {})).toBe('text');
    expect(familyOf('reachOut', { preferredChannel: 'text' })).toBe('text');
    expect(familyOf('reachOut', { preferredChannel: 'call' })).toBe('call');
    expect(familyOf('postToTwitter', {})).toBeUndefined();
    const dadByPhone = {
      toolId: 'callOnBehalf',
      family: 'call' as const,
      target: targetOf(CALL_DAD),
    };
    const textDad = targetOf({ contactName: 'Dad', contactPhone: '(801) 555-0142' });
    expect(isKin(dadByPhone, 'callAndConverse', 'call', targetOf(CONVERSE_DAD))).toBe(true);
    expect(isKin(dadByPhone, 'sendTextMessage', 'text', textDad)).toBe(false);
  });

  it('two numbers decide; a name decides only without one', () => {
    const dad = { toolId: 'callOnBehalf', family: 'call' as const, target: targetOf(CALL_DAD) };
    const newNumber = targetOf({ contactQuery: 'my dad', phoneNumber: '801-555-0999' });
    expect(isKin(dad, 'callAndConverse', 'call', newNumber)).toBe(false);
    expect(isKin(dad, 'callAndConverse', 'call', targetOf({ contactQuery: 'My Dad' }))).toBe(true);
    expect(isKin(dad, 'callAndConverse', 'call', targetOf({ contactQuery: 'Bob' }))).toBe(false);
  });
});
