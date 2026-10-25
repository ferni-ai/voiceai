/**
 * CALL_VOICEMAIL_V2: a voicemail greeting that starts late is still treated as
 * a voicemail. Prod 2026-10-24: the greeting began ~4.5 s after pickup, the
 * detector's no-speech window was 2.5 s, so the pickup counted as silent and
 * the opener played over the greeting.
 *
 * The fake detector follows the real one's rule (no speech inside
 * noSpeechTimeoutMs settles "uncertain") on one clock that runs from pickup,
 * so each test only says when the greeting starts.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => ({
  room: undefined as unknown,
  /** When the voicemail greeting starts, in ms after pickup. */
  greetingAtMs: Infinity,
  /** What the detector makes of the words that start then. */
  greeting: { category: 'machine-vm', transcript: 'Leave a message after the tone' },
  /** The voicemail message was cut off before it finished. */
  messageCutOff: false,
  /** Ms after pickup that the current detector run starts listening. */
  clockMs: 0,
  amdOptions: [] as Array<{ noSpeechTimeoutMs?: number; interruptOnMachine?: boolean }>,
  hangUpCall: vi.fn(async (_sessionId: string, _disposition?: string) => true),
}));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeAMD {
    private readonly windowMs: number;
    constructor(_session: unknown, options: { noSpeechTimeoutMs?: number }) {
      stubs.amdOptions.push(options);
      this.windowMs = options.noSpeechTimeoutMs ?? 0;
    }
    async execute() {
      const end = stubs.clockMs + this.windowMs;
      if (stubs.greetingAtMs <= end) {
        stubs.clockMs = stubs.greetingAtMs;
        return { ...stubs.greeting, delayMs: 0 };
      }
      stubs.clockMs = end;
      return { category: 'uncertain', transcript: '', delayMs: 0 };
    }
    async aclose() {}
  }
  return {
    ...actual,
    getJobContext: () => ({ room: stubs.room }),
    voice: { ...actual.voice, AMD: FakeAMD },
  };
});

vi.mock('../call-control.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../call-control.js')>();
  return { ...actual, hangUpCall: stubs.hangUpCall };
});

const { openIfOnBehalfCall, FIRST_SPEECH_TIMEOUT_MS, AFTER_OPENER_LISTEN_MS } =
  await import('../livekit-call-opening.js');
const { registerOnBehalfCallRoom, forgetOnBehalfCallRoom } = await import('../call-control.js');
const { takeVoicemailSpoken } = await import('../../../services/outreach/voicemail-outcome.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

const SESSION = 'ob-vm2';

/** A multi-agent persona: say() only queues, and the session reports when Ferni starts speaking. */
function callingAgent() {
  const playout = { waitForPlayout: vi.fn(async () => undefined) };
  const reply = () => ({
    waitForPlayout: vi.fn(async () => undefined),
    interrupted: stubs.messageCutOff,
    chatItems: [{ type: 'message', role: 'assistant' }],
  });
  const session = Object.assign(new EventEmitter(), {
    agentState: 'listening',
    say: vi.fn(() => playout),
    generateReply: vi.fn((_options?: { instructions: string }) => reply()),
  });
  const say = vi.fn(() => {
    // Detection must not start before this: it would hold the queued opener.
    expect(stubs.amdOptions).toHaveLength(1);
    setTimeout(() => {
      session.agentState = 'speaking';
      session.emit('agent_state_changed', { newState: 'speaking' });
    }, 5);
  });
  return { session, say, userData: {}, wireHandlers: vi.fn(async () => undefined) };
}

const saved = { amd: process.env.CALL_OPENING_AMD, v2: process.env.CALL_VOICEMAIL_V2 };
const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

beforeEach(() => {
  stubs.clockMs = 0;
  stubs.amdOptions = [];
  stubs.greeting = { category: 'machine-vm', transcript: 'Leave a message after the tone' };
  stubs.messageCutOff = false;
  stubs.hangUpCall.mockClear();
  stubs.room = Object.assign(new EventEmitter(), {
    remoteParticipants: new Map([
      ['phone_c1', { identity: 'phone_c1', attributes: { 'sip.callStatus': 'active' } }],
    ]),
  });
  process.env.CALL_OPENING_AMD = 'on';
  registerOnBehalfCallRoom(SESSION, 'c1', 'room-c1');
  setOutboundCallContext(SESSION, {
    callId: 'c1',
    recipientName: 'Doug',
    recipientPhone: '+15555550100',
    purpose: 'check in on Doug',
    callType: 'personal',
    objective: 'general',
    script: '',
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: 'Sam',
    originalSessionId: '',
  });
});

afterEach(() => {
  forgetOnBehalfCallRoom(SESSION);
  restore('CALL_OPENING_AMD', saved.amd);
  restore('CALL_VOICEMAIL_V2', saved.v2);
});

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 30);
  });

describe('a voicemail greeting that starts 4.5 s after pickup', () => {
  beforeEach(() => {
    stubs.greetingAtMs = 4_500;
  });

  it('with CALL_VOICEMAIL_V2 off (prod 10-24): counts as a silent pickup and gets the opener', async () => {
    delete process.env.CALL_VOICEMAIL_V2;
    const agent = callingAgent();
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(true);
    await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalled());
    expect(agent.say).toHaveBeenCalledTimes(1); // the opener, over the greeting
    expect(agent.session.generateReply).not.toHaveBeenCalled();
    expect(stubs.hangUpCall).not.toHaveBeenCalled();
  });

  it('with CALL_VOICEMAIL_V2 on: is a voicemail, waited out, one message, then a hang-up', async () => {
    process.env.CALL_VOICEMAIL_V2 = 'on';
    const agent = callingAgent();
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(true);
    await vi.waitFor(() =>
      expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, 'voicemail_left')
    );
    expect(stubs.amdOptions[0]).toMatchObject({ noSpeechTimeoutMs: FIRST_SPEECH_TIMEOUT_MS });
    expect(FIRST_SPEECH_TIMEOUT_MS).toBeGreaterThan(4_500);
    expect(agent.say).not.toHaveBeenCalled(); // no opener over the greeting
    expect(agent.session.generateReply).toHaveBeenCalledTimes(1);
    const [{ instructions }] = agent.session.generateReply.mock.calls[0] as unknown as [
      { instructions: string },
    ];
    expect(instructions).toContain(`"Hi Doug, it's Ferni, Sam's AI friend."`);
    expect(instructions).toContain('check in on Doug');
    expect(agent.wireHandlers).not.toHaveBeenCalled();
    expect(takeVoicemailSpoken(SESSION)).toBe(true); // the report's only evidence of a message
  });
});

it('a voicemail message that is cut off is not recorded as spoken', async () => {
  process.env.CALL_VOICEMAIL_V2 = 'on';
  stubs.greetingAtMs = 4_500;
  stubs.messageCutOff = true;
  const agent = callingAgent();
  openIfOnBehalfCall(SESSION, agent);
  await vi.waitFor(() => expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, 'voicemail_left'));
  expect(takeVoicemailSpoken(SESSION)).toBe(false);
});

describe('a voicemail greeting that starts after the opener (9 s after pickup)', () => {
  beforeEach(() => {
    stubs.greetingAtMs = 9_000;
  });

  it('with CALL_VOICEMAIL_V2 off: nothing listens after the opener', async () => {
    delete process.env.CALL_VOICEMAIL_V2;
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalled());
    expect(stubs.amdOptions).toHaveLength(1);
    expect(stubs.hangUpCall).not.toHaveBeenCalled();
  });

  it('with CALL_VOICEMAIL_V2 on: stops Ferni, leaves one message, then hangs up', async () => {
    process.env.CALL_VOICEMAIL_V2 = 'on';
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() =>
      expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, 'voicemail_left')
    );
    expect(agent.say).toHaveBeenCalledTimes(1); // the opener to the silent pickup
    expect(stubs.amdOptions).toMatchObject([
      { noSpeechTimeoutMs: FIRST_SPEECH_TIMEOUT_MS, interruptOnMachine: true },
      // interruptOnMachine is what stops the opener when the greeting is recognised
      { noSpeechTimeoutMs: AFTER_OPENER_LISTEN_MS, interruptOnMachine: true },
    ]);
    expect(agent.session.generateReply).toHaveBeenCalledTimes(1);
    expect(stubs.hangUpCall).toHaveBeenCalledTimes(1);
    expect(agent.wireHandlers).not.toHaveBeenCalled();
    expect(takeVoicemailSpoken(SESSION)).toBe(true);
  });

  it('with CALL_VOICEMAIL_V2 on: a person answering late gets the conversation, no hang-up', async () => {
    process.env.CALL_VOICEMAIL_V2 = 'on';
    stubs.greeting = { category: 'human', transcript: "Hello? Who's this?" };
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalledTimes(1));
    await settle();
    expect(stubs.amdOptions).toHaveLength(2);
    expect(stubs.hangUpCall).not.toHaveBeenCalled();
    expect(agent.session.generateReply).not.toHaveBeenCalled(); // the normal reply answers them
    expect(takeVoicemailSpoken(SESSION)).toBe(false);
  });

  it('with CALL_VOICEMAIL_V2 on: a person who sounds like a machine is answered, not voicemailed', async () => {
    process.env.CALL_VOICEMAIL_V2 = 'on';
    // AMD can call this machine-vm; without a recorded-greeting phrase it is not definitive.
    stubs.greeting = {
      category: 'machine-vm',
      transcript: "Hi, you've reached Sam... oh hey, it's me",
    };
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalledTimes(1));
    await settle();
    expect(stubs.hangUpCall).not.toHaveBeenCalled();
    expect(agent.session.generateReply).toHaveBeenCalledTimes(1);
    expect(agent.session.generateReply.mock.calls[0]).toEqual([]); // carry on, no voicemail script
    expect(takeVoicemailSpoken(SESSION)).toBe(false);
  });
});

it('with CALL_VOICEMAIL_V2 on, a pickup that stays silent keeps the conversation going', async () => {
  process.env.CALL_VOICEMAIL_V2 = 'on';
  stubs.greetingAtMs = Infinity;
  const agent = callingAgent();
  openIfOnBehalfCall(SESSION, agent);
  await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalledTimes(1));
  await settle();
  expect(agent.say).toHaveBeenCalledTimes(1);
  expect(stubs.amdOptions).toHaveLength(2);
  expect(agent.session.generateReply).not.toHaveBeenCalled();
  expect(stubs.hangUpCall).not.toHaveBeenCalled();
});
