/**
 * The on-behalf call opening as the agent runs it, with LiveKit's room and
 * answering-machine detector stubbed: off by default (main's opener path),
 * and with CALL_OPENING_AMD on, person / silence / voicemail / unreachable /
 * unanswered each end the way call-opening.ts decides.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Verdict = { category: string; transcript: string; delayMs: number };

const stubs = vi.hoisted(() => ({
  room: undefined as unknown,
  verdict: { category: 'human', transcript: 'Hello?', delayMs: 300 } as Verdict,
  amdCreated: 0,
  hangUpCall: vi.fn(async (_sessionId: string, _disposition?: string) => true),
}));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeAMD {
    constructor() {
      stubs.amdCreated += 1;
    }
    async execute() {
      return stubs.verdict;
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

const { openIfOnBehalfCall } = await import('../livekit-call-opening.js');
const { registerOnBehalfCallRoom, forgetOnBehalfCallRoom } = await import('../call-control.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

const SESSION = 'ob-amd';
const OPENER =
  "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?";

function phoneRoom(callStatus: string) {
  const room = Object.assign(new EventEmitter(), {
    remoteParticipants: new Map([
      ['phone_c1', { identity: 'phone_c1', attributes: { 'sip.callStatus': callStatus } }],
    ]),
  });
  stubs.room = room;
  return room;
}

function callingAgent() {
  const playout = { waitForPlayout: vi.fn(async () => undefined) };
  const session = { say: vi.fn(() => playout), generateReply: vi.fn(() => playout) };
  return {
    session,
    say: vi.fn(),
    userData: {} as { greetingText?: string; greetingInjected?: boolean },
    wireHandlers: vi.fn(async () => undefined),
  };
}

const savedFlag = process.env.CALL_OPENING_AMD;

beforeEach(() => {
  stubs.amdCreated = 0;
  stubs.hangUpCall.mockClear();
  phoneRoom('active');
  registerOnBehalfCallRoom(SESSION, 'c1', 'room-c1');
  setOutboundCallContext(SESSION, {
    callId: 'c1',
    recipientName: 'Doug',
    recipientPhone: '+18015550100',
    purpose: 'check in on Doug',
    callType: 'personal',
    objective: 'general',
    script: '',
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: 'Seth',
    originalSessionId: '',
  });
});

afterEach(() => {
  forgetOnBehalfCallRoom(SESSION);
  if (savedFlag === undefined) delete process.env.CALL_OPENING_AMD;
  else process.env.CALL_OPENING_AMD = savedFlag;
});

describe('with CALL_OPENING_AMD off (the default)', () => {
  it("leaves an on-behalf call to main's opener and never runs detection", async () => {
    delete process.env.CALL_OPENING_AMD;
    const agent = callingAgent();
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(false);
    process.env.CALL_OPENING_AMD = 'off';
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(false);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(stubs.amdCreated).toBe(0);
    expect(agent.say).not.toHaveBeenCalled();
  });
});

describe('with CALL_OPENING_AMD on', () => {
  beforeEach(() => {
    process.env.CALL_OPENING_AMD = 'on';
  });

  it('leaves ordinary sessions to their normal greeting', () => {
    expect(openIfOnBehalfCall('s-ordinary', callingAgent())).toBe(false);
  });

  it('lets a person who said hello hear the reply, not a second opener', async () => {
    stubs.verdict = { category: 'human', transcript: 'Hello?', delayMs: 300 };
    const agent = callingAgent();
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(true);
    await vi.waitFor(() => expect(agent.wireHandlers).toHaveBeenCalledTimes(1));
    expect(stubs.amdCreated).toBe(1);
    expect(agent.say).not.toHaveBeenCalled();
    expect(stubs.hangUpCall).not.toHaveBeenCalled();
  });

  it("says main's opener to a silent pickup and remembers it as the greeting", async () => {
    stubs.verdict = { category: 'uncertain', transcript: '', delayMs: 2500 };
    const agent = callingAgent();
    expect(openIfOnBehalfCall(SESSION, agent)).toBe(true);
    await vi.waitFor(() => expect(agent.say).toHaveBeenCalledTimes(1));
    expect(agent.say).toHaveBeenCalledWith(OPENER, { allowInterruptions: true });
    expect(agent.userData).toEqual({ greetingText: OPENER, greetingInjected: false });
  });

  it('leaves a voicemail in the same words, then hangs up as voicemail_left', async () => {
    stubs.verdict = { category: 'machine-vm', transcript: 'leave a message', delayMs: 900 };
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() => expect(stubs.hangUpCall).toHaveBeenCalled());
    const [{ instructions }] = agent.session.generateReply.mock.calls[0] as unknown as [
      { instructions: string },
    ];
    expect(instructions).toContain(`"Hi Doug, it's Ferni, Seth's AI friend."`);
    expect(instructions).toContain('check in on Doug');
    expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, 'voicemail_left');
    expect(agent.say).not.toHaveBeenCalled();
    expect(agent.wireHandlers).not.toHaveBeenCalled();
  });

  it('hangs up on a full mailbox as unreachable, saying nothing', async () => {
    stubs.verdict = { category: 'machine-unavailable', transcript: 'mailbox is full', delayMs: 0 };
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    await vi.waitFor(() => expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, 'unreachable'));
    expect(agent.session.generateReply).not.toHaveBeenCalled();
    expect(agent.say).not.toHaveBeenCalled();
  });

  it('hangs up without listening when the phone is never answered', async () => {
    const room = phoneRoom('dialing');
    const agent = callingAgent();
    openIfOnBehalfCall(SESSION, agent);
    room.emit(
      'participantAttributesChanged',
      { 'sip.callStatus': 'hangup' },
      {
        identity: 'phone_c1',
        attributes: { 'sip.callStatus': 'hangup' },
      }
    );
    await vi.waitFor(() => expect(stubs.hangUpCall).toHaveBeenCalledWith(SESSION, undefined));
    expect(stubs.amdCreated).toBe(0);
    expect(agent.say).not.toHaveBeenCalled();
  });
});
