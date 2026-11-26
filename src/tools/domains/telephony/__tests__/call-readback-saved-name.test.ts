/**
 * CALL_READBACK_SAVED_NAME_ONLY: a call to a saved contact is read back by who and why, never
 * digit by digit. Owner decision 2026-11-26: "call my mom" got Mom's whole number recited back,
 * and no human assistant does that. A number the owner gave keeps the full read-back, so a
 * misheard digit is caught before anything rings; the yes always dials exactly the stored number.
 *
 * Drives the telephony definitions through a ToolRegistry (register() applies the gate), the real
 * callOnBehalf tool, call-confirm and the consent window, as call-confirm-gate.test.ts does.
 * Mocked only at the edges: LiveKit (SipClient rings a phone), fetch, the contact stores, and the
 * two consent models (stubbed, so only the vetoes decide).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._args: unknown[]) => ({ participantId: 'PA_test' })),
  createRoom: vi.fn(async () => ({})),
  createDispatch: vi.fn(async () => ({})),
}));
const entityStore = vi.hoisted(() => ({
  isEntityStoreReady: vi.fn(() => false),
  findContactForTelephony: vi.fn(),
}));

vi.mock('livekit-server-sdk', () => ({
  SipClient: class {
    createSipParticipant = sip.createSipParticipant;
  },
  RoomServiceClient: class {
    createRoom = sip.createRoom;
    listParticipants = vi.fn(async () => [{ kind: 4 }]); // the agent is in (agent-join.ts)
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
vi.mock('../../../../memory/entity-store/integration.js', () => entityStore);
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { setConsentAsk } from '../../communication/outreach/consent-judge.js';
import { setReadBackAsk } from '../../communication/outreach/consent-readback.js';
import { askOnceLine, personOf } from '../../communication/outreach/consent-action.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { reachOutConfirm } from '../../communication/outreach/outreach-confirm-specs.js';
import {
  alwaysReadBack,
  alwaysYes,
} from '../../communication/outreach/__tests__/consent-call-harness.js';
import { getTelephonyToolDefinitions } from '../index.js';

const FLAG = 'CALL_READBACK_SAVED_NAME_ONLY';
const fetchSpy = vi.fn(async () => new Response('{}'));
const CALL_DR_LEE = { contactQuery: 'my doctor', purpose: 'reschedule my appointment' };
const ASIDE = "If they ask which number, it's 801-555-0163. Otherwise leave it out.";

function liveCall() {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const on = outreachConfirmListeners(session, () => true);
  return {
    call: async (id: string, args: Record<string, unknown>, callId: string) => {
      const tool = registry.get(id)!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      on.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => on.onTranscript({ transcript: text, isFinal: true }),
    ferni: (text: string) =>
      on.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }),
  };
}

/** The gate's reply split into what Ferni reads out word for word and the aside after it. */
function preview(out: string): { readBack: string; aside: string } {
  const m = /go ahead: (.*)\. Call callOnBehalf again only after the caller says yes\.(.*)$/s.exec(
    out
  );
  if (!m) throw new Error(`not a read-back: ${out}`);
  return { readBack: m[1], aside: m[2].trim() };
}

const dialed = () => sip.createSipParticipant.mock.calls.map((c) => c[1]);

describe('CALL_READBACK_SAVED_NAME_ONLY: a saved contact is read back by name', () => {
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
      [FLAG]: 'on',
    }))
      vi.stubEnv(k, v);
    vi.stubGlobal('fetch', fetchSpy);
    setReadBackAsk(alwaysReadBack);
    setConsentAsk(alwaysYes);
  });

  afterEach(() => {
    setReadBackAsk(undefined);
    setConsentAsk(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('flag on, saved contact: who and why only, no digits; the number waits in the aside', async () => {
    const out = await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1');
    const { readBack, aside } = preview(out);
    expect(readBack).toBe('a call to Dr. Lee, to reschedule my appointment');
    expect(readBack).not.toMatch(/\d/);
    expect(aside).toBe(ASIDE);
    expect(dialed()).toEqual([]);
  });

  it('flag off, saved contact: the full number, byte for byte as on main', async () => {
    vi.stubEnv(FLAG, 'off');
    expect(await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1')).toBe(
      'NOT SENT YET. Read this to the caller word for word and ask if you should go ahead: ' +
        'a call to Dr. Lee at 801-555-0163, to reschedule my appointment. ' +
        'Call callOnBehalf again only after the caller says yes.'
    );
  });

  it('flag on, a number the owner gave: still the full number, no aside', async () => {
    const DAD = { contactQuery: 'my dad', phoneNumber: '801-555-0142', purpose: 'check in on him' };
    const { readBack, aside } = preview(await liveCall().call('callOnBehalf', DAD, 'c1'));
    expect(readBack).toBe('a call to my dad at 801-555-0142, to check in on him');
    expect(aside).toBe('');
  });

  it('flag on, a saved contact with no name: the full number, no aside', async () => {
    entityStore.isEntityStoreReady.mockReturnValueOnce(true);
    entityStore.findContactForTelephony.mockResolvedValueOnce({
      name: '',
      phone: '(801) 555-0163',
      relationship: 'doctor',
    });
    const { readBack, aside } = preview(await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1'));
    expect(readBack).toBe('a call to my doctor at 801-555-0163, to reschedule my appointment');
    expect(aside).toBe('');
  });

  it('flag on, OUTREACH_SERVER_CONFIRM on: the server path keeps the name-only read-back and aside', async () => {
    vi.stubEnv('OUTREACH_SERVER_CONFIRM', 'on');
    const { readBack, aside } = preview(await liveCall().call('callOnBehalf', CALL_DR_LEE, 'c1'));
    expect(readBack).toBe('a call to Dr. Lee, to reschedule my appointment');
    expect(aside).toBe(ASIDE);
  });

  it('"Wait, which number?" answered, then a yes: rings exactly the stored number, once', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DR_LEE, 'c1');
    call.ferni('Okay, a call to Dr. Lee to reschedule your appointment. Should I go ahead?');
    call.caller('Wait, which number?');
    call.ferni("It's 801-555-0163.");
    call.caller('Yes, go ahead.');
    const placed = await call.call('callOnBehalf', { ...CALL_DR_LEE, purpose: 'chat' }, 'c2');
    expect(placed).not.toContain('NOT SENT YET');
    expect(dialed()).toEqual(['+18015550163']);
  });

  it('the digit veto still guards it: Ferni giving another number blocks the yes', async () => {
    const call = liveCall();
    await call.call('callOnBehalf', CALL_DR_LEE, 'c1');
    call.ferni('Okay, a call to Dr. Lee to reschedule your appointment. Should I go ahead?');
    call.caller('Wait, which number?');
    call.ferni("It's 801-555-0199. Should I go ahead?");
    call.caller('Yes, go ahead.');
    await call.call('callOnBehalf', CALL_DR_LEE, 'c2');
    expect(dialed()).toEqual([]);
  });

  it('the consent checks read the name-only read-back as this call', () => {
    const pending = {
      toolId: 'callOnBehalf',
      args: { ...CALL_DR_LEE, phoneNumber: '+18015550163' },
      readBack: 'a call to Dr. Lee, to reschedule my appointment',
    };
    // Without " at <number>" the name still ends at the comma (else it falls back to "my doctor").
    expect(personOf(pending)).toBe('Dr. Lee');
    expect(personOf({ ...pending, readBack: 'a call to Dr. Lee' })).toBe('Dr. Lee');
    expect(askOnceLine(pending)).toBe('Just to be sure: call Dr. Lee now?');
  });
});

describe('CALL_READBACK_SAVED_NAME_ONLY: reachOut by call to a saved contact', () => {
  const ROSA = {
    success: true,
    message: 'Thinking of you',
    contactName: 'Rosa',
    to: '+13035550100',
    contactId: 'c-rosa',
  };
  const prepare = (channel: string) =>
    reachOutConfirm.prepare({ contactName: 'Rosa' }, 'user-1', async () => ({ ...ROSA, channel }));

  afterEach(() => vi.unstubAllEnvs());

  it('flag on: a call or voicemail says who and what, the number only in the aside', async () => {
    vi.stubEnv(FLAG, 'on');
    for (const channel of ['call', 'voicemail']) {
      expect(await prepare(channel), channel).toEqual({
        args: expect.objectContaining({ preferredChannel: channel }),
        readBack: 'a call to Rosa, where Ferni will open with "Thinking of you"',
        aside: "If they ask which number, it's +13035550100. Otherwise leave it out.",
      });
    }
  });

  it('flag on: a text keeps its number (texts are a follow-up)', async () => {
    vi.stubEnv(FLAG, 'on');
    const out = await prepare('text');
    expect(out).toMatchObject({
      readBack: 'a text to Rosa at +13035550100, saying "Thinking of you"',
    });
    expect(out).not.toHaveProperty('aside');
  });

  it('flag off: the call read-back says the number, as on main', async () => {
    vi.stubEnv(FLAG, 'off');
    const out = await prepare('call');
    expect(out).toMatchObject({
      readBack: 'a call to Rosa at +13035550100, where Ferni will open with "Thinking of you"',
    });
    expect(out).not.toHaveProperty('aside');
  });
});
