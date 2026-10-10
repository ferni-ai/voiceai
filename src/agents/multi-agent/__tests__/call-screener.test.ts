/**
 * CALL_SCREEN_HANDLING: on a real call (2026-10-10) Seth's sister Mindy's
 * phone answered with a call screener ("the person you're calling is using a
 * screening service... say your name and why you're calling... please stay on
 * the line") and Ferni chatted to it like a person. Now Ferni answers the
 * screener once, in one line, then waits in silence: a person picking up
 * gets the normal opener; voicemail gets the voicemail message.
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
const recordAnsweredBy = vi.fn(async () => undefined);
vi.mock('../../../services/outreach/answered-by.js', () => ({ recordAnsweredBy }));
const removeParticipant = vi.fn(async () => undefined);
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    removeParticipant = removeParticipant;
  },
}));

const { setupCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { AgentOrchestrator } = await import('../orchestrator.js');
const { classifyLine, screenLine, screenerReply, voicemailMessage } =
  await import('../../shared/line-screen.js');

const GOOGLE =
  "Hi, the person you're calling is using a screening service from Google and will get a copy of this conversation. Go ahead and say your name and why you're calling.";
const APPLE =
  "Hi, if you record your name and reason for calling, I'll see if this person is available.";
const STAY = 'Thanks, please stay on the line.';
const ID_LINE = "Hi, it's Ferni, Seth's AI friend, calling to check in on Mindy.";
const OPENER =
  "Hi Mindy, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?";
const mindy = { recipientName: 'Mindy', sponsorName: 'Seth', personal: true };

const evidence = (text: string, silentMs = 0) => ({
  sinceAnswerMs: 1500,
  text,
  talkingMs: 0,
  silentMs,
});

function fakeSession() {
  return Object.assign(new EventEmitter(), {
    say: vi.fn((_text: string, _opts?: unknown) => ({ waitForPlayout: async () => undefined })),
  });
}
const speaks = (s: EventEmitter, transcript: string) => {
  s.emit('user_state_changed', { newState: 'speaking' });
  s.emit('user_input_transcribed', { transcript, isFinal: true });
  s.emit('user_state_changed', { newState: 'listening' });
};
const deps = () => ({
  hangUp: vi.fn(async () => undefined),
  record: vi.fn(async () => undefined),
  tickMs: 50,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOICEMAIL_DETECT = 'on';
  process.env.CALL_SCREEN_HANDLING = 'on';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.VOICEMAIL_DETECT;
  delete process.env.CALL_SCREEN_HANDLING;
});

describe('classifyLine with CALL_SCREEN_HANDLING', () => {
  it('knows Google’s and Apple’s screeners, even mid-sentence', () => {
    expect(classifyLine(evidence(GOOGLE))).toBe('screener');
    expect(classifyLine(evidence(APPLE))).toBe('screener');
    expect(classifyLine(evidence(STAY))).toBe('screener');
    expect(classifyLine(evidence("Hi, the person you're calling is using a screening"))).toBe(
      'screener'
    );
  });

  it('still tells a person and a voicemail apart', () => {
    expect(classifyLine(evidence('Hello?', 900))).toBe('human');
    expect(classifyLine(evidence('Please leave a message after the tone'))).toBe('voicemail');
  });

  it('after answering a screener, silence is not a person', () => {
    const quiet = { sinceAnswerMs: 20_000, text: '', talkingMs: 0, silentMs: 20_000 };
    expect(classifyLine(quiet, true)).toBeUndefined();
    expect(classifyLine(quiet, false)).toBe('human');
  });

  it('with the flag off, a screener is treated like any other machine', () => {
    delete process.env.CALL_SCREEN_HANDLING;
    expect(classifyLine(evidence(GOOGLE))).toBe('voicemail');
  });
});

describe('screenerReply', () => {
  it('says who is calling and why, with the light disclosure, in one line', () => {
    expect(screenerReply(mindy)).toBe(ID_LINE);
    expect(screenerReply({ personal: true })).toBe(
      "Hi, it's Ferni, an AI friend, calling to check in."
    );
    expect(screenerReply({ sponsorName: 'Seth', personal: false })).toBe(
      'Hi, this is Ferni, an AI calling for Seth.'
    );
  });
});

describe('screenLine on a call screener', () => {
  it('answers the screener once, stays silent through its prompts, opens when Mindy picks up', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const d = deps();
    const result = screenLine(session as never, mindy, d);

    speaks(session, GOOGLE);
    await vi.advanceTimersByTimeAsync(300);
    expect(session.say, 'not while the screener is still asking').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(session.say).toHaveBeenCalledWith(ID_LINE, { allowInterruptions: false });

    speaks(session, STAY);
    await vi.advanceTimersByTimeAsync(2000);
    speaks(session, "Sorry, can you say your name and why you're calling?");
    await vi.advanceTimersByTimeAsync(15_000); // waiting on Mindy, in silence
    expect(session.say, 'never repeats, never converses').toHaveBeenCalledTimes(1);
    expect(d.hangUp).not.toHaveBeenCalled();

    speaks(session, 'Hey, Ferni?');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('human'); // the caller then plays the opener
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(d.record).toHaveBeenCalledWith('human');
  });

  it('if the screener sends Ferni to voicemail, leaves the message and hangs up', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const d = deps();
    const result = screenLine(session as never, mindy, d);
    speaks(session, APPLE);
    await vi.advanceTimersByTimeAsync(800);
    speaks(session, 'Mindy is not available. Please leave a message after the tone.');
    await vi.advanceTimersByTimeAsync(2500);
    await expect(result).resolves.toBe('voicemail');
    expect(session.say.mock.calls.map((c) => c[0])).toEqual([ID_LINE, voicemailMessage(mindy)]);
    expect(d.hangUp).toHaveBeenCalledTimes(1);
  });

  it('if no one ever comes, hangs up quietly after a minute', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const d = deps();
    const result = screenLine(session as never, mindy, d);
    speaks(session, GOOGLE);
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(result).resolves.toBe('voicemail');
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(d.hangUp).toHaveBeenCalledTimes(1);
    expect(d.record).not.toHaveBeenCalled();
  });
});

describe('a placed call answered by a screener, on the real orchestrator', () => {
  it('one identification line, then the normal opener when Mindy picks up', async () => {
    await setupCallTypeContexts(
      {
        type: 'on_behalf_call',
        callId: 'mindy-checkin',
        callType: 'personal',
        session_id: 'onbehalf:mindy',
        requester: { userId: 'seth-uid', name: 'Seth', timezone: 'UTC', originalSessionId: 's0' },
        contact: { name: 'Mindy', phone: '+18015550111' },
        purpose: 'Check in on Mindy.',
      },
      'on_behalf_call',
      'cs-mindy',
      'room-cs-mindy'
    );
    const room = Object.assign(new EventEmitter(), { name: 'room-cs-mindy' });
    const session = fakeSession();
    const say = vi.fn();
    const phone = (callStatus: string) => ({
      identity: 'phone_mindy',
      attributes: { 'sip.callStatus': callStatus },
    });
    const orchestrator = new AgentOrchestrator({
      ctx: {} as never,
      room: room as never,
      userParticipant: phone('ringing') as never,
      createPersonaAgent: async () =>
        ({ id: 'a1', personaId: 'ferni', say, setMuted: vi.fn(), userData: {}, session }) as never,
      sessionId: 'cs-mindy',
    });
    await orchestrator.start('ferni');
    await new Promise((r) => {
      setTimeout(r, 100);
    });
    room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, phone('active'));
    await new Promise((r) => {
      setTimeout(r, 200);
    });

    speaks(session, GOOGLE);
    await vi.waitFor(() => expect(session.say).toHaveBeenCalledWith(ID_LINE, expect.anything()));
    speaks(session, STAY);
    await new Promise((r) => {
      setTimeout(r, 1500);
    });
    expect(say, 'no opener to the screener').not.toHaveBeenCalled();

    speaks(session, 'Hello?');
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith(OPENER, expect.anything()), {
      timeout: 3000,
    });
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(removeParticipant).not.toHaveBeenCalled();
  }, 15_000);
});
