/**
 * The crisis follow-up reads the store the live crisis signal writes.
 *
 * logCrisisSignal (called every turn from buildHumanTransferInjections) writes
 * bogle_users/{uid}/crisis_signals; hadRecentCrisis used to read crisis_history,
 * which nothing writes, so a caller in crisis yesterday got no follow-up.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  // bogle_users/{uid}/{collection} -> docs
  const stores = new Map<string, Array<Record<string, unknown>>>();
  const docsOf = (uid: string, name: string) => {
    const key = `${uid}/${name}`;
    if (!stores.has(key)) stores.set(key, []);
    return stores.get(key)!;
  };
  const query = (docs: Array<Record<string, unknown>>) => {
    let rows = [...docs];
    const chain = {
      where: (field: string, op: string, value: string) => {
        if (op !== '>=') throw new Error(`unexpected op ${op}`);
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
      get: async () => ({ docs: rows.map((d) => ({ data: () => structuredClone(d) })) }),
      // Like Firestore without ignoreUndefinedProperties: an undefined field fails the write
      add: async (doc: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(doc)) {
          if (v === undefined)
            throw new Error(`Cannot use "undefined" as a Firestore value (${k})`);
        }
        docs.push(doc);
      },
    };
    return chain;
  };
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(docsOf(uid, name)) }),
    }),
  };
  return { db, stores };
});

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { detectCrisisSignals, hadRecentCrisis, logCrisisSignal } from '../index.js';
import {
  buildCrisisHistoryInjection,
  buildHumanTransferInjections,
} from '../../../agents/processors/injection-builders/better-than-human-builders.js';

const DAY_MS = 86_400_000;

/** Log what the caller said through the live writer, as if `daysAgo` days back. */
async function saidDaysAgo(userId: string, text: string, daysAgo: number): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - daysAgo * DAY_MS);
  const signals = detectCrisisSignals(text);
  expect(signals.severity).toBeGreaterThan(0); // the live path only logs above 0
  await logCrisisSignal(userId, signals, text, 'session-earlier');
  vi.useRealTimers();
}

describe('crisis follow-up reads the live crisis store', () => {
  afterEach(() => {
    vi.useRealTimers();
    fake.stores.clear();
  });

  it('a crisis signal logged yesterday engages the follow-up today', async () => {
    await saidDaysAgo('u-yesterday', "I don't want to live anymore", 1);

    const recent = await hadRecentCrisis('u-yesterday', 7);
    expect(recent.hasCrisis).toBe(true);
    expect(recent.lastCrisis?.escalationType).toMatch(/^crisis_/);

    const injection = await buildCrisisHistoryInjection('u-yesterday');
    expect(injection?.priority).toBe(85);
    expect(injection?.content).toContain('[CRISIS FOLLOW-UP - Better Than Human]');
    expect(injection?.content).toContain('This user had a difficult moment 1 day(s) ago.');
    expect(injection?.content).toContain("- Don't immediately bring it up - let them lead");
  });

  // Prod (2026-10-19): the live caller passed no session id, the write carried
  // `sessionId: undefined`, and Firestore rejected it, so no follow-up ever came.
  it('a signal logged without a session id is still recorded', async () => {
    const text = "I don't want to live anymore";
    await logCrisisSignal('u-nosession', detectCrisisSignals(text), text);

    const [doc] = fake.stores.get('u-nosession/crisis_signals') ?? [];
    expect(doc).toBeDefined();
    expect(doc).not.toHaveProperty('sessionId');
    expect((await hadRecentCrisis('u-nosession', 7)).hasCrisis).toBe(true);
  });

  it('the live turn path records the call it happened in', async () => {
    await buildHumanTransferInjections("I don't want to live anymore", 'u-live', 'session-123');
    await vi.waitFor(() => expect(fake.stores.get('u-live/crisis_signals')).toHaveLength(1));

    expect(fake.stores.get('u-live/crisis_signals')?.[0]?.sessionId).toBe('session-123');
  });

  it('a crisis signal older than the window does not', async () => {
    await saidDaysAgo('u-old', "I don't want to live anymore", 8);

    expect((await hadRecentCrisis('u-old', 7)).hasCrisis).toBe(false);
    expect(await buildCrisisHistoryInjection('u-old')).toBeNull();
  });

  it('a low-level signal (below crisis) does not', async () => {
    fake.db
      .collection()
      .doc('u-mild')
      .collection('crisis_signals')
      .add({
        timestamp: new Date(Date.now() - DAY_MS).toISOString(),
        signals: { anxietyDisorder: true, severity: 3 },
      });

    expect((await hadRecentCrisis('u-mild', 7)).hasCrisis).toBe(false);
  });

  it('finds a crisis behind later low-level signals in the window', async () => {
    await saidDaysAgo('u-mixed', "I don't want to live anymore", 2);
    const signals = fake.db.collection().doc('u-mixed').collection('crisis_signals');
    for (let i = 0; i < 12; i++) {
      await signals.add({
        timestamp: new Date(Date.now() - i * 60_000).toISOString(),
        signals: { anxietyDisorder: true, severity: 3 },
      });
    }

    const recent = await hadRecentCrisis('u-mixed', 7);
    expect(recent.hasCrisis).toBe(true);
  });
});
