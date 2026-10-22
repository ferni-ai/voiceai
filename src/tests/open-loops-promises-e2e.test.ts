/**
 * What was left unfinished reaching a call, with the real services (Firestore
 * is the only fake):
 * - a web view of the semantic-intelligence context reads Ferni's missed
 *   promise without marking it offered (it used to burn the one apology);
 * - the call's recall note (open-loops-recall.ts, via the real
 *   memory-recall-hook) carries the miss once, and only giving it marks it;
 *   another persona on the call and the next call don't raise it again;
 * - a promise another process wrote shows once the 15 s cache expires;
 * - the open-loops note logs OPEN_LOOPS_INJECTED once a call, counts only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedNestedFirestore as fs } from './helpers/nested-firestore.js';

const logged = vi.hoisted(() => [] as Array<{ fields: unknown; msg: unknown }>);

vi.mock('../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (opts: { module?: string }) => {
      const real = actual.createLogger(opts);
      if (opts?.module !== 'open-loops-recall') return real;
      return {
        ...real,
        info: (fields: unknown, msg: unknown) => logged.push({ fields, msg }),
        warn: (fields: unknown, msg: unknown) => logged.push({ fields, msg }),
      };
    },
  };
});
vi.mock('firebase-admin/firestore', async () => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    getFirestore: () => sharedNestedFirestore.db,
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  };
});
vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
vi.mock('../services/superhuman/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../services/superhuman/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});

const { buildSemanticIntelligenceContext } =
  await import('../services/superhuman/semantic-intelligence/index.js');
const { clearCommitmentCache, getPendingCommitments } =
  await import('../services/superhuman/semantic-intelligence/ferni-commitments.js');
const { clearLoopCache } =
  await import('../services/superhuman/semantic-intelligence/open-loops.js');
const { callLoopsRecallFor, createCallLoopsRecall, resetCallLoopsNotes, openLoopsInjectedTotal } =
  await import('../agents/multi-agent/open-loops-recall.js');
const { createMemoryRecall } = await import('../agents/multi-agent/memory-recall-hook.js');

const UID = 'pat';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T18:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const OWN = "PROMISES YOU DIDN'T KEEP";

const promisePath = (id: string) => `bogle_users/${UID}/ferni_commitments/${id}`;
const promise = (id: string) => fs.store.get(promisePath(id));

function seedPromise(id: string, fields: Record<string, unknown>): void {
  fs.store.set(promisePath(id), {
    id,
    userId: UID,
    type: 'check_in',
    commitment: `I'll check in about the ${id}`,
    context: `the ${id}`,
    madeAt: ago(9 * DAY),
    fulfilled: false,
    ...fields,
  });
}

/** A check-in Ferni missed yesterday and hasn't owned. */
const seedMiss = (id = 'interview') =>
  seedPromise(id, {
    dueBy: ago(2 * DAY).toISOString(),
    outcome: 'missed',
    violated: true,
    violatedAt: ago(DAY).toISOString(),
  });

function seedLoop(id: string, createdAgo: number, type = 'intention'): void {
  fs.store.set(`bogle_users/${UID}/open_loops/${id}`, {
    id,
    userId: UID,
    type,
    content: `secret words of ${id}`,
    context: '',
    created: ago(createdAgo),
    followUpAfter: ago(createdAgo - 60_000),
    followUpBefore: new Date(NOW.getTime() + 30 * DAY),
    status: 'open',
    priority: 5,
    followUpCount: 0,
  });
}

const emptyLedger = { save: async () => undefined, recent: async () => [] };
const noMemories = { facts: async () => [], summaries: async () => [] };

/** One persona's recall on a call, as agent-setup.ts builds it with the flag on. */
async function callRecall(callId: string) {
  const loops = createCallLoopsRecall({ userId: UID, callId });
  const recall = createMemoryRecall({
    userId: UID,
    userName: 'Pat',
    store: noMemories,
    ledgerStore: emptyLedger,
    loops,
  });
  await recall.ready;
  return recall;
}

/** The recall note for one caller turn. */
async function turn(recall: Awaited<ReturnType<typeof callRecall>>, words: string) {
  const note = recall.noteFor(words, { final: true });
  recall.newTurn();
  await new Promise((r) => {
    setTimeout(r, 0); // let the offered-mark write land
  });
  return note ?? '';
}

beforeEach(() => {
  fs.store.clear();
  clearCommitmentCache();
  clearLoopCache();
  resetCallLoopsNotes();
  logged.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe("Ferni's promises reach the call once", () => {
  it('a web view of the semantic context reads the miss but leaves it unoffered', async () => {
    seedMiss();
    const context = await buildSemanticIntelligenceContext(UID, {});
    expect(context.ferniCommitments).toContain(OWN);
    expect(promise('interview')?.ownOfferedAt).toBeUndefined();
  });

  it('the call gives the miss once and only then marks it; no other persona or call repeats it', async () => {
    seedMiss();
    const recall = await callRecall('call-1');
    expect(promise('interview')?.ownOfferedAt).toBeUndefined(); // loading only reads

    const first = await turn(recall, 'Hey Ferni, it is me!');
    expect(first).toContain(OWN);
    expect(first).toContain("I'll check in about the interview");
    expect(promise('interview')?.ownOfferedAt).toBe(NOW.toISOString());
    expect(await turn(recall, 'Work was long today.')).not.toContain(OWN);

    // Handed to another persona on the same call, then the next call: not again.
    expect(await turn(await callRecall('call-1'), 'Hi there!')).not.toContain(OWN);
    expect(await turn(await callRecall('call-2'), 'Hi again!')).not.toContain(OWN);
  });

  it('a promise another process wrote shows once the 15 s cache has expired', async () => {
    expect(await getPendingCommitments(UID)).toEqual([]); // cached, empty
    seedPromise('dinner', { dueBy: new Date(NOW.getTime() + DAY).toISOString(), outcome: 'open' });

    vi.setSystemTime(new Date(NOW.getTime() + 14_000));
    expect(await getPendingCommitments(UID)).toEqual([]);

    vi.setSystemTime(new Date(NOW.getTime() + 15_001));
    expect((await getPendingCommitments(UID)).map((c) => c.id)).toEqual(['dinner']);
  });
});

describe('open loops reach the call once, logged with counts only', () => {
  it('logs OPEN_LOOPS_INJECTED once a call with loop counts and ages, never their words', async () => {
    seedLoop('boss', 2 * 60 * 60 * 1000); // today
    seedLoop('move', 3 * DAY); // this week
    seedLoop('trip', 40 * DAY, 'life_event'); // older

    const recall = await callRecall('call-1');
    const note = await turn(recall, 'Hey Ferni, it is me!');
    expect(note).toContain('OPEN LOOPS');
    expect(note).toContain('secret words of boss');
    expect(await turn(recall, 'Work was long today.')).not.toContain('OPEN LOOPS');

    const lines = logged.filter((l) => l.msg === 'OPEN_LOOPS_INJECTED');
    expect(lines).toHaveLength(1);
    expect(lines[0].fields).toEqual({
      loops: 3,
      loopsDue: 3,
      ages: { today: 1, week: 1, month: 0, older: 1 },
      promises: false,
      missesOwned: 0,
      injectedTotal: 1,
    });
    expect(JSON.stringify(logged)).not.toContain('secret words');
    expect(openLoopsInjectedTotal()).toBe(1);
  });

  it('logs nothing and injects nothing when there is nothing to follow up', async () => {
    expect(await turn(await callRecall('call-1'), 'Hey Ferni!')).not.toContain('OPEN LOOPS');
    expect(logged.filter((l) => l.msg === 'OPEN_LOOPS_INJECTED')).toHaveLength(0);
    expect(openLoopsInjectedTotal()).toBe(0);
  });

  it('agent-setup gets nothing with OPEN_LOOPS_IN_CONTEXT off, the loops with it on', async () => {
    seedLoop('boss', 60_000);
    vi.stubEnv('OPEN_LOOPS_IN_CONTEXT', 'off');
    const off = callLoopsRecallFor(UID, 'call-1');
    await off.ready;
    expect(off.note()).toBeNull();
    vi.stubEnv('OPEN_LOOPS_IN_CONTEXT', 'on');
    const on = callLoopsRecallFor(UID, 'call-1');
    await on.ready;
    expect(on.note()).toContain('secret words of boss');
    vi.unstubAllEnvs();
  });
});
