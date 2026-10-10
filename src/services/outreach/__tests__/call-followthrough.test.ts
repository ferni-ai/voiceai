/**
 * After Ferni calls someone for the user, the outcome, a short report and any
 * message for the user go through the real call-result capture: Firestore
 * on_behalf_calls, plus the "while you were away" result the user's next
 * session opens with.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const captureBackgroundResult = vi.fn(async () => ({}));

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: vi.fn(),
  onFollowUpActionChange: vi.fn(),
}));
vi.mock('../../background-agents/unified-result-capture.js', () => ({ captureBackgroundResult }));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: vi.fn(),
}));

const { classifyCallOutcome, followthroughCallFromDispatch, recordCallFollowthrough } =
  await import('../call-followthrough.js');
const pushModule = await import('../delivery/push-notifications.js');

const dispatch = (extra: Record<string, unknown> = {}) => ({
  type: 'on_behalf_call',
  callId: 'doug-checkin-20261010',
  requester: {
    userId: 'seth',
    name: 'Seth',
    timezone: 'America/Los_Angeles',
    originalSessionId: 's0',
  },
  contact: { name: 'Doug', phone: '+18015550123', relationship: 'dad' },
  purpose: 'check in and say hi from Seth',
  ...extra,
});
const call = () => followthroughCallFromDispatch(dispatch())!;
const turns = (...replies: string[]) =>
  replies.flatMap((r) => [
    { role: 'assistant', content: 'Hi, it is Ferni.' },
    { role: 'user', content: r },
  ]);
const report =
  (summary: string, messageForUser: string | null = null) =>
  async () => ({ summary, messageForUser });
const rowsIn = (collection: string) => rows.filter((r) => r.collection === collection);

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  process.env.CALL_FOLLOWTHROUGH = 'on';
});
afterEach(() => {
  delete process.env.CALL_FOLLOWTHROUGH;
});

describe('classifyCallOutcome', () => {
  it.each([
    ['nobody spoke', [], 40, 'no_answer'],
    [
      'a voicemail greeting',
      turns("Hi, you've reached Doug. Leave a message after the tone."),
      30,
      'voicemail',
    ],
    ['one reply then gone', turns('Who is this?'), 71, 'hung_up_early'],
    ['a quick exchange', turns('Hey', 'Gotta run'), 12, 'hung_up_early'],
    ['a real conversation', turns('Oh hi!', 'Doing great', 'Tell him to call me'), 95, 'answered'],
    [
      'a person who mentions being unavailable',
      turns('Hi', "I'm not available right now for Sunday", 'but next week works', 'Bye'),
      90,
      'answered',
    ],
  ])('%s -> %s', (_label, t, seconds, expected) => {
    expect(classifyCallOutcome(t, seconds)).toBe(expected);
  });
});

describe('recordCallFollowthrough (real capture path)', () => {
  it('stores an answered call with the report and the message, and tells the user', async () => {
    expect(rowsIn('on_behalf_calls')).toHaveLength(0);

    const result = await recordCallFollowthrough(
      call(),
      turns('Oh hi!', 'Doing great', 'Tell him to call me about Sunday'),
      95,
      { summarize: report("Talked to your dad. He's doing great.", 'Call me about Sunday') }
    );

    expect(result).toMatchObject({ outcome: 'answered', messageForUser: 'Call me about Sunday' });
    const [stored] = rowsIn('on_behalf_calls');
    expect(stored.id).toBe('doug-checkin-20261010');
    expect(stored.userId).toBe('seth');
    expect(stored.data.outcome).toMatchObject({
      status: 'completed',
      objectiveAchieved: true,
      outcome: "Talked to your dad. He's doing great.",
      followthrough: { outcome: 'answered', messageForUser: 'Call me about Sunday' },
    });
    // What the user's next session opens with ("while you were away").
    expect(captureBackgroundResult).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seth',
        type: 'on_behalf_call',
        summary: "Called Doug - Talked to your dad. He's doing great.",
        details: 'Message from Doug: Call me about Sunday',
      })
    );
    // One notification, from the unified result; not a second one from capture.
    expect(pushModule.sendPushNotification).not.toHaveBeenCalled();
  });

  it('reports a missed call plainly, without asking the model', async () => {
    const summarize = vi.fn(report('should not be used'));
    const result = await recordCallFollowthrough(call(), [], 35, { summarize });

    expect(result).toMatchObject({ outcome: 'no_answer', messageForUser: null });
    expect(summarize).not.toHaveBeenCalled();
    expect(rowsIn('on_behalf_calls')[0].data.outcome).toMatchObject({
      status: 'no_answer',
      objectiveAchieved: false,
    });
    expect(captureBackgroundResult).toHaveBeenCalledWith(
      expect.objectContaining({
        details: "I tried Doug, but they didn't pick up. I'll try Doug again tomorrow.",
      })
    );
  });

  it('falls back to a plain report when the summary model fails', async () => {
    const result = await recordCallFollowthrough(call(), turns('Hey', 'Doing fine', 'Bye'), 60, {
      summarize: async () => {
        throw new Error('model down');
      },
    });
    expect(result).toMatchObject({ summary: 'I talked with Doug for you.', messageForUser: null });
    expect(rowsIn('on_behalf_calls')).toHaveLength(1);
  });
});

describe('followthroughCallFromDispatch', () => {
  it('needs a requester to report back to', () => {
    // The shape of the hand-dispatched Doug call on 2026-10-10: no requester.userId.
    const { requester: _r, ...noRequester } = dispatch({ userName: 'Seth' });
    expect(followthroughCallFromDispatch(noRequester)).toBeNull();
  });
});
