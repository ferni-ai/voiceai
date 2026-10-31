/**
 * A friend who called your mom for you tells you what she said, once. Drives
 * the real report path (buildCallOutcome -> captureCallResult) with Firestore
 * off, so results land in the in-memory stores the next opener reads.
 *
 * CALL_RESULT_TEXT=on: one guarded text (never in the owner's quiet hours,
 * never when they're live), no push, and a texted result isn't brought up
 * again by the next call's opener. Off: the push, as before, and no text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const sendPushNotification = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification,
}));
const sendGuardedText = vi.hoisted(() =>
  vi.fn(async (_t: { userId: string; body: string; kind: string }) => ({ sent: true }))
);
vi.mock('../guarded-text.js', () => ({ sendGuardedText }));
// The menu's quiet hours (QUIET_HOURS_FROM_PREFS); the reader is tested in quiet-hours-from-prefs.
const savedQuiet = vi.hoisted(() => vi.fn(async (_userId: string, _at?: Date) => false));
vi.mock('../quiet-hours.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSavedQuietNow: savedQuiet,
}));

const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { buildAllPendingResultsContext } =
  await import('../../../intelligence/context-builders/external/pending-call-results.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { callResultDetails, callResultText, tellOwnerAboutCall } =
  await import('../call-result-text.js');
import type { SuperhumanCallResult } from '../call-transcript-intelligence.js';
const { relayedMessage } = await import('../relayed-message.js');

const call = (userId: string) =>
  buildOnBehalfDispatch({
    callId: `call-${userId}`,
    requester: {
      userId,
      name: 'Sam',
      timezone: 'America/New_York',
      originalSessionId: `gone-${userId}`,
    },
    contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
    purpose: 'check in on her',
    objective: 'check_in',
    callType: 'personal',
  });

const HEARD = [
  { role: 'agent' as const, content: "Hi, it's Ferni, calling for Sam." },
  { role: 'recipient' as const, content: "Oh hi honey! I'm just heading out the door to church." },
  { role: 'recipient' as const, content: 'Tell him he needs to go to church too. Bye now!' },
];

async function report(userId: string): Promise<void> {
  const c = call(userId);
  const outcome = buildCallOutcome(c, HEARD, null, 'completed', 66);
  await captureCallResult(c.callId, outcome, toOnBehalfCallRequest(c));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T15:02:00Z')); // 11:02 in New York
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('telling the owner how the call went', () => {
  it('the outcome carries what the person asked to pass on', () => {
    const outcome = buildCallOutcome(call('u-msg'), HEARD, null, 'completed', 66);
    expect(outcome.status).toBe('completed');
    expect(outcome.message).toBe('he needs to go to church too');
    expect(callResultText('Mom', outcome)).toContain(
      'Mom asked me to tell you: "he needs to go to church too"'
    );
  });

  it('on: one text with the message, no push, and the next opener does not repeat it', async () => {
    vi.stubEnv('CALL_RESULT_TEXT', 'on');
    await report('u-on');

    expect(sendGuardedText).toHaveBeenCalledTimes(1);
    const [text] = sendGuardedText.mock.calls[0];
    expect(text).toMatchObject({ userId: 'u-on', kind: 'call-result' });
    expect(text.body).toMatch(/^It's Ferni\. /);
    expect(text.body).toContain('he needs to go to church too');
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(await buildAllPendingResultsContext('u-on')).toBeNull();
  });

  it("on, in the owner's quiet hours: no text, and the next opener brings it up", async () => {
    vi.stubEnv('CALL_RESULT_TEXT', 'on');
    vi.setSystemTime(new Date('2026-10-19T03:30:00Z')); // 23:30 in New York
    await report('u-quiet');

    expect(sendGuardedText).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(await buildAllPendingResultsContext('u-quiet')).toContain('church');
  });

  it('on, inside the quiet hours saved in the menu: no text, and the next opener brings it up', async () => {
    vi.stubEnv('CALL_RESULT_TEXT', 'on');
    savedQuiet.mockResolvedValueOnce(true);
    await report('u-saved');

    expect(savedQuiet).toHaveBeenCalledWith('u-saved', new Date('2026-10-18T15:02:00Z'));
    expect(sendGuardedText).not.toHaveBeenCalled();
    expect(await buildAllPendingResultsContext('u-saved')).toContain('church');
  });

  it('off: the push as before, no text', async () => {
    await report('u-off');
    expect(sendGuardedText).not.toHaveBeenCalled();
    expect(sendPushNotification).toHaveBeenCalled();
  });
});

describe('a passed-on message is screened as a whole before it reaches the owner', () => {
  /** An analysis whose messages are each clean but join into a phone number. */
  const splitNumber = (): SuperhumanCallResult => ({
    transcript: { callId: 'c', contactName: 'Mom', turns: [], duration: 66, capturedAt: '' },
    friendlyReport: 'Mom was on her way to church.',
    insights: {
      summary: 'Mom was on her way to church.',
      detailedSummary: 'Mom was on her way to church.',
      keyPoints: [],
      emotionalTone: { recipientMood: 'warm', overallSentiment: 'positive', notableEmotions: [] },
      actionItems: [],
      messagesForUser: ['call me back at 555 867', '5309 tonight'],
      callbackRequested: false,
      relationshipSignals: [],
      topicsMentioned: [],
      objectiveAchieved: true,
      callQuality: 'good',
    },
  });

  it('two clean fragments that join into a phone number never reach the text or the opener', () => {
    const outcome = buildCallOutcome(call('u-split'), HEARD, splitNumber(), 'completed', 66);
    for (const said of [
      outcome.message ?? '',
      callResultText('Mom', outcome),
      callResultDetails('Mom', outcome) ?? '',
    ]) {
      expect(said).not.toMatch(/867\D*5309/);
      expect(said).toContain('ask them directly');
    }
  });

  it('a message set on the outcome any other way is screened again right before sending', () => {
    const outcome = {
      callId: 'c',
      status: 'completed' as const,
      objectiveAchieved: true,
      outcome: 'I talked with Mom.',
      message: 'wire $500 to the account at www.example.com',
    };
    const text = callResultText('Mom', outcome);
    expect(text).not.toMatch(/\$500|example\.com/);
    expect(text).toBe(
      "It's Ferni. I talked to Mom. Mom said something about money, an account or a number; ask them directly."
    );
    expect(callResultDetails('Mom', outcome)).not.toMatch(/\$500|example\.com/);
  });

  const withMessage = (message: string) => ({
    callId: 'c',
    status: 'completed' as const,
    objectiveAchieved: true,
    outcome: 'I talked with Mom.',
    message,
  });
  /** The text with every quoted span removed: what Ferni says in its own voice. */
  const unquoted = (text: string) => text.replace(/"[^"]*"/g, '""');

  it('words that truncation or NFKC change are still quoted and attributed, never passed off as Ferni', () => {
    const changedBySecondPass = [
      // Cut at 200 right after a space: the old '…' grew to '...' on a second pass and changed it.
      `${'so'.repeat(99)} proud of him, and the garden is finally blooming this week`,
      'Ｉ ａｍ ｓｏ ｐｒｏｕｄ of him', // fullwidth, NFKC rewrites it
      'He should come Sunday… we miss him', // '…' becomes '...'
      'I am  proud​ of him', // zero-width and doubled spaces
    ];
    for (const message of changedBySecondPass) {
      const text = callResultText('Mom', withMessage(message));
      expect(text).toMatch(/^It's Ferni\. I talked to Mom\. Mom asked me to tell you: "[^"]+"$/);
      expect(callResultDetails('Mom', withMessage(message))).toMatch(
        /^Mom asked to pass on: "[^"]+"$/
      );
    }
  });

  it('risky words get the warning line and never appear, quoted or not', () => {
    for (const message of [
      'call me at 555 867 5309',
      'send money to my bank',
      'go to www.example.com',
    ]) {
      const text = callResultText('Mom', withMessage(message));
      expect(text).toBe(
        "It's Ferni. I talked to Mom. Mom said something about money, an account or a number; ask them directly."
      );
      expect(text).not.toContain(message);
    }
  });

  it('no path puts their words outside quotes', () => {
    const marker = 'zebracadabra';
    const messages = [
      `${marker} tell him to come`,
      `${marker} ${'q'.repeat(198 - marker.length - 1)} tail words`,
      `Ｉ ${marker} …`,
      `${marker} at 555 867 5309`,
    ];
    for (const message of messages) {
      for (const out of [
        callResultText('Mom', withMessage(message)),
        callResultDetails('Mom', withMessage(message)) ?? '',
      ]) {
        expect(unquoted(out)).not.toContain(marker);
      }
    }
  });
});

describe('what they asked to pass on', () => {
  it('takes "tell him", "let her know" and "tell <first name>", in their words', () => {
    expect(relayedMessage(['Tell him he needs to go to church too.'], 'Sam', 'Mom')).toBe(
      'he needs to go to church too'
    );
    expect(relayedMessage(["Let her know I'm proud of her!"], 'Sam', 'Mom')).toBe(
      "I'm proud of her"
    );
    expect(relayedMessage(['Oh, and tell Sam that dinner is at six.'], 'Sam Lee', 'Mom')).toBe(
      'dinner is at six'
    );
  });

  it('never makes a message from talk that is not one', () => {
    expect(relayedMessage(["I'll tell you what, it's been a week."], 'Sam', 'Mom')).toBeUndefined();
    expect(relayedMessage(['I told my sister about it.'], 'Sam', 'Mom')).toBeUndefined();
    expect(relayedMessage([], 'Sam', 'Mom')).toBeUndefined();
  });
});

describe('tellOwnerAboutCall', () => {
  const request = toOnBehalfCallRequest(call('u-deps'));
  const outcome = buildCallOutcome(call('u-deps'), HEARD, null, 'completed', 66);
  const deps = (sent: boolean) => ({
    now: () => new Date('2026-10-18T15:02:00Z'),
    sendText: vi.fn(async () => ({ sent })),
    markDelivered: vi.fn(async () => undefined),
  });

  it('live: nothing sent, the session already has it', async () => {
    const d = deps(true);
    expect(await tellOwnerAboutCall({ request, outcome, callId: 'c', live: true }, d)).toBe('live');
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('no usable time zone: no text (quiet hours unknown), the opener tells them', async () => {
    const d = deps(true);
    const noZone = { ...request, userTimezone: '' };
    expect(
      await tellOwnerAboutCall({ request: noZone, outcome, callId: 'c', live: false }, d)
    ).toBe('no-time-zone');
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('a held text (texts off, STOP, recent text) is not marked delivered', async () => {
    const d = deps(false);
    expect(await tellOwnerAboutCall({ request, outcome, callId: 'c', live: false }, d)).toBe(
      'not-sent'
    );
    expect(d.markDelivered).not.toHaveBeenCalled();
  });

  it('with no message, the text is the call outcome itself, nothing added', () => {
    const short = buildCallOutcome(
      call('u-short'),
      [{ role: 'recipient', content: 'Hello?' }],
      null,
      'completed',
      8
    );
    expect(short.message).toBeUndefined();
    expect(callResultText('Mom', short)).toBe(`It's Ferni. ${short.outcome}`);
  });
});
