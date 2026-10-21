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
  retryPendingTwilioErasures,
  type TwilioEraseClient,
} from '../twilio-erasure.js';

interface Rec {
  sid: string;
  to?: string;
  from?: string;
  parent?: string;
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
      instances: all
        .slice(i, i + 2)
        .map((r) => ({ sid: r.sid, to: r.to, from: r.from, callSid: r.parent })),
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
  const legs = (kind: string) => (o: { to: string; from: string }) =>
    page(kind, (r) => opts.honorFilters === false || (r.to === o.to && r.from === o.from), o);
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

  it('on: a queue write that fails is logged and the account erasure still succeeds', async () => {
    vi.stubEnv('TWILIO_ERASE_ON_DELETE', 'on');
    const { db } = fakeFirestore();
    const broken = {
      collection: (name: string) =>
        name === PENDING_TWILIO_ERASURES
          ? { doc: () => ({ set: async () => Promise.reject(new Error('firestore down')) }) }
          : db.collection(name),
    } as unknown as FirebaseFirestore.Firestore;
    await expect(eraseUserRecord('u-1', broken, [], [NOOP])).resolves.toBeUndefined();
    expect(JSON.stringify(logged)).toContain('Twilio erasure not queued');
  });
});
