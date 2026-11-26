/**
 * CALLBACK_MEANS_ASKED (#4468): a missed call is never reported as "they want a call back".
 * Main set callbackRequired for no answer, a voicemail greeting, a refusal and a lost
 * transcript, and the live report, next-call report and email told the user the person asked
 * to be called back. With the flag on a missed call carries retryOffered and each report says
 * what happened, by name, and offers once to try again; a person who picked up and said no is
 * handed back to the user, never redialled (Seth 11-26: "the most human and natural thing");
 * only the person's own ask (the analysis's callbackRequested) says they asked, and its
 * calendar event is on the user's saved zone.
 *
 * Real paths: buildCallOutcome (lifecycle) / twilioStatusToOutcome -> captureCallResult ->
 * email (fake Gmail transport), calendar, both stores (on_behalf_calls and the
 * background_results copy); liveReportMessage; buildPendingCallResultsContext,
 * buildAllPendingResultsContext (the copy first, as the opener's context reads it) and
 * callReportInjection reading what was stored. Fictional people: Sam (user), Linda (called).
 *
 * The human wording rows (a decline handed back, pronouns, voicemail left, a failed call, a
 * wrong number, a busy line) are in callback-wording.test.ts; both share callback-harness.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallOutcome } from '../../../tools/domains/telephony/types.js';
import type { CallLifecyclePorts } from '../../../agents/outbound-call/on-behalf-call-lifecycle.js';
import type { Call, Payload, Pending } from './callback-harness.js';

const store = await vi.hoisted(async () => (await import('./callback-fake-store.js')).callbackFakeStore()); // prettier-ignore
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => store.db }));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: vi.fn(async () => ({ sent: false })) }));
const calendar = vi.hoisted(() => ({
  createEvent: vi.fn(async (_userId: string, _event: { startTime: Date }) => ({})),
  hasAnyProviderConnected: vi.fn(async () => true),
}));
vi.mock('../../calendar/index.js', () => calendar);
/** Sam's saved time zone, as userTimezone reads it (validated there). */
const saved = vi.hoisted(() => ({ zone: 'America/Los_Angeles' as string | undefined }));
vi.mock('../user-contact.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../user-contact.js')>()),
  getUserContactInfo: vi.fn(async () => (saved.zone ? { timezone: saved.zone } : undefined)),
}));

const { resetToldClaimsForTests } = await import('../call-result-claims.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { callbackOfResult } = await import('../../background-agents/call-follow-up/index.js');
const { createCallbackCalendarEvent } = await import('../callback-calendar-event.js');
const { buildCallOutcome, completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { twilioStatusToOutcome } = await import('../../../servers/api/routes/twilio-call-status.js');
const {
  NOW,
  LINDA,
  SAID_SHE_ASKED,
  OFFER,
  OFFER_HER,
  CHOICE,
  TRY,
  THEM,
  NOBODY,
  count,
  AGENT_ONLY,
  TALKED,
  lindaAsked,
  useCallbackHarness,
} = await import('./callback-harness.js');
const { placed, nextCall, toldSam, twilio, eventStarts } = useCallbackHarness({ store, calendar, saved }); // prettier-ignore

describe('CALLBACK_MEANS_ASKED on', () => {
  it('1. no answer: nobody says Linda asked for a call back, and each report offers once', async () => {
    const at = placed();
    const outcome = buildCallOutcome(at.call, AGENT_ONLY, null);
    expect(outcome).toMatchObject({ status: 'no_answer', retryOffered: true });
    expect(outcome.callbackRequired).toBeUndefined();

    const told = await toldSam(outcome, at);
    // Main's "I called Linda but couldn't reach them. Want me to try again later?" is stored
    // as what happened, by name; each report adds the one offer.
    expect(told.live).toContain(`${LINDA} didn't pick up.`);
    expect(told.live).toContain(OFFER);
    expect(told.email).toContain(`${LINDA} didn't pick up.`);
    expect(told.email).toContain(OFFER_HER); // the email has her saved relationship
    expect(told.next).toContain(`${LINDA} didn't pick up.`);
    expect(told.next).toContain(OFFER);
    expect(told.all).toContain(OFFER); // the copy's summary, then the one line
    // Sam's email and the copy's summary say it once, in Ferni's words: no status line.
    expect(told.email).not.toContain('No answer.');
    expect(told.all).toContain(`${LINDA} didn't pick up.`); // main: "Tried calling Linda - no answer"
    expect(told.all).not.toContain('Tried calling');
    expect(told.report).toContain(`${LINDA} didn't pick up.`);
    for (const surface of ['live', 'email', 'next'] as const)
      expect(count(told[surface], TRY)).toBe(1);
    for (const text of Object.values(told)) {
      expect(text).not.toMatch(SAID_SHE_ASKED);
      expect(text).not.toMatch(NOBODY);
      expect(text).not.toMatch(THEM);
    }
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('1b. a producer still writing the old shape (no_answer + callbackRequired) is told as a retry', async () => {
    const at = placed();
    const outcome: CallOutcome = { callId: at.call.callId, status: 'no_answer', objectiveAchieved: false, outcome: `${LINDA} didn't answer`, callbackRequired: true }; // prettier-ignore
    const told = await toldSam(outcome, at);
    expect(count(told.email, CHOICE)).toBe(1);
    expect(told.email).toContain(`${LINDA} didn't pick up.`); // not "Linda didn't answer"
    expect(told.all).toContain(`${LINDA} didn't pick up.`); // the copy's summary, read back
    for (const text of Object.values(told)) expect(text).not.toMatch(SAID_SHE_ASKED);
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('1c. Twilio no-answer (no offer in its words): every report says what happened and asks once', async () => {
    const at = placed();
    const outcome = twilio({ CallStatus: 'no-answer' }, { callId: 'tw-1c', contactName: LINDA });
    if (!outcome) throw new Error('no outcome');
    const told = await toldSam(outcome, at);
    for (const surface of ['live', 'email', 'next', 'all', 'report'] as const) {
      expect(count(told[surface], CHOICE)).toBe(1);
      expect(told[surface]).toContain(`${LINDA} didn't pick up.`);
      expect(told[surface]).not.toMatch(SAID_SHE_ASKED); // its callbackTime is a retry delay
    }
  });

  it("2. Linda asks for a call back: every report says so, and the event is on Sam's clock", async () => {
    const at = placed();
    const outcome = buildCallOutcome(at.call, TALKED, lindaAsked());
    expect(outcome).toMatchObject({ callbackRequired: true, callbackTime: 'tonight' });
    expect(outcome.retryOffered).toBeUndefined();

    const told = await toldSam(outcome, at);
    // Sam's email says her ask as a friend would, by her saved relationship; Ferni's own
    // context keeps main's words (it is told, not Sam).
    expect(told.email).toContain(`${LINDA} asked you to call her back.`);
    expect(told.email).not.toContain('They mentioned wanting a callback.');
    expect(told.live).toContain('They want a call back.');
    expect(told.next).toContain('They want a callback from the user.');
    expect(told.all).toContain('They want a callback around tonight'); // the copy, read on
    for (const text of Object.values(told)) expect(text).not.toMatch(CHOICE);
    // "tonight": 18:00 in Los Angeles today, not 18:00 UTC (and not main's tomorrow 10:00).
    expect(eventStarts()).toEqual(['2026-11-27T02:00:00.000Z']);
  });

  it("2b. the event reads her hint on Sam's saved zone; none or an invalid one, no event", async () => {
    const la = placed(); // the request still carries the tool's Los Angeles default
    const asked: CallOutcome = { ...buildCallOutcome(la.call, TALKED, lindaAsked()), callbackTime: '3pm' }; // prettier-ignore
    await createCallbackCalendarEvent(la.request, asked, asked.callId, NOW);
    expect(eventStarts()).toEqual(['2026-11-26T23:00:00.000Z']); // 15:00 PST today

    for (const zone of [undefined, 'Pacific Time']) {
      calendar.createEvent.mockClear();
      saved.zone = zone;
      await createCallbackCalendarEvent(la.request, asked, asked.callId, NOW);
      expect(calendar.createEvent).not.toHaveBeenCalled();
    }
  });

  it('2c. "tonight" once 18:00 has passed for Sam (19:30 in Los Angeles): an hour from now', async () => {
    const la = placed();
    const asked = buildCallOutcome(la.call, TALKED, lindaAsked());
    const evening = new Date('2026-11-27T03:30:00Z'); // 19:30 PST on the 26th
    await createCallbackCalendarEvent(la.request, asked, asked.callId, evening);
    expect(eventStarts()).toEqual(['2026-11-27T04:30:00.000Z']);
  });

  it('2d. a clock time wins and the words pick the day', async () => {
    const la = placed();
    const asked = buildCallOutcome(la.call, TALKED, lindaAsked());
    for (const callbackTime of ['tonight at 8pm', 'tomorrow at 3pm'])
      await createCallbackCalendarEvent(la.request, { ...asked, callbackTime }, asked.callId, NOW);
    // 20:00 PST today, 15:00 PST tomorrow
    expect(eventStarts()).toEqual(['2026-11-27T04:00:00.000Z', '2026-11-27T23:00:00.000Z']);
  });

  it.each([
    ['voicemail greeting only', `I got ${LINDA}'s voicemail, but I didn't leave a message.`, (c: Call) => buildCallOutcome(c, TALKED, null, 'voicemail_left', 30, false)], // prettier-ignore
    ['lost transcript', `My call to ${LINDA} didn't go through.`, (c: Call) => buildCallOutcome(c, null, null)], // prettier-ignore
    ['mailbox full', `${LINDA} didn't pick up.`, (c: Call) => buildCallOutcome(c, TALKED, null, 'unreachable')], // prettier-ignore
  ])('3. %s: a retry by name, never "asked" or "them", offered once', async (_n, what, build) => {
    const at = placed();
    const outcome = build(at.call);
    expect(outcome.retryOffered).toBe(true);
    expect(outcome.callbackRequired).toBeUndefined();
    const told = await toldSam(outcome, at);
    for (const text of Object.values(told)) {
      expect(text).not.toMatch(SAID_SHE_ASKED);
      expect(text).not.toMatch(NOBODY);
      expect(text).not.toMatch(THEM);
      expect(text).not.toMatch(/\bleft a (?:warm )?message/); // the voicemail evidence rule
    }
    for (const surface of ['live', 'email', 'next'] as const) {
      expect(told[surface]).toContain(what);
      expect(count(told[surface], TRY)).toBe(1);
    }
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('5. a result stored before the split reads by its status; no status is no ask', async () => {
    const at = placed();
    const old = (callId: string, status?: CallOutcome['status']) =>
      store.docs.set(`bogle_users/${at.userId}/on_behalf_calls/${callId}`, {
        request: { contactName: LINDA },
        outcome: { callId, status, objectiveAchieved: false, outcome: `Called ${LINDA}.`, callbackRequired: true }, // prettier-ignore
        capturedAt: NOW.toISOString(),
      });
    old('old-missed', 'no_answer');
    const missed = await nextCall(at.userId, 'old-missed');
    // Read in Ferni's words, whatever the old record said ("Called Linda.").
    expect(missed.next).toContain(`${LINDA} didn't pick up.`);
    expect(missed.next).toContain(OFFER);
    expect(missed.report).toContain(OFFER);
    for (const text of Object.values(missed)) expect(text).not.toMatch(SAID_SHE_ASKED);

    store.docs.clear();
    old('old-unknown');
    expect((await nextCall(at.userId, 'old-unknown')).next).not.toMatch(SAID_SHE_ASKED);

    store.docs.clear();
    old('old-reached', 'completed'); // someone picked up: it may have been their ask
    const reached = await nextCall(at.userId, 'old-reached');
    expect(reached.next).toContain('They want a callback from the user.');
    // No copy, so the report reads the record: an answered call is not "Couldn't connect".
    expect(reached.report).toContain(`Picked up: Called ${LINDA}.`);
    store.docs.clear();
    resetToldClaimsForTests(); // a fresh call: the one above was told once already
    old('old-reached-off', 'completed');
    vi.stubEnv('CALLBACK_MEANS_ASKED', 'off');
    expect((await nextCall(at.userId, 'old-reached-off')).report).toContain(
      `Couldn't connect: Called ${LINDA}.` // main's label, word for word
    );
  });

  it.each([
    ['written off (API server), read on (agent)', 'off', 'on'],
    ['written on, read off', 'on', 'off'],
  ])('6. Twilio no-answer %s, both stores: never asked', async (_n, write, read) => {
    vi.stubEnv('CALLBACK_MEANS_ASKED', write);
    const at = placed();
    const outcome = twilio({ CallStatus: 'no-answer' }, { callId: `tw-${write}`, contactName: LINDA }); // prettier-ignore
    if (!outcome) throw new Error('no outcome');
    await captureCallResult(outcome.callId, outcome, at.request);
    const stored = [...store.docs.keys()].filter((k) => k.startsWith(`bogle_users/${at.userId}/`));
    expect(stored.filter((k) => k.includes('/on_behalf_calls/'))).toHaveLength(1);
    expect(stored.filter((k) => k.includes('/background_results/'))).toHaveLength(1);

    vi.stubEnv('CALLBACK_MEANS_ASKED', read);
    const told = await nextCall(at.userId, outcome.callId);
    for (const text of Object.values(told)) {
      expect(text).not.toMatch(SAID_SHE_ASKED);
      expect(text).toContain(OFFER);
    }
    // Read on, the record is in Ferni's words whichever process wrote it.
    if (read === 'on') expect(told.next).toContain(`${LINDA} didn't pick up.`);
  });

  it('6b. a copy and record from before callFollowUp, read on: never "they want a callback"', async () => {
    const at = placed();
    const base = `bogle_users/${at.userId}`;
    const missed = { status: 'no_answer', objectiveAchieved: false, outcome: `${LINDA} didn't answer`, callbackRequired: true, callbackTime: 'in 30 minutes' }; // prettier-ignore
    store.docs.set(`${base}/on_behalf_calls/old-1`, { request: { contactName: LINDA }, outcome: { callId: 'old-1', ...missed }, capturedAt: NOW.toISOString() }); // prettier-ignore
    store.docs.set(`${base}/background_results/bg-old`, { id: 'bg-old', userId: at.userId, type: 'on_behalf_call', status: 'partial_success', summary: `Tried calling ${LINDA} - no answer`, priority: 'high', initiatedBy: 'ferni', contactName: LINDA, requiresCallback: true, callbackTime: 'in 30 minutes', actionItems: [], delivered: false, relatedTaskId: 'old-1', capturedAt: NOW.toISOString() }); // prettier-ignore
    const told = await nextCall(at.userId, 'old-1');
    for (const text of Object.values(told)) {
      expect(text).not.toMatch(SAID_SHE_ASKED);
      expect(text).toContain(OFFER);
    }
    expect(told.next).toContain(`${LINDA} didn't pick up.`); // not "Linda didn't answer"
    // The rule the opener's fallback reads too: an old copy alone is a retry, not an ask.
    expect(callbackOfResult({ type: 'on_behalf_call', requiresCallback: true })).toEqual({ asked: false, retry: true }); // prettier-ignore
  });
});

describe('CALLBACK_MEANS_ASKED off: as on main', () => {
  beforeEach(() => vi.stubEnv('CALLBACK_MEANS_ASKED', 'off'));

  it("4. the same inputs give main's results, words and server-clock event", async () => {
    const at = placed();
    const outcome = buildCallOutcome(at.call, AGENT_ONLY, null);
    expect(outcome).toEqual({
      callId: at.call.callId,
      status: 'no_answer',
      objectiveAchieved: false,
      outcome: `I called ${LINDA} but couldn't reach them. Want me to try again later?`,
      callbackRequired: true,
    });
    expect(buildCallOutcome(at.call, TALKED, null, 'refused').outcome).toBe(
      `${LINDA} picked up but didn't want to talk with me. It might be better coming from you.`
    );
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const no = [...AGENT_ONLY, { role: 'recipient' as const, content: 'No thank you.' }];
    expect(buildCallOutcome(at.call, no, null, undefined, 30).outcome).toBe(
      `I reached ${LINDA}, but they didn't want to talk.`
    );
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'off');
    for (const build of [
      () => buildCallOutcome(at.call, TALKED, null, 'refused'),
      () => buildCallOutcome(at.call, TALKED, null, 'voicemail_left', 30, false),
      () => buildCallOutcome(at.call, null, null),
    ]) {
      expect(build()).toMatchObject({ callbackRequired: true });
      expect(build()).not.toHaveProperty('retryOffered');
    }

    const told = await toldSam(outcome, at);
    expect(told.live).toContain('They want a call back.');
    expect(told.email).toContain('They mentioned wanting a callback.');
    expect(told.next).toContain('They want a callback from the user.');
    expect(told.all).toMatch(SAID_SHE_ASKED); // main's copy line, "⚠️ They want a callback"
    for (const text of Object.values(told)) expect(text).not.toMatch(CHOICE);
    expect(told.next).toContain(outcome.outcome); // main's words, stored and read as written
    expect(told.email).toContain(`I tried calling ${LINDA} but couldn't get through. No answer.`);
    expect(told.all).toContain(`Tried calling ${LINDA} - no answer`); // main's copy summary
    const serverAt = (days: number, hour: number): string => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    expect(eventStarts()).toEqual([serverAt(1, 10)]);

    // Off, the words win and "tonight" is not read: main's tomorrow 10:00 for both.
    calendar.createEvent.mockClear();
    saved.zone = undefined; // and no zone is needed
    const asked = buildCallOutcome(at.call, TALKED, lindaAsked());
    for (const callbackTime of ['tonight', 'tomorrow at 3pm'])
      await createCallbackCalendarEvent(at.request, { ...asked, callbackTime }, asked.callId, NOW);
    expect(eventStarts()).toEqual([serverAt(1, 10), serverAt(1, 10)]);
  });
});

/**
 * The flag-on twins of the old suites' callbackRequired assertions (lifecycle, followthrough,
 * voicemail-honest, call-on-behalf-e2e), which keep pinning main's shape with the flag off.
 */
describe('CALLBACK_MEANS_ASKED on: every missed-call producer writes retryOffered', () => {
  it.each([
    ['no-answer', { CallStatus: 'no-answer' }],
    ['busy', { CallStatus: 'busy' }],
    ['failed', { CallStatus: 'failed' }],
    ['a machine answered', { CallStatus: 'completed', AnsweredBy: 'machine_start' }],
  ])('Twilio %s', (_name, fields) => {
    const outcome = twilio(fields);
    expect(outcome?.retryOffered).toBe(true);
    expect(outcome).not.toHaveProperty('callbackRequired', true);
  });

  it('the agent never joined', () => {
    const outcome = twilioStatusToOutcome({ CallSid: 'CA-1', To: '+15555550100', Direction: 'outbound-api', CallStatus: 'completed' } as Payload, { callId: 'tw-1', contactName: LINDA, dispatchFailed: true } as Pending); // prettier-ignore
    expect(outcome).toStrictEqual({ callId: 'tw-1', status: 'failed', objectiveAchieved: false, outcome: `Ferni couldn't connect the call to ${LINDA}`, retryOffered: true }); // prettier-ignore
  });

  it('CALL_FOLLOWTHROUGH: a scheduled retry clears the offer; none scheduled keeps it', async () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const ports = (retryAt: Date | null): CallLifecyclePorts => ({
      readDisposition: () => undefined,
      readTranscript: () => [],
      analyze: async () => null,
      report: async () => undefined,
      scheduleRetry: async () => retryAt,
    });
    const retried = await completeOnBehalfCall('s-r', placed().call, 40, true, ports(NOW));
    expect(retried).toMatchObject({ status: 'no_answer', retryOffered: false });
    // In Ferni's words before the promise: never "couldn't reach them".
    expect(retried?.outcome).toBe(`${LINDA} didn't pick up. I'll try again tomorrow.`);
    expect(retried?.callbackRequired).toBeUndefined();
    const notRetried = await completeOnBehalfCall('s-n', placed().call, 40, true, ports(null));
    expect(notRetried).toMatchObject({ status: 'no_answer', retryOffered: true });
    expect(notRetried?.outcome).toBe(`${LINDA} didn't pick up.`);
    expect(notRetried?.callbackRequired).toBeUndefined();
  });
});
