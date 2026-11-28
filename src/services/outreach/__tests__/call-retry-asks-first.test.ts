/**
 * CALL_RETRY_ASKS_FIRST (owner, 2026-11-26): a missed call is never redialled on Ferni's own;
 * the signed retry waits as an offer for the owner's yes, then rings the next morning where the
 * CALLEE is, with the first call's whole reason. Flag off: main's retry. Real dispatch, offer
 * store (via its port), accept and placement on a fake Firestore. Fictional: Sam, Rosa.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';
import type { MissedCallOffers } from '../../../tools/domains/telephony/index.js';

let rows: Row[] = [];
const initiateCall = vi.fn(async (_request: unknown) => 'onbehalf_retry');

/** The fake, plus `where('field', '==', v).get()` on a user's own subcollection. */
function firestore() {
  const db = fakeFirestore(rows);
  const userDoc = (uid: string) => {
    const user = db.collection().doc(uid);
    return {
      ...user,
      collection: (sub: string) => ({
        ...user.collection(sub),
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => {
            const docs = rows
              .filter((r) => r.userId === uid && r.collection === sub && r.data[field] === value)
              .map((r) => ({ id: r.id, data: () => r.data }));
            return { docs, size: docs.length, empty: docs.length === 0 };
          },
        }),
      }),
    };
  };
  return {
    ...db,
    collection: (c?: string) => (!c || c === 'bogle_users' ? { doc: userDoc } : db.collection(c)),
  };
}

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => firestore() }));
vi.mock('../../messaging/consent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../messaging/consent.js')>()),
  consentBlocks: async () => false,
}));
vi.mock('../guarded-text.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guarded-text.js')>()),
  isOwnVerifiedPhone: async () => false,
}));
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: vi.fn(),
  onFollowUpActionChange: vi.fn(),
}));
// The port as installed (still installed for real): the find and accept retryMissedCall reaches.
const port = vi.hoisted(() => ({ installed: undefined as MissedCallOffers | undefined }));
vi.mock('../../../tools/domains/telephony/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../tools/domains/telephony/index.js')>();
  const set = (next?: MissedCallOffers) => real.setMissedCallOffersPort((port.installed = next));
  return { ...real, setMissedCallOffersPort: set };
});

const retry = await import('../call-retry.js');
const { installMissedCallOffersPort } = await import('../call-retry-offer.js');
installMissedCallOffersPort();
const { find: findCallRetryOffer, accept: acceptCallRetry } = port.installed!;
const {
  callBackgroundOf,
  callPreferencesOf,
  keepPreferencesForRetry,
  onBehalfDispatchFor,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
  VERIFIED_CALL_TTL_MS,
} = await import('../on-behalf-dispatch.js');
const { retryCallConfirm, retryMissedCall } =
  await import('../../../tools/domains/telephony/call-retry-tool.js');
const { completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');

// 03:30 in Berlin (the server), 21:30 the evening before in New York, 18:30 in Los Angeles.
const NOW = new Date('2026-11-26T02:30:00.000Z');
const NY = '+12125550147';
const LA = '+13105550188';
const NO_ZONE = '+15005550123'; // a valid +1 number whose area code (500) has no zone

const firstRequest = (
  phone = NY,
  extra: Partial<OnBehalfCallRequest> = {}
): OnBehalfCallRequest => ({
  contactQuery: 'Rosa',
  resolvedContact: { name: 'Rosa', phone, relationship: 'sister' },
  purpose: 'ask whether she can pick up the cake on Saturday',
  objective: 'deliver_message',
  callType: 'personal',
  originalSessionId: 'sess-sam',
  originalRoomName: 'room-sam',
  originalRoomSid: 'RM_sam',
  userId: 'user-sam',
  userTimezone: 'America/Chicago',
  userName: 'Sam',
  callingPersonaId: 'ferni',
  userPreferences: {
    additionalContext: 'the bakery closes at 5',
    preferredTimes: ['Saturday'],
    constraints: ['not during her shift'],
  },
  recordingConsent: false,
  ...extra,
});

/** The first call as the job holds it: signed, parsed, and its words kept (metadata-parser.ts). */
function firstCall(phone = NY, extra: Partial<OnBehalfCallRequest> = {}) {
  const sent = signOnBehalfDispatch(
    onBehalfDispatchFor('call-rosa-1', firstRequest(phone, extra), 'Hi Rosa, it is Ferni.')
  );
  const raw = JSON.stringify(sent);
  const call = parseOnBehalfDispatch(JSON.parse(raw))!;
  keepPreferencesForRetry(call.callId, raw);
  return { sent, call };
}
const THE_WORDS = {
  additionalContext: 'the bakery closes at 5',
  preferredTimes: ['Saturday'],
  constraints: ['not during her shift'],
};

const of = (collection: string) => rows.filter((r) => r.collection === collection);
const offerRow = () => of('call_retry_offers')[0];
const scheduledFor = () =>
  of('scheduled_outreach').map((r) => (r.data.scheduledFor as Date).toISOString());
const localHour = (at: Date, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at)
  );
const flags = (asksFirst: 'on' | 'off') => {
  vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
  vi.stubEnv('CALL_RETRY_ASKS_FIRST', asksFirst);
};

const serverZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin'; // the server's own clock is in neither person's zone
});
afterAll(() => {
  if (serverZone === undefined) delete process.env.TZ;
  else process.env.TZ = serverZone;
});
beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('LIVEKIT_API_SECRET', 'server-secret');
  vi.stubEnv('SIP_TRUNK_ID', 'ST_test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('ask first: nothing is scheduled until the owner says yes', () => {
  it('a missed call stores an offer, never a scheduled retry', async () => {
    flags('on');
    expect(await retry.scheduleCallRetry(firstCall().call)).toBeNull();
    expect(of('scheduled_outreach')).toHaveLength(0);
    expect(offerRow()).toMatchObject({ id: 'retry_call-rosa-1', userId: 'user-sam' });
    expect(offerRow().data.status).toBe('offered');
    // Reading the offer back is not a yes either.
    expect(await findCallRetryOffer('user-sam', 'Rosa')).toMatchObject({
      offerId: 'retry_call-rosa-1',
    });
    expect(of('scheduled_outreach')).toHaveLength(0);
  });

  it("the owner's yes schedules that one retry, once", async () => {
    flags('on');
    await retry.scheduleCallRetry(firstCall().call);
    expect(await acceptCallRetry('user-sam', 'retry_call-rosa-1')).toBe(
      "Okay, I'll try Rosa again tomorrow around 10 AM Rosa's time."
    );
    expect(of('scheduled_outreach').map((r) => r.id)).toEqual(['retry_call-rosa-1']);
    expect(offerRow().data.status).toBe('accepted');
    expect(await acceptCallRetry('user-sam', 'retry_call-rosa-1')).toMatch(
      /^Nothing was scheduled/
    );
    expect(of('scheduled_outreach')).toHaveLength(1);
  });

  it('a yes reaches the offers through the tool port and the confirm read-back', async () => {
    flags('on');
    installMissedCallOffersPort();
    await retry.scheduleCallRetry(firstCall().call);
    const prepared = await retryCallConfirm.prepare(
      { contactName: 'my sister' },
      'user-sam',
      vi.fn()
    );
    expect(prepared).toEqual({
      args: { contactName: 'my sister', offerId: 'retry_call-rosa-1' },
      readBack:
        'one more try at Rosa tomorrow around 10 AM where Rosa is, to ask whether she can pick up the cake on Saturday',
    });
    expect(of('scheduled_outreach')).toHaveLength(0);
    const confirmed = (prepared as { args: Record<string, unknown> }).args;
    expect(await retryMissedCall('user-sam', confirmed)).toMatch(/^Okay, I'll try Rosa again /);
    expect(of('scheduled_outreach')).toHaveLength(1);
  });

  it('a purpose that already says "to" or "about" is read back once, never quoted', async () => {
    flags('on');
    await retry.scheduleCallRetry(firstCall(NY, { purpose: 'about the cake on Saturday' }).call);
    const found = (await findCallRetryOffer('user-sam', 'Rosa')) as { readBack: string };
    expect(found.readBack).toBe(
      'one more try at Rosa tomorrow around 10 AM where Rosa is, about the cake on Saturday'
    );
    expect(found.readBack).not.toMatch(/"|Scheduled|\bthem\b/);
  });

  it('the offer carries expireAt, two days on, for the TTL policy; the yes restarts it', async () => {
    flags('on');
    await retry.scheduleCallRetry(firstCall().call);
    const offered = offerRow().data;
    expect(offered.expireAt).toBeInstanceOf(Date);
    expect((offered.expireAt as Date).getTime() - Number(offered.offeredAt)).toBe(48 * 3_600_000);
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    await acceptCallRetry('user-sam', 'retry_call-rosa-1');
    expect((offerRow().data.expireAt as Date).getTime()).toBe(NOW.getTime() + 49 * 3_600_000);
  });

  it("only a signed offer of the owner's own, and not a stale one, is accepted", async () => {
    flags('on');
    await retry.scheduleCallRetry(firstCall().call);
    const signed = offerRow().data.onBehalfDispatch as Record<string, unknown>;
    rows.push(
      {
        id: 'forged',
        userId: 'user-sam',
        collection: 'call_retry_offers',
        data: {
          status: 'offered',
          offeredAt: NOW.getTime(),
          onBehalfDispatch: { ...signed, purpose: 'other' },
        },
      },
      {
        id: 'stale',
        userId: 'user-sam',
        collection: 'call_retry_offers',
        data: {
          status: 'offered',
          offeredAt: NOW.getTime() - 3 * 86_400_000,
          onBehalfDispatch: signed,
        },
      },
      {
        id: 'not-hers',
        userId: 'user-alex',
        collection: 'call_retry_offers',
        data: { status: 'offered', offeredAt: NOW.getTime(), onBehalfDispatch: signed },
      }
    );
    for (const [user, id] of [
      ['user-sam', 'forged'],
      ['user-sam', 'stale'],
      ['user-alex', 'not-hers'],
    ]) {
      expect(await acceptCallRetry(user, id)).toMatch(/^Nothing was scheduled/);
    }
    expect(of('scheduled_outreach')).toHaveLength(0);
  });

  it("a declined call gets no offer; a missed one keeps the report's offer and gets one", async () => {
    flags('on');
    const ports = (turns: Array<{ role: 'agent' | 'recipient'; content: string }>) => ({
      readDisposition: () => undefined,
      readTranscript: () => turns,
      analyze: async () => null,
      report: vi.fn(async () => undefined),
      scheduleRetry: (c: Parameters<typeof retry.scheduleCallRetry>[0]) =>
        retry.scheduleCallRetry(c),
      recordOptOut: async () => true,
    });
    const said = [
      { role: 'agent' as const, content: 'Hi, it is Ferni.' },
      { role: 'recipient' as const, content: 'Not interested, bye' },
    ];
    await completeOnBehalfCall('s-declined', firstCall().call, 6, true, ports(said));
    expect(of('call_retry_offers')).toHaveLength(0);

    const missed = firstCall(LA, {}).call;
    const outcome = await completeOnBehalfCall(
      's-missed',
      { ...missed, callId: 'call-rosa-2' },
      40,
      true,
      ports([])
    );
    expect(outcome?.outcome).toMatch(/Want me to try again later\?$/);
    expect(outcome?.outcome).not.toMatch(/try again tomorrow/);
    expect(of('call_retry_offers').map((r) => r.id)).toEqual(['retry_call-rosa-2']);
    expect(of('scheduled_outreach')).toHaveLength(0);
  });
});

describe("the retry rings in the callee's morning, by the server's clock", () => {
  it.each([
    ['New York', NY, 'America/New_York', '2026-11-26T15:00:00.000Z'],
    ['Los Angeles', LA, 'America/Los_Angeles', '2026-11-26T18:00:00.000Z'],
  ])('a %s callee', async (_where, phone, zone, iso) => {
    flags('on');
    await retry.scheduleCallRetry(firstCall(phone).call);
    await acceptCallRetry('user-sam', 'retry_call-rosa-1');
    expect(scheduledFor()).toEqual([iso]);
    expect(localHour(new Date(iso), zone)).toBe(10);
  });

  it('a Tokyo morning is a Tokyo morning; a Tokyo number itself is never retried', async () => {
    flags('on');
    const slot = await retry.calleeRetrySlot(
      firstCall().call,
      'Asia/Tokyo',
      new Date(),
      retry.calleeHoursGuard
    );
    expect(slot?.toISOString()).toBe('2026-11-27T01:00:00.000Z');
    expect(localHour(slot!, 'Asia/Tokyo')).toBe(10);
    // 03:00 in Tokyo is outside; a +81 number can't be keyed on the do-not-call list, so no offer.
    const night = new Date('2026-11-26T18:00:00.000Z');
    expect(retry.calleeHoursGuard({ phone: NY, timezone: 'Asia/Tokyo' }, night)).toBe(false);
    expect(await retry.scheduleCallRetry(firstCall('+81 3 1234 5678').call)).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it("an unknown zone goes by the owner's, and the ask says so", async () => {
    flags('on');
    const { call } = firstCall(NO_ZONE);
    expect(retry.calleeZoneOf(call)).toEqual({ zone: 'America/Chicago', source: 'owner' });
    await retry.scheduleCallRetry(call);
    const found = await findCallRetryOffer('user-sam', 'Rosa');
    expect((found as { readBack: string }).readBack).toContain(
      "tomorrow around 10 AM your time, since I don't know what time it is where Rosa is"
    );
    expect(await acceptCallRetry('user-sam', 'retry_call-rosa-1')).toBe(
      "Okay, I'll try Rosa again tomorrow around 10 AM your time."
    );
    expect(scheduledFor()).toEqual(['2026-11-26T16:00:00.000Z']); // 10:00 in Chicago
  });

  it('no zone at all (no area code, no owner zone): nothing is scheduled', async () => {
    flags('on');
    const { call } = firstCall(NO_ZONE);
    const noOwnerZone = { ...call, requester: { ...call.requester, timezone: 'UTC' } };
    expect(retry.calleeZoneOf(noOwnerZone)).toBeNull();
  });
});

describe('the retry carries the whole reason of the first call', () => {
  it('field by field, through the offer and into the placed call', async () => {
    flags('on');
    const { sent, call } = firstCall();
    expect(call).not.toHaveProperty('userPreferences'); // the parsed call never holds them (#4497)
    await retry.scheduleCallRetry(call);
    const kept = offerRow().data.onBehalfDispatch as typeof sent;
    expect(kept.callId).toBe('retry_call-rosa-1');
    expect(kept.retryOf).toBe('call-rosa-1');
    expect(kept.contact).toEqual(sent.contact);
    expect(kept.purpose).toBe(sent.purpose);
    expect(kept.objective).toBe(sent.objective);
    expect(kept.callType).toBe(sent.callType);
    expect(kept.persona_id).toBe(sent.persona_id);
    expect(kept.requester).toEqual(sent.requester);
    expect(kept.userPreferences).toEqual(THE_WORDS);

    // 10:00 in New York: inside the callee's hours (the both-coasts window would refuse it).
    const tenInNewYork = { now: () => new Date('2026-11-26T15:00:00.000Z') };
    expect(await retry.placeCallRetry(kept, 'user-sam', tenInNewYork)).toEqual({ success: true });
    expect(initiateCall.mock.calls[0][0]).toMatchObject({
      purpose: sent.purpose,
      objective: sent.objective,
      resolvedContact: sent.contact,
      userPreferences: THE_WORDS,
      retryOf: 'call-rosa-1',
    });
    const placed = initiateCall.mock.calls[0][0] as { userPreferences?: unknown };
    expect(placed.userPreferences).toEqual(THE_WORDS);
  });

  it("the user's words are read from the signed payload only, never kept by the parse (#4497)", () => {
    const { sent } = firstCall();
    const payload = JSON.parse(JSON.stringify(sent)) as Record<string, unknown>;
    expect(payload.userPreferences).toEqual(THE_WORDS);
    expect(parseOnBehalfDispatch(payload)).not.toHaveProperty('userPreferences');
    const raw = JSON.stringify({
      ...payload,
      userPreferences: { ...THE_WORDS, preferredTimes: ['Saturday', 7], constraints: 'none' },
    });
    expect(callPreferencesOf(raw)).toEqual({
      additionalContext: THE_WORDS.additionalContext,
      preferredTimes: ['Saturday'],
    });
    expect(callBackgroundOf(raw).additionalContext).toBe(THE_WORDS.additionalContext);
    expect(callPreferencesOf('not json')).toEqual({});
  });

  it('nothing is kept for the retry with the flag off, so its offer carries no words', async () => {
    flags('off');
    const { sent, call } = firstCall(LA);
    const fresh = { ...call, callId: 'call-rosa-9' };
    keepPreferencesForRetry(fresh.callId, JSON.stringify(sent)); // flag off: keeps nothing
    flags('on');
    await retry.scheduleCallRetry(fresh);
    expect(offerRow().id).toBe('retry_call-rosa-9');
    expect(offerRow().data.onBehalfDispatch).not.toHaveProperty('userPreferences');
  });
});

// The words live from job start until the retry decision: taken once, never kept beside the offer.
describe('the kept words are taken once, and only for a while', () => {
  const words = () => offerRow().data.onBehalfDispatch as { userPreferences?: unknown };

  it('a second schedule for the call gets no words, and there is still one retry', async () => {
    flags('on');
    const { call } = firstCall();
    await retry.scheduleCallRetry(call);
    expect(await retry.scheduleCallRetry(call)).toBeNull();
    expect(of('call_retry_offers')).toHaveLength(1);
    expect(words().userPreferences).toEqual(THE_WORDS);
    rows = []; // even with the first offer gone, the words are not there to be read again
    await retry.scheduleCallRetry(call);
    expect(words()).not.toHaveProperty('userPreferences');
  });

  it('a decision that offers nothing still takes them', async () => {
    flags('on');
    const { call } = firstCall();
    expect(await retry.scheduleCallRetry({ ...call, retryOf: 'call-rosa-0' })).toBeNull();
    expect(rows).toHaveLength(0);
    await retry.scheduleCallRetry(call);
    expect(words()).not.toHaveProperty('userPreferences');
  });

  it('words kept past the verified-call lifetime are not used', async () => {
    flags('on');
    const { sent, call } = firstCall();
    keepPreferencesForRetry('call-rosa-3', JSON.stringify(sent));
    vi.setSystemTime(new Date(NOW.getTime() + VERIFIED_CALL_TTL_MS));
    await retry.scheduleCallRetry(call);
    expect(words().userPreferences).toEqual(THE_WORDS);
    rows = [];
    vi.setSystemTime(new Date(NOW.getTime() + VERIFIED_CALL_TTL_MS + 1));
    await retry.scheduleCallRetry({ ...call, callId: 'call-rosa-3' });
    expect(words()).not.toHaveProperty('userPreferences');
  });

  it('at most 100 calls are kept (MAX_KEPT_CALLS); the oldest goes first', async () => {
    flags('on');
    const { sent, call } = firstCall();
    for (let i = 1; i <= 100; i++) keepPreferencesForRetry(`call-other-${i}`, JSON.stringify(sent));
    await retry.scheduleCallRetry(call);
    expect(words()).not.toHaveProperty('userPreferences');
    rows = [];
    await retry.scheduleCallRetry({ ...call, callId: 'call-other-100' });
    expect(words().userPreferences).toEqual(THE_WORDS);
  });
});

describe('flag off: main, unchanged', () => {
  it('schedules the next-day both-coasts retry at once, with no offer and no kept context', async () => {
    flags('off');
    const at = await retry.scheduleCallRetry(firstCall().call);
    expect(at?.toISOString()).toBe('2026-11-26T18:00:00.000Z'); // 13:00 Eastern, 10:00 Pacific
    expect(of('call_retry_offers')).toHaveLength(0);
    const stored = of('scheduled_outreach')[0].data.target as { onBehalfDispatch: object };
    expect(stored.onBehalfDispatch).not.toHaveProperty('userPreferences');
  });

  it("places with the both-coasts window and main's request", async () => {
    flags('on');
    await retry.scheduleCallRetry(firstCall().call);
    const kept = offerRow().data.onBehalfDispatch;
    flags('off');
    const tenInNewYork = { now: () => new Date('2026-11-26T15:00:00.000Z') };
    expect(await retry.placeCallRetry(kept, 'user-sam', tenInNewYork)).toMatchObject({
      success: false,
      error: 'Outside calling hours',
    });
    const oneInNewYork = { now: () => new Date('2026-11-26T18:00:00.000Z') };
    expect(await retry.placeCallRetry(kept, 'user-sam', oneInNewYork)).toEqual({ success: true });
    expect(initiateCall.mock.calls[0][0]).not.toHaveProperty('userPreferences');
  });

  it('the offers refuse while the flag is off', async () => {
    flags('off');
    expect(await findCallRetryOffer('user-sam', 'Rosa')).toMatch(/is off/);
    expect(await acceptCallRetry('user-sam', 'retry_call-rosa-1')).toMatch(/is off/);
  });
});
