/**
 * VOICEMAIL_DETECT on the real outbound-call path: the orchestrator places
 * Doug's call, the phone is answered, and the line is screened. A voicemail
 * greeting gets one short message (with the opener's light disclosure) and a
 * hang-up, never the opener or a conversation, and the outcome is recorded
 * for Seth. A person saying "Hello?" gets the opener. Flag off: as before.
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
const { isScreeningCall } = await import('../../shared/line-screen.js');

const DOUG_VOICEMAIL =
  "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in, no need to call back, I'll try again another time.";
const OPENER =
  "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?";

const dispatch = {
  type: 'on_behalf_call',
  callId: 'doug-checkin',
  callType: 'personal',
  session_id: 'onbehalf:doug',
  requester: { userId: 'seth-uid', name: 'Seth', timezone: 'UTC', originalSessionId: 's0' },
  contact: { name: 'Doug', phone: '+18015550100' },
  purpose: 'Check in on Doug.',
};

const phone = (callStatus: string) => ({
  identity: 'phone_doug',
  attributes: { 'sip.callStatus': callStatus },
});

/** The real orchestrator with a stub agent whose session is a fake AgentSession. */
async function placeCall(sessionId: string) {
  await setupCallTypeContexts(dispatch, 'on_behalf_call', sessionId, `room-${sessionId}`);
  const room = Object.assign(new EventEmitter(), { name: `room-${sessionId}` });
  const session = Object.assign(new EventEmitter(), {
    say: vi.fn(() => ({ waitForPlayout: async () => undefined })),
  });
  const say = vi.fn(); // the opener, via agent.say
  const orchestrator = new AgentOrchestrator({
    ctx: {} as never,
    room: room as never,
    userParticipant: phone('ringing') as never,
    createPersonaAgent: async () =>
      ({ id: 'a1', personaId: 'ferni', say, setMuted: vi.fn(), userData: {}, session }) as never,
    sessionId,
  });
  await orchestrator.start('ferni');
  await new Promise((r) => {
    setTimeout(r, 100); // the greeting starts waiting for the pickup
  });
  room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, phone('active'));
  const hears = (transcript: string, isFinal = true) =>
    session.emit('user_input_transcribed', { transcript, isFinal });
  return { session, say, hears };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOICEMAIL_DETECT = 'on';
});
afterEach(() => {
  delete process.env.VOICEMAIL_DETECT;
});

describe('a call answered by voicemail', () => {
  it('leaves one message after the greeting, hangs up, never opens or converses', async () => {
    const { session, say, hears } = await placeCall('vm-machine');
    await vi.waitFor(() => expect(isScreeningCall(session)).toBe(true));

    session.emit('user_state_changed', { newState: 'speaking' });
    hears("Hi, you've reached Doug", false);
    hears("Hi, you've reached Doug. I can't come to the phone, leave a message after the beep.");
    session.emit('user_state_changed', { newState: 'listening' });
    await new Promise((r) => {
      setTimeout(r, 1000);
    });
    expect(session.say, 'not over the greeting').not.toHaveBeenCalled();

    await vi.waitFor(() => expect(removeParticipant).toHaveBeenCalled(), { timeout: 5000 });
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(session.say).toHaveBeenCalledWith(DOUG_VOICEMAIL, { allowInterruptions: false });
    expect(removeParticipant).toHaveBeenCalledWith('room-vm-machine', 'phone_doug');
    expect(say, 'no opener into a machine').not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(recordAnsweredBy).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'doug-checkin', requesterUserId: 'seth-uid' }),
        'voicemail'
      )
    );
    expect(isScreeningCall(session)).toBe(false);
  }, 15_000);
});

describe('a call answered by Doug', () => {
  it('opens with the usual opener once he has said hello', async () => {
    const { session, say, hears } = await placeCall('vm-human');
    await vi.waitFor(() => expect(isScreeningCall(session)).toBe(true));
    session.emit('user_state_changed', { newState: 'speaking' });
    hears('Hello?');
    session.emit('user_state_changed', { newState: 'listening' });

    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(say.mock.calls[0][0]).toBe(OPENER);
    expect(session.say).not.toHaveBeenCalled();
    expect(removeParticipant).not.toHaveBeenCalled();
    expect(recordAnsweredBy).toHaveBeenCalledWith(
      expect.objectContaining({ requesterUserId: 'seth-uid' }),
      'human'
    );
    expect(isScreeningCall(session)).toBe(false);
  });
});

describe('with VOICEMAIL_DETECT off', () => {
  it('opens after the pickup without screening, even over a greeting', async () => {
    delete process.env.VOICEMAIL_DETECT;
    const { session, say, hears } = await placeCall('vm-off');
    hears("Hi, you've reached Doug, leave a message after the beep.");
    expect(isScreeningCall(session)).toBe(false);
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith(OPENER, expect.anything()), {
      timeout: 3000,
    });
    expect(session.say).not.toHaveBeenCalled();
    expect(removeParticipant).not.toHaveBeenCalled();
    expect(recordAnsweredBy).not.toHaveBeenCalled();
  });
});
