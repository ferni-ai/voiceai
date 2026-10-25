/**
 * TWILIO_ERASE_ON_DELETE: account erasure deletes the person's Twilio texts and calls
 * with Ferni (and their media, recordings and transcriptions), best effort, with a
 * retry doc, and never anyone else's. Fake Twilio and Firestore; numbers are 555-01xx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ME = '+15555550101';
const OTHER = '+15555550102';
const FERNI = '+15555550100';

const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    info: (...a: unknown[]) => logged.push(a),
    warn: (...a: unknown[]) => logged.push(a),
    error: (...a: unknown[]) => logged.push(a),
    debug: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => ({ child: () => logger }) };
});
vi.mock('../../identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => false }));
// The post-sweep outreach drop (#2311); the real module loads the LLM content service.
vi.mock('../../outreach/outreach-intelligence.js', () => ({
  eraseUserOutreachData: async () => undefined,
}));
const keys = vi.hoisted(() => ({ phones: [] as string[] }));
vi.mock('../erasure-keys.js', () => ({
  gatherErasureKeys: async (_db: unknown, userId: string) => ({
    userId,
    linkedUserIds: [],
    emails: [],
    sponsoredIdentityIds: [],
    stripeCustomerIds: [],
    phones: keys.phones,
  }),
  keepStripeCustomersForCleanup: async () => undefined,
}));
const twilio = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../../external-apis/twilio-sms.js', () => ({
  getTwilioClient: async () => twilio.client,
}));

import { eraseUserRecord } from '../erase-user-record.js';
import type { KeyedStore } from '../erase-other-keys.js';
import {
  PENDING_TWILIO_ERASURES,
  pendingId,
  queueTwilioErasure,
  retryPendingTwilioErasures,
  type TwilioEraseClient,
} from '../twilio-erasure.js';

interface Rec {
  sid: string;
  to?: string;
  from?: string;
  parent?: string;
  /** dateCreated, ms; seed records default to long before any cutoff */
  date?: number;
}

interface LegOpts {
  to: string;
  from: string;
  dateSentBefore?: Date;
  startTimeBefore?: Date;
}

/** Twilio holding messages, calls, media, recordings and transcriptions; pages of 2 */
function fakeTwilio(seed: Record<string, Rec[]>, opts: { honorFilters?: boolean } = {}) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  const requests: Array<{ op: string; params?: Record<string, unknown> }> = [];
  const failRemove = new Map<string, number>(); // sid -> status to throw (once for 429)
  let failList: number | null = null;
  const page = (kind: string, match: (r: Rec) => boolean, params: Record<string, unknown>) => {
    requests.push({ op: `${kind}.page`, params });
    if (failList)
      return Promise.reject(Object.assign(new Error('twilio down'), { status: failList }));
    const all = (data.get(kind) ?? []).filter(match);
    const at = (i: number): unknown => ({
      instances: all.slice(i, i + 2).map((r) => ({
        sid: r.sid,
        to: r.to,
        from: r.from,
        callSid: r.parent,
        dateCreated: new Date(r.date ?? 0),
      })),
      nextPage: () => (i + 2 < all.length ? Promise.resolve(at(i + 2)) : undefined),
    });
    return Promise.resolve(at(0));
  };
  const remove = (kind: string, sid: string) => async () => {
    requests.push({ op: `${kind}.remove`, params: { sid } });
    const fail = failRemove.get(sid);
    if (fail) {
      if (fail === 429) failRemove.delete(sid);
      throw Object.assign(new Error('nope'), { status: fail });
    }
    const list = data.get(kind) ?? [];
    const i = list.findIndex((r) => r.sid === sid);
    if (i < 0) throw Object.assign(new Error('gone'), { status: 404 });
    list.splice(i, 1);
    return true;
  };
  const legs = (kind: string) => (o: LegOpts) => {
    const before = (o.dateSentBefore ?? o.startTimeBefore)?.getTime() ?? Infinity;
    const match = (r: Rec): boolean => r.to === o.to && r.from === o.from && (r.date ?? 0) < before;
    return page(kind, (r) => opts.honorFilters === false || match(r), { ...o });
  };
  const children = (kind: string, parent: string) =>
    Object.assign((sid: string) => ({ remove: remove(kind, sid) }), {
      page: (o: object) => page(kind, (r) => r.parent === parent, { ...o, parent }),
    });
  const client: TwilioEraseClient = {
    messages: Object.assign(
      (sid: string) => ({ remove: remove('messages', sid), media: children('media', sid) }),
      { page: legs('messages') }
    ),
    calls: Object.assign((sid: string) => ({ remove: remove('calls', sid) }), {
      page: legs('calls'),
    }),
    recordings: Object.assign(
      (sid: string) => ({
        remove: remove('recordings', sid),
        transcriptions: children('transcriptions', sid),
      }),
      {
        page: (o: { callSid: string }) =>
          page('recordings', (r) => opts.honorFilters === false || r.parent === o.callSid, o),
      }
    ),
  } as unknown as TwilioEraseClient;
  const sids = (kind: string) => (data.get(kind) ?? []).map((r) => r.sid).sort();
  return {
    client,
    requests,
    failRemove,
    sids,
    failLists: (s: number | null) => void (failList = s),
    add: (kind: string, rec: Rec) => void data.get(kind)?.push(rec),
  };
}

/** Five texts with me (three pages one way), a call with a recording and a transcription; the same for OTHER */
const seed = (): Record<string, Rec[]> => ({
  messages: [
    { sid: 'SM1', from: ME, to: FERNI },
    { sid: 'SM2', from: ME, to: FERNI },
    { sid: 'SM3', from: ME, to: FERNI },
    { sid: 'SM4', from: ME, to: FERNI },
    { sid: 'SM5', from: ME, to: FERNI },
    { sid: 'SM6', from: FERNI, to: ME },
    { sid: 'SM7', from: OTHER, to: FERNI },
    { sid: 'SM8', from: FERNI, to: OTHER },
    { sid: 'SM9', from: ME, to: OTHER }, // not with Ferni
  ],
  media: [
    { sid: 'ME1', parent: 'SM6' },
    { sid: 'ME2', parent: 'SM8' },
  ],
  calls: [
    { sid: 'CA1', from: ME, to: FERNI },
    { sid: 'CA2', from: FERNI, to: ME },
    { sid: 'CA3', from: OTHER, to: FERNI },
  ],
  recordings: [
    { sid: 'RE1', parent: 'CA1' },
    { sid: 'RE3', parent: 'CA3' },
  ],
  transcriptions: [
    { sid: 'TR1', parent: 'RE1' },
    { sid: 'TR3', parent: 'RE3' },
  ],
});
const LEFT = {
  messages: ['SM7', 'SM8', 'SM9'],
  media: ['ME2'],
  calls: ['CA3'],
  recordings: ['RE3'],
  transcriptions: ['TR3'],
};

function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    get: async () => snap(path),
    set: async (d: Record<string, unknown>) => void docs.set(path, d),
    update: async (d: Record<string, unknown>) => void docs.set(path, { ...docs.get(path), ...d }),
    delete: async () => void docs.delete(path),
  });
  const snap = (path: string) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
    ref: ref(path),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      where: (field: string, _op: string, value: number) => ({
        limit: () => ({
          get: async () => ({
            docs: [...docs.keys()]
              .filter((p) => p.startsWith(`${name}/`) && Number(docs.get(p)?.[field]) <= value)
              .map(snap),
          }),
        }),
      }),
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, docs };
}

const NOOP: KeyedStore = {
  label: 'noop',
  erase: async () => undefined,
  remains: async () => false,
};
const pendingPath = (phone: string) => `${PENDING_TWILIO_ERASURES}/${pendingId(phone)}`;
const realTimers = async (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

describe('Twilio erasure on account delete (TWILIO_ERASE_ON_DELETE)', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_PHONE_NUMBER', FERNI);
    vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'ab'.repeat(32));
    keys.phones = [ME];
    logged.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    twilio.client = null;
  });

  it('off (the default): queues nothing and makes zero Twilio calls', async () => {
    const tw = fakeTwilio(seed());
    twilio.client = tw.client;
    const { db, docs } = fakeFirestore();
    await eraseUserRecord('u-1', db, [], [NOOP]);
    await realTimers();
    // even a pending doc left from when it was on is not acted on
    docs.set(pendingPath(ME), { encrypted: JSON.stringify({ phone: ME }), nextAttemptAt: 0 });
    const report = await retryPendingTwilioErasures(db, {
      deps: { client: tw.client, ferniNumbers: [FERNI] },
    });
    expect(tw.requests).toEqual([]);
    expect(report.due).toBe(0);
    expect([...docs.keys()]).toEqual([pendingPath(ME)]);
  });

  it("on: deletes exactly the person's texts, media, calls, recordings and transcriptions, across pages", async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    twilio.client = tw.client;
    const { db, docs } = fakeFirestore();
    await expect(eraseUserRecord('u-1', db, [], [NOOP])).resolves.toBeUndefined();
    // the background run, after the Firestore erasure
    await vi.waitFor(() => expect(docs.get(pendingPath(ME))?.attempts).toBe(1));
    expect(Object.fromEntries(Object.keys(LEFT).map((k) => [k, tw.sids(k)]))).toEqual(LEFT);
    // every list asked for exactly one pair of the person and Ferni
    const pairs = tw.requests
      .filter((r) => r.op === 'messages.page' || r.op === 'calls.page')
      .map((r) => `${String(r.params?.from)}>${String(r.params?.to)}`);
    expect(new Set(pairs)).toEqual(new Set([`${ME}>${FERNI}`, `${FERNI}>${ME}`]));
    // the queue doc holds the phone encrypted, never in the clear
    expect(JSON.stringify(docs.get(pendingPath(ME)))).not.toContain('5555550101');
    // counts only in the log, never a number
    expect(JSON.stringify(logged)).not.toMatch(/555555010\d/);
    expect(logged).toContainEqual([
      expect.objectContaining({
        messages: 6,
        media: 1,
        calls: 2,
        recordings: 1,
        transcriptions: 1,
        failed: 0,
      }),
      'Twilio records erased',
    ]);

    // the retry job finds nothing left, so the doc goes
    const report = await retryPendingTwilioErasures(db, { now: Date.now() + 60 * 60_000 });
    expect(report).toMatchObject({ due: 1, done: 1, retrying: 0 });
    expect(docs.has(pendingPath(ME))).toBe(false);
  });

  it("on: never deletes another person's records, even if Twilio ignored the list filters", async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed(), { honorFilters: false });
    const { db, docs } = fakeFirestore();
    docs.set(pendingPath(ME), {
      encrypted: JSON.stringify({ phone: ME }),
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
    });
    await retryPendingTwilioErasures(db, { deps: { client: tw.client, ferniNumbers: [FERNI] } });
    expect(Object.fromEntries(Object.keys(LEFT).map((k) => [k, tw.sids(k)]))).toEqual(LEFT);
  });

  it('on: Twilio down still erases the account, and the doc is kept and backed off for the retry', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    tw.failLists(503);
    twilio.client = tw.client;
    const { db, docs } = fakeFirestore();
    const before = Date.now();
    await expect(eraseUserRecord('u-1', db, [], [NOOP])).resolves.toBeUndefined();
    await vi.waitFor(() => expect(docs.get(pendingPath(ME))?.attempts).toBe(1));
    expect(Number(docs.get(pendingPath(ME))?.nextAttemptAt)).toBeGreaterThan(before);
    expect(tw.sids('messages')).toHaveLength(9);

    // Twilio is back: the job erases what was left
    tw.failLists(null);
    const report = await retryPendingTwilioErasures(db, { now: Date.now() + 60 * 60_000 });
    expect(report).toMatchObject({ due: 1, retrying: 1, messages: 6, calls: 2 });
    expect(tw.sids('messages')).toEqual(LEFT.messages);
  });

  it('on: a record Twilio refuses to delete counts as failed and keeps the doc', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    tw.failRemove.set('SM2', 500);
    tw.failRemove.set('SM3', 429); // rate limited once, then deleted
    const { db, docs } = fakeFirestore();
    docs.set(pendingPath(ME), {
      encrypted: JSON.stringify({ phone: ME }),
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
    });
    const sleep = vi.fn(async () => undefined);
    const report = await retryPendingTwilioErasures(db, {
      deps: { client: tw.client, ferniNumbers: [FERNI], sleep },
    });
    expect(report).toMatchObject({ failed: 1, retrying: 1, done: 0 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(tw.sids('messages')).toEqual(['SM2', ...LEFT.messages]);
    expect(docs.get(pendingPath(ME))?.attempts).toBe(1);
  });

  it('on: a doc whose phone no longer decrypts (key rotated) is kept, backed off and reported, never dropped', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    const { db, docs } = fakeFirestore();
    // sealed under a key that is no longer on the ring
    const sealed = JSON.stringify({
      encrypted: true,
      iv: '00'.repeat(16),
      authTag: '00'.repeat(16),
      data: 'ff',
    });
    const DAY = 24 * 60 * 60_000;
    const now = Date.now();
    docs.set(pendingPath(ME), {
      encrypted: sealed,
      createdAt: now - 8 * DAY,
      attempts: 2,
      nextAttemptAt: 0,
    });
    const report = await retryPendingTwilioErasures(db, {
      now,
      deps: { client: tw.client, ferniNumbers: [FERNI] },
    });
    expect(report).toMatchObject({ due: 1, undecryptable: 1, retrying: 1, done: 0 });
    expect(docs.get(pendingPath(ME))).toMatchObject({ encrypted: sealed, attempts: 3 });
    expect(Number(docs.get(pendingPath(ME))?.nextAttemptAt)).toBeGreaterThan(now);
    expect(tw.requests).toEqual([]);
    expect(logged).toContainEqual([{ undecryptable: 1 }, 'TWILIO_ERASURE_UNDECRYPTABLE']);
    expect(logged).toContainEqual([{ attempts: 3 }, 'TWILIO_ERASURE_OVERDUE']);
  });

  it('on: a queue write that fails is logged and the account erasure still succeeds', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const { db } = fakeFirestore();
    const broken = {
      collection: (name: string) =>
        name === PENDING_TWILIO_ERASURES
          ? {
              doc: () => ({
                get: async () => ({ exists: false, data: () => undefined }),
                set: async () => Promise.reject(new Error('firestore down')),
              }),
            }
          : db.collection(name),
    } as unknown as FirebaseFirestore.Firestore;
    await expect(eraseUserRecord('u-1', broken, [], [NOOP])).resolves.toBeUndefined();
    expect(JSON.stringify(logged)).toContain('Twilio erasure not queued');
  });

  const DAY = 24 * 60 * 60_000;
  const pending = (createdAt: number | undefined, phone = ME) => ({
    encrypted: JSON.stringify({ phone }),
    ...(createdAt === undefined ? {} : { createdAt }),
    attempts: 4,
    nextAttemptAt: 0,
  });

  it('on: a text after the cutoff (a new owner of the number) survives every run, and the doc clears', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const cutoff = Date.now() - DAY;
    const { db, docs } = fakeFirestore();
    docs.set(pendingPath(ME), pending(cutoff));
    // a retried erasure keeps the first cutoff
    await queueTwilioErasure(db, [ME], cutoff + 60_000);
    expect(docs.get(pendingPath(ME))?.createdAt).toBe(cutoff);
    // Twilio ignores the bound here, so the per-record date check alone must keep them
    const tw = fakeTwilio(seed(), { honorFilters: false });
    const deps = { client: tw.client, ferniNumbers: [FERNI] };
    const reports = [];
    for (let run = 0; run < 4; run++) {
      // the number's new owner texts Ferni before every run
      tw.add('messages', { sid: `SMNEW${run}`, from: ME, to: FERNI, date: cutoff + run + 1 });
      const now = Date.now() + run * 7 * 60 * 60_000; // past each backoff
      // eslint-disable-next-line no-await-in-loop -- runs in order
      reports.push(await retryPendingTwilioErasures(db, { now, deps }));
    }
    expect(reports[0]).toMatchObject({ messages: 6, calls: 2, done: 0 });
    expect(reports[1]).toMatchObject({ due: 1, messages: 0, calls: 0, done: 1 });
    expect(reports[2]).toMatchObject({ due: 0 });
    expect(docs.has(pendingPath(ME))).toBe(false);
    expect(tw.sids('messages')).toEqual([...LEFT.messages, 'SMNEW0', 'SMNEW1', 'SMNEW2', 'SMNEW3']);
    // every list is bounded by the cutoff
    const bounds = tw.requests
      .filter((r) => r.op === 'messages.page' || r.op === 'calls.page')
      .map((r) => (r.params?.dateSentBefore ?? r.params?.startTimeBefore) as Date | undefined);
    expect(bounds.length).toBeGreaterThan(0);
    expect(bounds.every((d) => d?.getTime() === cutoff)).toBe(true);
    expect(tw.requests.filter((r) => r.op === 'messages.page')[0]?.params).toHaveProperty(
      'dateSentBefore'
    );
    expect(tw.requests.filter((r) => r.op === 'calls.page')[0]?.params).toHaveProperty(
      'startTimeBefore'
    );
  });

  it('on: a doc 30 days past its cutoff is dropped with TWILIO_ERASURE_EXPIRED, not retried', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    const { db, docs } = fakeFirestore();
    const now = Date.now();
    docs.set(pendingPath(ME), pending(now - 31 * DAY));
    docs.set(pendingPath(OTHER), pending(now - 29 * DAY, OTHER));
    const report = await retryPendingTwilioErasures(db, {
      now,
      deps: { client: tw.client, ferniNumbers: [FERNI] },
    });
    expect(report).toMatchObject({ due: 2, expired: 1 });
    expect(docs.has(pendingPath(ME))).toBe(false);
    expect(docs.has(pendingPath(OTHER))).toBe(true);
    // the expired phone's records were not touched; the live one's were
    expect(tw.sids('messages')).toEqual(expect.arrayContaining(['SM1', 'SM6']));
    expect(tw.sids('messages')).not.toContain('SM7');
    expect(logged).toContainEqual([
      expect.objectContaining({ reason: 'max-age', attempts: 4 }),
      expect.stringContaining('TWILIO_ERASURE_EXPIRED'),
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/555555010\d/);
  });

  it('off: a doc past the age cap is still dropped, with zero Twilio calls; a younger one is kept', async () => {
    const tw = fakeTwilio(seed());
    twilio.client = tw.client;
    const { db, docs } = fakeFirestore();
    const now = Date.now();
    docs.set(pendingPath(ME), pending(now - 31 * DAY));
    docs.set(pendingPath(OTHER), pending(now - 29 * DAY, OTHER));
    const report = await retryPendingTwilioErasures(db, { now });
    expect(report).toMatchObject({ due: 0, expired: 1 });
    expect([...docs.keys()]).toEqual([pendingPath(OTHER)]);
    expect(tw.requests).toEqual([]);
    expect(JSON.stringify(logged)).toContain('TWILIO_ERASURE_EXPIRED');
  });

  it("on: one doc's failed update is logged and the next doc is still processed", async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const tw = fakeTwilio(seed());
    tw.failLists(503); // both docs go to the backoff update
    const { db, docs } = fakeFirestore();
    docs.set(pendingPath(ME), pending(Date.now()));
    docs.set(pendingPath(OTHER), pending(Date.now(), OTHER));
    const col = db.collection(PENDING_TWILIO_ERASURES);
    const all = await col.where('nextAttemptAt', '<=', Date.now()).limit(50).get();
    const [first, second] = all.docs;
    const broken = {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({
              docs: [
                {
                  ...first,
                  data: () => first?.data(),
                  ref: { update: async () => Promise.reject(new Error('NOT_FOUND')) },
                },
                second,
              ],
            }),
          }),
        }),
      }),
    } as unknown as FirebaseFirestore.Firestore;
    const report = await retryPendingTwilioErasures(broken, {
      deps: { client: tw.client, ferniNumbers: [FERNI] },
    });
    expect(report.due).toBe(2);
    expect(docs.get(pendingPath(OTHER))?.attempts).toBe(5);
    expect(JSON.stringify(logged)).toContain('Twilio erasure doc not settled');
  });

  it('on: the queue doc exists before the first store is erased', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const { db, docs } = fakeFirestore();
    const seen: boolean[] = [];
    const queued = (): boolean => docs.has(pendingPath(ME));
    const STORE = 'contact_interactions';
    const watched = {
      collection: (name: string) =>
        name === STORE
          ? {
              where: () => ({
                limit: () => ({
                  get: async () => {
                    seen.push(queued());
                    return { empty: true, docs: [] };
                  },
                }),
              }),
            }
          : db.collection(name),
    } as unknown as FirebaseFirestore.Firestore;
    const probe: KeyedStore = {
      label: 'probe',
      erase: async () => void seen.push(queued()),
      remains: async () => false,
    };
    await eraseUserRecord('u-1', watched, [{ collection: STORE, field: 'userId' }], [probe]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(true);
    expect(seen.every(Boolean)).toBe(true);
  });
});
