/**
 * How I reach you, "Ferni can reach out" off: every sender, through the real code on the
 * Firestore emulator (Seth, 2026-10-25). What Ferni starts on its own (check-ins, follow-ups,
 * its own calls, the milestone email) doesn't go. Reminders the person set, calls they asked
 * for (now or held for call hours) and anything asked for just now still go. Someone else's
 * number, and a member who hasn't paused, are as before.
 *
 * Every sink is stubbed (Twilio, outbound fetch, the SMS send, emailUser): nothing leaves.
 * Adapted from the #2827 verifier's probes (v2827-pause-senders*.emulator.test.ts), which
 * found reminder calls, proactive calls, on-behalf texts to their own number and the
 * milestone email going out while paused.
 */
import { describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb; these senders read the real ones.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
const twilioCalls: unknown[] = [];
vi.mock('twilio', () => {
  const client = () => ({
    calls: {
      create: vi.fn(async (o: unknown) => {
        twilioCalls.push(o);
        return { sid: 'CAtest', status: 'queued' };
      }),
    },
    messages: { create: vi.fn(async () => ({ sid: 'SMtest' })) },
  });
  return { default: Object.assign(client, { Twilio: client }), Twilio: client };
});

const push = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../services/outreach/delivery/push-notifications.js', () => ({
  sendPushNotification: push,
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-reach-out-senders';
process.env.LOG_HASH_SECRET = 'reach-out-senders-test-not-a-secret';
process.env.TWILIO_ACCOUNT_SID = 'ACtest0000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'test-not-a-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000001';
delete process.env.CARTESIA_API_KEY;

/** Outbound HTTP other than the emulator, recorded and answered here (Twilio's REST calls). */
const fetches: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url);
  if (/127\.0\.0\.1|localhost/.test(u)) return realFetch(url as never, init);
  fetches.push(`${init?.method ?? 'GET'} ${u}`);
  return new Response(JSON.stringify({ sid: 'CAtest', status: 'queued' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
const twilioCallFetches = () => fetches.filter((f) => /Calls/.test(f)).length;

const rid = () => Math.random().toString(36).slice(2, 10);
const phone = () => `+1555${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;

/** A member with a verified phone, texts, calls and email on, and outreach on or paused. */
async function member(paused: boolean, channels = ['sms', 'voice_call', 'email']) {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const uid = `reach-${rid()}`;
  const own = phone();
  await getFirestoreDb()!
    .collection('bogle_users')
    .doc(uid)
    .set({
      linkedIdentifiers: [`phone:${own}`],
      outreachPreferences: { enabled: !paused, channels },
    });
  return { uid, own };
}

async function textDeps() {
  const { defaultTextDeps } = await import('../../services/outreach/guarded-text.js');
  const send = vi.fn(async () => ({ success: true }) as never);
  const deps = {
    ...defaultTextDeps(),
    send,
    authPhone: async () => undefined,
    now: () => new Date('2026-10-21T18:00:00Z'), // 2pm in New York: no quiet hours
  };
  return { deps, send };
}

describe.skipIf(!emulator)('"Ferni can reach out" off: Ferni\'s own waits; yours goes', () => {
  it('the text sender: Ferni-started is refused; asked-now and a reminder they set go', async () => {
    const { sendGuardedText } = await import('../../services/outreach/guarded-text.js');
    const kinds = [
      { why: 'ferni-started', extra: {}, exempt: false },
      { why: 'asked now', extra: { askedNow: true }, exempt: true },
      { why: 'reminder they set', extra: { personSet: true }, exempt: true },
    ];
    for (const paused of [true, false]) {
      for (const k of kinds) {
        const { uid } = await member(paused);
        const { deps, send } = await textDeps();
        const t = {
          userId: uid,
          body: 'hi',
          kind: 'message',
          refId: rid(),
          minGapMs: 1,
          ...k.extra,
        };
        const refused = paused && !k.exempt;
        const out = await sendGuardedText(t as never, deps as never);
        expect(out, `paused=${paused} ${k.why}`).toEqual(
          refused ? { sent: false, reason: 'sms-off' } : { sent: true }
        );
        expect(send).toHaveBeenCalledTimes(refused ? 0 : 1);
      }
    }
  });

  it('texts switched off still stop a reminder and an asked-now text', async () => {
    const { sendGuardedText } = await import('../../services/outreach/guarded-text.js');
    for (const extra of [{ askedNow: true }, { personSet: true }]) {
      const { uid } = await member(false, ['voice_call']);
      const { deps, send } = await textDeps();
      const t = { userId: uid, body: 'hi', kind: 'message', refId: rid(), minGapMs: 1, ...extra };
      expect(await sendGuardedText(t as never, deps as never)).toEqual({
        sent: false,
        reason: 'sms-off',
      });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('a reminder text they set goes out while paused (it went to the app before)', async () => {
    const { guardReminderText } = await import('../../services/outreach/reminder-texts.js');
    const { sendGuardedText, sendOnBehalfText } =
      await import('../../services/outreach/guarded-text.js');
    for (const paused of [true, false]) {
      const { uid, own } = await member(paused);
      const { deps, send } = await textDeps();
      const reminder = {
        id: `rem-${rid()}`,
        userId: uid,
        deliveryMethod: 'sms',
        deliveryAddress: own,
        message: 'take the pills',
        timezone: 'America/New_York',
      };
      const r = { text: deps, sendOwn: sendGuardedText, sendOther: sendOnBehalfText };
      expect(await guardReminderText(reminder as never, r as never), `paused=${paused}`).toBe(
        'sent'
      );
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  it('a reminder call they set rings while paused', async () => {
    const { deliverReminderOutcome } =
      await import('../../services/scheduling/reminder-scheduler.js');
    for (const paused of [true, false]) {
      const { uid, own } = await member(paused);
      fetches.length = 0;
      const reminder = {
        id: `rem-${rid()}`,
        userId: uid,
        deliveryMethod: 'call',
        deliveryAddress: own,
        message: 'take the pills',
        scheduledFor: new Date(),
        timezone: 'America/New_York',
        status: 'pending',
        personaId: 'ferni',
      };
      expect(await deliverReminderOutcome(reminder as never), `paused=${paused}`).toBe('sent');
      expect(twilioCallFetches()).toBe(1);
    }
  });

  it("a persona-voice call to their own number: Ferni's own is refused while paused; one they asked for rings", async () => {
    const { callWithPersonaVoice, PAUSED_CALL } =
      await import('../../services/voice/voice-call.js');
    for (const paused of [true, false]) {
      for (const askedFor of [false, true]) {
        const { uid, own } = await member(paused);
        fetches.length = 0;
        const out = await callWithPersonaVoice(own, 'hi', 'ferni', {
          ownerUid: uid,
          userId: uid,
          askedFor,
        });
        const refused = paused && !askedFor;
        expect(out.success, `paused=${paused} askedFor=${askedFor}`).toBe(!refused);
        if (refused) expect(out.message).toBe(PAUSED_CALL);
        expect(twilioCallFetches()).toBe(refused ? 0 : 1);
      }
    }
  });

  it("a persona-voice call to someone else isn't the member's to pause", async () => {
    const { callWithPersonaVoice } = await import('../../services/voice/voice-call.js');
    const outcomes: unknown[] = [];
    for (const paused of [true, false]) {
      const { uid } = await member(paused);
      fetches.length = 0;
      const out = await callWithPersonaVoice(phone(), 'hi', 'ferni', {
        ownerUid: uid,
        userId: uid,
      });
      outcomes.push({ success: out.success, calls: twilioCallFetches() }); // the message names the number
    }
    expect(outcomes[0]).toEqual(outcomes[1]);
  });

  it('a proactive call: Ferni\'s own is refused while paused; "call me" now, or held for call hours, rings', async () => {
    const { scheduleProactiveCall } =
      await import('../../services/outreach/conversational-calls.js');
    const { asOwnCallMe } = await import('../../services/outreach/held-call.js');
    const kinds = ['ferni-started', 'call me now', 'call me, held for call hours'] as const;
    for (const paused of [true, false]) {
      for (const kind of kinds) {
        const { uid, own } = await member(paused);
        twilioCalls.length = 0;
        fetches.length = 0;
        const request = {
          userId: uid,
          phoneNumber: own,
          message: 'hi',
          ssml: '<speak>hi</speak>',
          personaId: 'ferni',
          reason: 'user_requested_call',
          // a deferral of their own "call me", as executeDueDeferredCalls re-reads it
          ...(kind === 'call me, held for call hours' && { askedFor: true }),
        };
        const out = await scheduleProactiveCall(
          kind === 'call me now' ? asOwnCallMe(request) : request
        );
        const refused = paused && kind === 'ferni-started';
        expect(out.success, `paused=${paused} ${kind}`).toBe(!refused);
        if (refused) expect(out.error).toBe('Not calling: outreach paused');
        expect(twilioCalls.length + twilioCallFetches()).toBe(refused ? 0 : 1);
      }
    }
  });

  it("Ferni's own scheduled thinking-of-you isn't delivered while paused", async () => {
    const { deliverOutreach } = await import('../../services/outreach/proactive-scheduler.js');
    for (const paused of [true, false]) {
      const { uid } = await member(paused);
      push.mockClear();
      const outreach = {
        id: `o-${rid()}`,
        userId: uid,
        type: 'thinking_of_you',
        message: 'thinking of you',
        scheduledFor: new Date(),
        context: {},
        priority: 'low',
        status: 'pending',
        createdAt: new Date(),
      };
      expect(await deliverOutreach(outreach as never), `paused=${paused}`).toBe(!paused);
      expect(push).toHaveBeenCalledTimes(paused ? 0 : 1);
    }
  });

  it('a text through the someone-else sender is the same paused or not (they asked for it)', async () => {
    const { textOnBehalf } = await import('../../services/outreach/guarded-text.js');
    for (const toOwn of [true, false]) {
      const outcomes: unknown[] = [];
      for (const paused of [true, false]) {
        const { uid, own } = await member(paused);
        const { deps, send } = await textDeps();
        const t = { senderUserId: uid, toPhone: toOwn ? own : phone(), body: 'hi', refId: rid() };
        const out = await textOnBehalf(t, deps as never);
        outcomes.push({ out, sends: send.mock.calls.length });
      }
      expect(outcomes[0], `toOwn=${toOwn}`).toEqual(outcomes[1]);
    }
  });

  it('the milestone email: never while paused, and only with email turned on', async () => {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const { sendMilestoneOutreach } = await import('../milestone-outreach-route.js');
    const cases = [
      { paused: true, channels: ['email'], emails: 0, reason: 'outreach-paused' },
      { paused: false, channels: [], emails: 0 },
      { paused: false, channels: ['email'], emails: 1 },
    ];
    for (const c of cases) {
      const { uid } = await member(c.paused, c.channels);
      const conv = getFirestoreDb()!.collection('bogle_users').doc(uid).collection('conversations');
      await conv.doc('c1').set({
        startedAt: new Date(Date.now() - 3600e3).toISOString(),
        endedAt: new Date(Date.now() - 3000e3).toISOString(),
        turnCount: 10,
        userTurnCount: 5,
      });
      const emailUser = vi.fn(async () => ({ success: true }));
      const textUser = vi.fn(async () => ({ success: false }));
      let body = '';
      const res = {
        writeHead() {},
        setHeader() {},
        end: (b: string) => (body = b),
      } as never;
      const input = {
        milestoneId: 'first-hello',
        milestoneName: 'First hello',
        milestoneMessage: 'hi',
      };
      const getContactInfo = async () => ({ email: 'member@example.test' });
      await sendMilestoneOutreach(res, uid, input, { getContactInfo, emailUser, textUser });
      expect(emailUser, JSON.stringify(c)).toHaveBeenCalledTimes(c.emails);
      if (c.reason) expect(JSON.parse(body)).toMatchObject({ sent: false, reason: c.reason });
    }
  });
});
