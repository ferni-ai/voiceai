/**
 * CALLBACK_MEANS_ASKED (#4468), flag on: every result line this PR rewrites says what a friend
 * would say (Seth 11-26: "the most human and natural thing; it should never feel like AI").
 * A person who picked up and said no is handed back, never redialled (with a crisis in her
 * words, the crisis line leads and there is no hand-back); her pronoun comes only
 * from her saved relationship; a voicemail Ferni left, a failed call and a busy line are told
 * by name, once; a wrong number keeps its own words; and an answered call is never filed as
 * "couldn't connect". Real paths and the shared fakes as in callback-means-asked.test.ts
 * (callback-harness.ts). Fictional people: Sam (user), Linda (called).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CallOutcome } from '../../../tools/domains/telephony/types.js';
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

const { askedLine, declinedWords, retryOfferLine } =
  await import('../../background-agents/call-follow-up/index.js');
const { crisisCallerLine } = await import('../caller-text.js');
const { buildCallOutcome, completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { twilioStatusToOutcome } = await import('../../../servers/api/routes/twilio-call-status.js');
const {
  NOW,
  LINDA,
  HANDED_BACK,
  SAID_SHE_ASKED,
  OFFER,
  CHOICE,
  TRY,
  count,
  AGENT_ONLY,
  TALKED,
  send,
  useCallbackHarness,
} = await import('./callback-harness.js');
const { placed, toldSam, twilio } = useCallbackHarness({ store, calendar, saved });

describe('CALLBACK_MEANS_ASKED on: in the words a friend would use', () => {
  it.each([
    ['Ferni hung up on a no (refused)', (c: Call) => buildCallOutcome(c, TALKED, null, 'refused')],
    ['she said no thanks', (c: Call) => buildCallOutcome(c, [...AGENT_ONLY, { role: 'recipient', content: 'No thank you.' }], null, undefined, 30)], // prettier-ignore
  ])('3b. %s: handed back like a friend would, no redial offered anywhere', async (_n, build) => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on'); // the heard-decline path reads her words with it
    const at = placed();
    const outcome = build(at.call);
    expect(outcome).toMatchObject({ status: 'completed', outcome: HANDED_BACK });
    expect(outcome).not.toHaveProperty('retryOffered', true);
    expect(outcome).not.toHaveProperty('callbackRequired', true);
    const told = await toldSam(outcome, at);
    for (const surface of ['live', 'email', 'next', 'report'] as const)
      expect(told[surface]).toContain(HANDED_BACK);
    // She answered: Ferni's context never files it as a failed connection (row 5: the report).
    expect(told.next).toContain('📞 **Picked up**: I got hold of Linda');
    expect(told.next).not.toContain("Couldn't connect");
    for (const text of Object.values(told)) {
      expect(text).not.toMatch(/try (?:her |again)/i);
      expect(text).not.toMatch(CHOICE);
      expect(text).not.toMatch(SAID_SHE_ASKED);
    }
    // The web's "Action needed" reads the copy's priority: a no is not the owner's to decide.
    const copy = [...store.docs].find(([k]) => k.includes('/background_results/'))?.[1];
    expect(copy).toMatchObject({ priority: 'normal', requiresCallback: false });
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('3c. a hand-back uses her pronoun only from the saved relationship, else her name', () => {
    const say = (relationship?: string) => declinedWords({ name: LINDA, relationship }, 'refused');
    expect(say('mother')).toBe(HANDED_BACK);
    for (const relationship of [undefined, 'friend', "mom's friend"])
      expect(say(relationship)).toBe(`I got hold of ${LINDA}, but it wasn't a good time. ${LINDA} might like hearing from you directly.`); // prettier-ignore
    expect(declinedWords({ name: 'Doug', relationship: 'dad' }, 'opted_out')).toBe(
      "I got hold of Doug, who asked me not to call again, so I won't. He might like hearing from you directly." // prettier-ignore
    );
    const missed = { status: 'no_answer', retryOffered: true };
    expect(retryOfferLine({ name: 'Doug', relationship: 'father' }, missed, '')).toBe(
      'Want me to try him again later, or would you rather call him yourself?'
    );
    expect(retryOfferLine({ name: LINDA }, missed, '')).toBe(OFFER);
    expect(retryOfferLine({}, missed, '')).toBe('Want me to try again later?');
    expect(askedLine({ name: 'Doug', relationship: 'dad' }, 'main')).toBe(
      'Doug asked you to call him back.'
    );
    expect(askedLine({ name: LINDA }, 'main')).toBe(`${LINDA} asked you to call back.`);
  });

  it('3g. a no with a crisis in it: the crisis line leads and nothing hands the call back', () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on'); // the heard decline and opt-out read her words with it
    const call = placed().call;
    const crisis = crisisCallerLine(LINDA);
    const heard = (last: string) => [...AGENT_ONLY, ...['Hi.', 'Honestly I want to die some days.', last].map((content) => ({ role: 'recipient' as const, content }))]; // prettier-ignore
    const said = (last: string) =>
      buildCallOutcome(call, heard(last), null, undefined, 120).outcome;
    expect(said('And stop calling me.')).toBe(`${crisis} I got hold of ${LINDA}, who asked me not to call again, so I won't.`); // prettier-ignore
    expect(said('No thank you.')).toBe(`${crisis} I got hold of ${LINDA}, but it wasn't a good time for her.`); // prettier-ignore
    vi.stubEnv('CALLBACK_MEANS_ASKED', 'off'); // main's words, the crisis line after them
    expect(said('And stop calling me.')).toBe(`I reached ${LINDA}, but they didn't want to talk and asked not to be called again, so I won't call them. ${crisis}`); // prettier-ignore
  });

  it('3f. a voicemail Ferni left: what a friend would say, not main\'s "letting them know"', async () => {
    const at = placed();
    const outcome = buildCallOutcome(at.call, TALKED, null, 'voicemail_left', 30, true);
    expect(outcome).toMatchObject({ status: 'voicemail', voicemailLeft: true });
    const told = await toldSam(outcome, at);
    const left = `I got ${LINDA}'s voicemail, so I left a warm message from you.`;
    for (const surface of ['live', 'email', 'next', 'all'] as const)
      expect(told[surface]).toContain(left);
    for (const text of Object.values(told)) {
      expect(text).not.toContain('letting them know');
      expect(text).not.toMatch(CHOICE); // a message was left: nothing to try again
    }
  });

  it('3h. a voicemail retried tomorrow: "I\'ll try again tomorrow" reaches every report', async () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const at = placed();
    const greeting = [{ role: 'recipient' as const, content: "Hi, you've reached Linda. Leave a message after the tone." }]; // prettier-ignore
    const retried = await completeOnBehalfCall('s-3h', at.call, 30, true, {
      readDisposition: () => undefined,
      readTranscript: () => greeting,
      analyze: async () => null,
      report: async () => undefined,
      scheduleRetry: async () => NOW,
    });
    const once = `I got ${LINDA}'s voicemail, but I didn't leave a message. I'll try again tomorrow.`;
    expect(retried).toMatchObject({ status: 'voicemail', voicemailLeft: false, outcome: once });
    if (!retried) throw new Error('no outcome');
    const told = await toldSam(retried, at); // captured and read again: said once, kept whole
    for (const surface of ['live', 'email', 'next'] as const) expect(told[surface]).toContain(once);
    for (const text of Object.values(told)) expect(text).not.toMatch(CHOICE); // retry is booked
  });

  it('3d. a failed call is "my call didn\'t go through", never a status or a carrier error', async () => {
    const failed = twilio({ CallStatus: 'failed', ErrorMessage: 'SIP 503 from carrier' }, { callId: 'tw-3d', contactName: LINDA }); // prettier-ignore
    const never = twilioStatusToOutcome({ CallSid: 'CA-2', To: '+15555550100', Direction: 'outbound-api', CallStatus: 'completed' } as Payload, { callId: 'tw-3d2', contactName: LINDA, dispatchFailed: true } as Pending); // prettier-ignore
    for (const outcome of [failed, never]) {
      if (!outcome) throw new Error('no outcome');
      send.mockClear();
      const told = await toldSam(outcome, placed());
      for (const surface of ['live', 'email', 'next'] as const) {
        expect(told[surface]).toContain(`My call to ${LINDA} didn't go through.`);
        expect(count(told[surface], TRY)).toBe(1);
      }
      for (const text of Object.values(told))
        expect(text).not.toMatch(/SIP 503|couldn't connect the call|Call to Linda failed/);
    }
  });

  it('3e. a wrong number keeps its own words: only a call Ferni can try again is reworded', async () => {
    const at = placed();
    const outcome = buildCallOutcome(at.call, TALKED, null, 'wrong_number');
    expect(outcome).toMatchObject({ status: 'failed', callbackRequired: false });
    const told = await toldSam(outcome, at);
    for (const surface of ['live', 'email', 'next'] as const) {
      expect(told[surface]).toContain('reached someone else');
      expect(told[surface]).not.toContain("didn't go through");
    }
  });

  it("a busy line: Sam's email says it once, by name, with no status line", async () => {
    const told = await toldSam(twilio({ CallStatus: 'busy' }) as CallOutcome);
    expect(told.email).toContain(`${LINDA}'s line was busy.`);
    expect(told.email).not.toContain('but the line was busy'); // main's status line
    expect(told.all).not.toContain('line busy'); // main's copy summary
  });
});
