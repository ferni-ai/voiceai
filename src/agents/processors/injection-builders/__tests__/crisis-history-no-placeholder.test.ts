/**
 * PRIVACY (#2678): crisis history is read only under the caller's own id.
 *
 * buildCrisisHistoryInjection was handed `services.userId || 'unknown'`, so a
 * caller with no id was shown the newest crisis in bogle_users/unknown/
 * crisis_signals, someone else's, as their own ("This user had a difficult
 * moment..."). It now refuses a missing or placeholder id before any read: no id,
 * no history. anon: and member callers read only their own.
 *
 * Crisis DETECTION is unchanged: performSafetyCheck reads the live text, and its
 * user id only labels the log, so a caller with no id who says a crisis line gets
 * exactly the injections main gave them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  // bogle_users/{uid}/{collection} -> docs; `reads` records every query's owner.
  const stores = new Map<string, Array<Record<string, unknown>>>();
  const reads: string[] = [];
  const docsOf = (uid: string, name: string) => {
    const key = `${uid}/${name}`;
    if (!stores.has(key)) stores.set(key, []);
    return stores.get(key)!;
  };
  const query = (uid: string, docs: Array<Record<string, unknown>>) => {
    let rows = [...docs];
    const chain = {
      where: (field: string, _op: string, value: string) => {
        rows = rows.filter((d) => String(d[field]) >= value);
        return chain;
      },
      orderBy: (field: string, dir: 'asc' | 'desc') => {
        rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])));
        if (dir === 'desc') rows.reverse();
        return chain;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return chain;
      },
      get: async () => {
        reads.push(uid);
        return { docs: rows.map((d) => ({ data: () => structuredClone(d) })) };
      },
      add: async (doc: Record<string, unknown>) => {
        docs.push(doc);
      },
    };
    return chain;
  };
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(uid, docsOf(uid, name)) }),
    }),
  };
  return { db, reads, stores };
});
const safetyUsers = vi.hoisted(() => [] as string[]);
/** Every human-transfer log call's fields, to check they hold ids, never words. */
const logged = vi.hoisted(() => [] as unknown[]);

vi.mock('../../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/safe-logger.js')>();
  const record = (fields: unknown) => logged.push(fields);
  return {
    ...real,
    createLogger: () => ({ debug: record, info: record, warn: record, error: record }),
  };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));
vi.mock('../../../../services/safety/index.js', async (orig) => {
  const real = await orig<typeof import('../../../../services/safety/index.js')>();
  return {
    ...real,
    performSafetyCheck: (text: string, context: { userId: string }) => {
      safetyUsers.push(context.userId);
      return real.performSafetyCheck(text, context as never);
    },
  };
});

const { detectCrisisSignals, logCrisisSignal } =
  await import('../../../../services/human-transfer/index.js');
const { buildCrisisHistoryInjection, buildHumanTransferInjections } =
  await import('../better-than-human-builders.js');
const { buildSafetyInjections } = await import('../safety-coaching-builders.js');

const CRISIS_LINE = "I want to kill myself. I've got the pills right here.";

/** A crisis-level signal from yesterday, written by the live writer. */
async function hadCrisisYesterday(userId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - 86_400_000);
  await logCrisisSignal(userId, detectCrisisSignals(CRISIS_LINE), CRISIS_LINE, 'session-earlier');
  vi.useRealTimers();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fake.reads.length = 0;
  safetyUsers.length = 0;
});

describe('crisis history: no id, no history; everyone else only their own', () => {
  it('a caller with no id or a placeholder id gets none, and no shared bucket is read', async () => {
    for (const shared of ['unknown', 'anonymous', 'anon', 'session', 'gateway']) {
      await hadCrisisYesterday(shared);
    }
    fake.reads.length = 0;
    for (const id of [
      undefined,
      '',
      '  ',
      'unknown',
      ' Unknown ',
      'anonymous',
      'anon',
      'gateway',
    ]) {
      expect(await buildCrisisHistoryInjection(id)).toBeNull();
    }
    // Each runs as a fresh anon: id of its own (no server session): never a shared bucket.
    expect(fake.reads).toHaveLength(8);
    expect(fake.reads.every((owner) => /^anon:./.test(owner))).toBe(true);
  });

  it("a member's own crisis still follows up, and only theirs", async () => {
    await hadCrisisYesterday('uid-member');
    const injection = await buildCrisisHistoryInjection('uid-member');
    expect(injection?.category).toBe('crisis_follow_up');
    expect(injection?.content).toContain('had a difficult moment 1 day(s) ago');
    expect(fake.reads).toEqual(['uid-member']);
    expect(await buildCrisisHistoryInjection('uid-other-member')).toBeNull();
  });

  it("an anon: caller gets their own history, never another anon: caller's", async () => {
    await hadCrisisYesterday('anon:caller-a');
    expect((await buildCrisisHistoryInjection('anon:caller-a'))?.category).toBe('crisis_follow_up');
    expect(await buildCrisisHistoryInjection('anon:caller-b')).toBeNull();
  });
});

describe("an id-less caller's crisis signal is their own (anon: id of the session)", () => {
  const session = (job: string) => `session-${job}-${Date.now()}`;
  const owners = () =>
    [...fake.stores.keys()]
      .filter((k) => k.endsWith('/crisis_signals'))
      .map((k) => k.split('/')[0]);

  it("the write lands under the caller's anon: id, and their own later turn reads it", async () => {
    const mine = session('AJ_crisis_mine');
    const before = new Set(owners());
    for (const userId of [undefined, 'unknown', '\u200banonymous']) {
      await buildHumanTransferInjections(CRISIS_LINE, userId, mine);
    }
    await vi.waitFor(() => expect(owners().length).toBeGreaterThan(before.size));
    const written = owners().filter((o) => !before.has(o));
    expect(written).toHaveLength(1); // one bucket for the caller, whatever placeholder they came with
    expect(written[0]).toMatch(/^anon:./);
    expect(fake.stores.get(`${written[0]}/crisis_signals`)).toHaveLength(3);

    const followUp = await buildCrisisHistoryInjection(undefined, mine);
    expect(followUp?.category).toBe('crisis_follow_up');
    expect(await buildCrisisHistoryInjection(undefined, session('AJ_crisis_other'))).toBeNull();
  });
});

describe('the crisis writer: never a shared bucket, no words without an account', () => {
  const crisisDocs = () =>
    [...fake.stores.entries()].filter(([k]) => k.endsWith('/crisis_signals'));
  const count = () => crisisDocs().reduce((n, [, docs]) => n + docs.length, 0);
  const signals = () => detectCrisisSignals(CRISIS_LINE);
  const NINETY_DAYS_MS = 90 * 86_400_000;

  it('a placeholder id, plain or disguised, writes nothing', async () => {
    const before = count();
    for (const id of [
      'unknown',
      ' Unknown ',
      'anonymous',
      'anon',
      'anon:',
      '\u200bunknown',
      '\ufeffanonymous',
      'ｕｎｋｎｏｗｎ',
      'gateway',
    ]) {
      await logCrisisSignal(id, signals(), CRISIS_LINE, 'session-AJ_w-1761200000000');
    }
    expect(count()).toBe(before);
  });

  it("a non-member's signal keeps no words and expires in 90 days", async () => {
    const t0 = Date.now();
    await logCrisisSignal('anon:caller-nowords', signals(), CRISIS_LINE, 'session-AJ_nw-1');
    const [doc] = fake.stores.get('anon:caller-nowords/crisis_signals') ?? [];
    expect(doc).toBeDefined();
    expect(Object.keys(doc).sort()).toEqual(['expireAt', 'sessionId', 'signals', 'timestamp']);
    expect(JSON.stringify(doc)).not.toMatch(/pills|kill/i);
    const expireAt = (doc.expireAt as Date).getTime();
    expect(expireAt).toBeGreaterThanOrEqual(t0 + NINETY_DAYS_MS);
    expect(expireAt).toBeLessThanOrEqual(Date.now() + NINETY_DAYS_MS);
  });

  it('an id-less caller on the live turn path gets the same no-words record', async () => {
    const mine = `session-AJ_nwlive-${Date.now()}`;
    const before = new Set(crisisDocs().map(([k]) => k));
    await buildHumanTransferInjections(CRISIS_LINE, undefined, mine);
    await vi.waitFor(() => expect(crisisDocs().length).toBeGreaterThan(before.size));
    const [[key, [doc]]] = crisisDocs().filter(([k]) => !before.has(k));
    expect(key).toMatch(/^anon:./);
    expect(doc).not.toHaveProperty('transcriptSnippet');
    expect(doc.expireAt).toBeInstanceOf(Date);
  });

  it("a member's signal is stored as main stores it: snippet, no expiry", async () => {
    await logCrisisSignal('uid-member-snippet', signals(), CRISIS_LINE, 'session-AJ_m-1');
    const [doc] = fake.stores.get('uid-member-snippet/crisis_signals') ?? [];
    expect(doc.transcriptSnippet).toBe(CRISIS_LINE.slice(0, 200));
    expect(doc).not.toHaveProperty('expireAt');
  });

  it('a failed write logs ids and an error code, never the words', async () => {
    const add = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error(`bad value: ${CRISIS_LINE}`), { code: 'invalid-argument' })
      );
    const spy = vi.spyOn(fake.db, 'collection').mockReturnValue({
      doc: () => ({ collection: () => ({ add }) }),
    } as never);
    logged.length = 0;
    await logCrisisSignal('uid-member-fail', signals(), CRISIS_LINE, 'session-AJ_f-1');
    spy.mockRestore();
    expect(add).toHaveBeenCalledTimes(1);
    expect(logged).toContainEqual({ userId: 'uid-member-fail', code: 'invalid-argument' });
    expect(JSON.stringify(logged)).not.toMatch(/pills|kill/i);
  });
});

describe('crisis detection on the live turn is unchanged', () => {
  const ctx = (services: Record<string, unknown>) =>
    ({
      userText: CRISIS_LINE,
      services,
      userData: { relationshipStage: 'friend' },
      persona: { id: 'ferni' },
    }) as never;

  it('a caller with no id saying a crisis line gets the full crisis response main gave', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the response picks its wording at random
    const noId = await buildSafetyInjections(ctx({ sessionId: 'session-AJ_x-1761200000000' }));
    // main's input for the same caller: `services.userId || 'unknown'`
    const onMain = await buildSafetyInjections(ctx({ userId: 'unknown' }));
    expect(noId.map((i) => i.category)).toEqual(['safety', 'crisis_response']);
    expect(noId).toEqual(onMain);
    expect(noId).toEqual(await buildSafetyInjections(ctx({ userId: 'uid-member' })));
  });

  it('the safety check never runs under a shared placeholder id', async () => {
    await buildSafetyInjections(ctx({ sessionId: 's1' }));
    await buildSafetyInjections(ctx({ userId: 'uid-member', sessionId: 's1' }));
    expect(safetyUsers[0]).toMatch(/^anon:/);
    expect(safetyUsers[1]).toBe('uid-member');
  });
});
