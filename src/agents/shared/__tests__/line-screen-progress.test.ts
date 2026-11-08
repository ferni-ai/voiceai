/**
 * CALL_LIVE_RELAY, written where the line is screened (VOICEMAIL_DETECT=on): the
 * placed call's job notes who answered on the call record as soon as it knows,
 * before the voicemail message plays, so the owner hears "went to voicemail, I'm
 * leaving a message" while it is true. A person is noted as answered, a machine as
 * voicemail. Drives the real personAnswered and its own record wiring.
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ sets: [] as Array<{ path: string; data: unknown }> }));
vi.mock('../../../services/superhuman/firestore-utils.js', () => {
  const ref = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    set: async (data: unknown) => void fs.sets.push({ path, data }),
  });
  return {
    getFirestoreDb: () => ({
      collection: (n: string) => ({ doc: (id: string) => ref(`${n}/${id}`) }),
    }),
  };
});
vi.mock('../../../services/outreach/answered-by.js', () => ({
  recordAnsweredBy: vi.fn(async () => undefined),
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    removeParticipant = vi.fn(async () => undefined);
  },
}));

const { personAnswered, screenLine } = await import('../line-screen.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

const JOB = 'onbehalf:c-screen';
const parties = { recipientName: 'Priya', sponsorName: 'Riley', personal: true };

function fakeSession() {
  return Object.assign(new EventEmitter(), {
    say: vi.fn(() => ({ waitForPlayout: async () => undefined })),
  });
}
const speak = (s: EventEmitter, transcript: string) => {
  s.emit('user_state_changed', { newState: 'speaking' });
  s.emit('user_input_transcribed', { transcript, isFinal: true });
  s.emit('user_state_changed', { newState: 'listening' });
};
const room = () => Object.assign(new EventEmitter(), { name: 'onbehalf-c-screen' });
const phone = { identity: 'phone_c-screen', attributes: { 'sip.callStatus': 'active' } };

beforeEach(() => {
  fs.sets = [];
  process.env.VOICEMAIL_DETECT = 'on';
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
  process.env.CALL_LIVE_RELAY = 'on';
  setOutboundCallContext(JOB, {
    callId: 'c-screen',
    recipientName: 'Priya',
    recipientPhone: '+15555550142',
    purpose: 'ask about Thursday',
    callType: 'personal',
    objective: 'check_in',
    script: '',
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: 'Riley Test',
    originalSessionId: 'sess-owner',
    requesterUserId: 'uid-riley-test',
    kind: 'on_behalf',
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.VOICEMAIL_DETECT;
  delete process.env.CALL_RESULT_LIVE_REPORT;
  delete process.env.CALL_LIVE_RELAY;
});

const progressNoted = () =>
  fs.sets
    .filter((s) => s.path === 'bogle_users/uid-riley-test/on_behalf_calls/c-screen')
    .map((s) => Object.keys((s.data as { progress: object }).progress));

describe('who answered goes on the call record', () => {
  it('a machine: noted as voicemail', async () => {
    const session = fakeSession();
    const answered = personAnswered(room() as never, phone, { session }, parties, JOB);
    await vi.waitFor(() => expect(session.listenerCount('user_input_transcribed')).toBe(1));
    speak(session, "Hi, you've reached Priya. Leave a message after the tone.");
    await expect(answered).resolves.toBe(false);
    await vi.waitFor(() => expect(progressNoted()).toEqual([['voicemailAt']]));
  });

  it('a person: noted as answered', async () => {
    const session = fakeSession();
    const answered = personAnswered(room() as never, phone, { session }, parties, JOB);
    await vi.waitFor(() => expect(session.listenerCount('user_input_transcribed')).toBe(1));
    speak(session, 'Hello?');
    await expect(answered).resolves.toBe(true);
    await vi.waitFor(() => expect(progressNoted()).toEqual([['answeredAt']]));
  });

  it('CALL_LIVE_RELAY off: nothing noted', async () => {
    delete process.env.CALL_LIVE_RELAY;
    const session = fakeSession();
    const answered = personAnswered(room() as never, phone, { session }, parties, JOB);
    await vi.waitFor(() => expect(session.listenerCount('user_input_transcribed')).toBe(1));
    speak(session, 'Hello?');
    await expect(answered).resolves.toBe(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(fs.sets).toEqual([]);
  });

  it('the verdict is heard before the voicemail message plays', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const order: string[] = [];
    session.say.mockImplementation(() => {
      order.push('message');
      return { waitForPlayout: async () => undefined };
    });
    const deps = {
      hangUp: vi.fn(async () => undefined),
      record: vi.fn(async () => undefined),
      heard: vi.fn((who: string) => void order.push(`heard:${who}`)),
      tickMs: 50,
    };
    const result = screenLine(session as never, parties, deps);
    speak(session, "Hi, you've reached Priya. Leave a message after the tone.");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe('voicemail');
    expect(order).toEqual(['heard:voicemail', 'message']);
  });
});
