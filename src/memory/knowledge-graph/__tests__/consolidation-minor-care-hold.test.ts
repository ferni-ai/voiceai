/**
 * MINOR_CARE: the background consolidations skip a held caller.
 *
 * On main the nightly knowledge-graph consolidation (and the insight job, which runs it too) read
 * and rewrote every recent caller's graph, and the weekly memory consolidation sent their stored
 * memories to the embedding provider, held or not: the hold lives in the voice process, and the
 * purge doesn't scrub these stores. Now both ask backgroundHeld first, which the job routes answer
 * through the reader (shared hold record, then the held calls' stored windows), failing closed.
 *
 * The real engine, batch runner, port, reader, held-window and shared-hold modules. Only Firestore
 * and the entity and correlation engines are faked. A "process" is a fresh module registry.
 * Synthetic ids and names only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lapsedWithOpenWindow, seedGraph as seed } from './minor-care-fake-firestore.js';

const fs = await vi.hoisted(async () => {
  const { fakeFirestore } = await import('./minor-care-fake-firestore.js');
  return { ...fakeFirestore(), analyze: vi.fn(async () => []) };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => fs.db,
}));
// The job routes' jobs, faked: each run asks the port about a caller nobody holds.
const routeAnswers = vi.hoisted(() => [] as boolean[]);
const askingJob = () =>
  class {
    async run() {
      const port = await import('../../../utils/minor-care-background-hold.js');
      routeAnswers.push(await port.backgroundHeld('KgMcRouteNobodyHeld0wQ7zR2pLx'));
      return {};
    }
  };
vi.mock('../../../tasks/scheduled/knowledge-graph-jobs.js', () => ({
  InsightGenerationJob: askingJob(),
  ConsolidationJob: askingJob(),
}));
vi.mock('../../../tasks/scheduled/memory-jobs.js', () => ({ MemoryConsolidationJob: askingJob() }));
vi.mock('../../entity-store/entity-resolver.js', () => ({ getEntityResolver: () => ({}) }));
vi.mock('../../entity-store/correlation-engine.js', () => ({
  getCorrelationEngine: () => ({ analyzePatterns: fs.analyze }),
}));

const HOUR = 60 * 60 * 1000;
let n = 0;
const uid = (tag: string) => `KgMc${tag}${String(++n).padStart(3, '0')}wQ7zR2pLx`;
const seedGraph = (u: string) => seed(fs.docs, u);

/** A held call's window, already scrubbed: kept KEEP_DAYS, so it still marks the caller held. */
const storeHeldWindow = (u: string) =>
  fs.docs.set(`minor_care_holds/${u}`, {
    windows: [{ start: Date.now() - 3 * HOUR, end: Date.now() - 2 * HOUR, scrubbed: true }],
  });

/** A fresh process. `reader`: the job route imported the hold reader, as the routes do. */
async function proc(reader = true) {
  vi.resetModules();
  if (reader) await import('../../../services/outreach/minor-care-background-read.js');
  const { ConsolidationEngine } = await import('../consolidation.js');
  const batch = await import('../../../tasks/scheduled/consolidation-batch.js');
  return { engine: new ConsolidationEngine(), batch };
}

const graphTouched = fs.graphTouched;

beforeEach(() => {
  fs.reset();
  fs.analyze.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('knowledge-graph consolidation: MINOR_CARE hold', () => {
  it('rewrites a caller who was never held (the same graph a held caller has)', async () => {
    const u = uid('Free');
    seedGraph(u);
    const { engine } = await proc();

    const result = await engine.runConsolidation(u);

    expect(result.memoriesDecayed).toBe(1);
    expect(fs.writes).toEqual([
      `update knowledge_graph/${u}/entities/e1`,
      `delete knowledge_graph/${u}/relationships/r1`,
      `add knowledge_graph/${u}/consolidation_log`,
    ]);
    expect(fs.analyze).toHaveBeenCalledWith(u);
  });

  it('neither reads nor rewrites a caller whose held window is stored, MINOR_CARE off here', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    const u = uid('Held');
    seedGraph(u);
    storeHeldWindow(u);
    const { engine } = await proc();

    const result = await engine.runConsolidation(u);

    expect(result).toEqual({
      entitiesMerged: 0,
      factsConsolidated: 0,
      relationshipsStrengthened: 0,
      memoriesDecayed: 0,
      newCorrelations: [],
    });
    expect(fs.reads).toEqual([`minor_care_holds/${u}`]); // the hold, nothing of the graph
    expect(fs.writes).toEqual([]); // no consolidation_log.add, no update or delete
    expect(fs.analyze).not.toHaveBeenCalled();
  });

  it('skips a caller the shared hold record holds, no window stored, flags off here', async () => {
    // The voice agent wrote heldUntil with MINOR_CARE_SHARED_HOLD on; this process has it off
    vi.stubEnv('MINOR_CARE', 'off');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    const u = uid('Shared');
    seedGraph(u);
    fs.docs.set(`minor_care_holds/${u}`, { heldUntil: Date.now() + HOUR, v: 1 });
    const { engine } = await proc();

    await engine.runConsolidation(u);

    expect(graphTouched(u)).toEqual([]);
  });

  it.each([
    ['a Date', new Date(Date.now() + HOUR)],
    ['a string', 'soon'],
    ['null', null],
    ['NaN', Number.NaN],
  ])('skips a caller whose heldUntil is present but not a number (%s)', async (_, heldUntil) => {
    const u = uid('Odd');
    seedGraph(u);
    fs.docs.set(`minor_care_holds/${u}`, { heldUntil, v: 1 });
    const { engine } = await proc();

    await engine.runConsolidation(u);

    expect(graphTouched(u)).toEqual([]);
  });

  it('consolidates a caller whose shared hold has lapsed', async () => {
    const u = uid('Lapsed');
    seedGraph(u);
    fs.docs.set(`minor_care_holds/${u}`, { heldUntil: Date.now() - HOUR, v: 1 });
    const { engine } = await proc();

    await engine.runConsolidation(u);

    expect(fs.writes).toContain(`add knowledge_graph/${u}/consolidation_log`);
  });

  it('skips a caller whose shared hold has lapsed while a held window is still unscrubbed', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    const u = uid('Window');
    seedGraph(u);
    fs.docs.set(`minor_care_holds/${u}`, lapsedWithOpenWindow(Date.now()));
    const { engine } = await proc();

    await engine.runConsolidation(u);

    expect(fs.reads).toEqual([`minor_care_holds/${u}`]); // the hold, nothing of the graph
    expect(fs.writes).toEqual([]);
  });

  it('skips when the hold can not be read (fails closed)', async () => {
    const u = uid('Down');
    seedGraph(u);
    fs.failHolds.on = true;
    const { engine } = await proc();

    await engine.runConsolidation(u);

    expect(graphTouched(u)).toEqual([]);
  });

  it('skips when the hold read does not answer in time (fails closed)', async () => {
    const u = uid('Late');
    seedGraph(u);
    fs.hangHolds.on = true;
    const { engine } = await proc();
    vi.useFakeTimers();

    const run = engine.runConsolidation(u);
    await vi.advanceTimersByTimeAsync(5000);
    await run;

    expect(graphTouched(u)).toEqual([]);
  });

  it('skips everyone when no job route loaded the reader', async () => {
    const u = uid('NoReader');
    seedGraph(u);
    const { engine } = await proc(false);

    await engine.runConsolidation(u);

    expect(graphTouched(u)).toEqual([]);
  });
});

describe('weekly memory consolidation: MINOR_CARE hold', () => {
  const ctx = () => ({
    startedAt: new Date(0),
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    isDryRun: false,
    counters: { processed: 0, success: 0, skipped: 0, errors: 0 },
  });

  it("never loads a held or unreadable caller's memories; still loads the others", async () => {
    const held = uid('BHeld');
    const free = uid('BFree');
    storeHeldWindow(held);
    const { batch } = await proc();
    const loadMemories = vi.fn(async () => []);
    const unreadable = async (u: string) =>
      u === held ? true : Promise.reject(new Error('fake outage'));
    const run = (users: string[], reader?: (u: string) => Promise<boolean>) =>
      batch.runConsolidationBatch(
        { minMemoriesForConsolidation: 20, maxMemoriesToProcess: 100, maxUsersPerRun: 50 },
        {
          listUsers: async () => users.map((userId) => ({ userId, lastContact: '2026-10-01' })),
          loadMemories,
          consolidate: vi.fn(),
          cursor: { load: async () => null, save: async () => undefined },
          held: reader,
        },
        ctx() as never
      );

    await run([held, free]); // the registered reader, as the job runs it
    expect(loadMemories.mock.calls).toEqual([[free]]);

    loadMemories.mockClear();
    await run([free], unreadable);
    expect(loadMemories).not.toHaveBeenCalled();
  });
});

describe('job routes: load the hold reader before their job runs', () => {
  const kg = '../../../api/scheduled-jobs/knowledge-graph-jobs.js';
  const mm = '../../../api/scheduled-jobs/memory-maintenance-jobs.js';
  it.each([
    [kg, 'handleKnowledgeGraphInsights'],
    [kg, 'handleKnowledgeGraphConsolidation'],
    [mm, 'handleMemoryConsolidation'],
  ])('%s %s: "not held" for a caller nobody holds (without the reader: held)', async (path, fn) => {
    await proc(false); // a fresh process: no reader yet
    const port = await import('../../../utils/minor-care-background-hold.js');
    expect(await port.backgroundHeld('KgMcRouteNobodyHeld0wQ7zR2pLx')).toBe(true); // precondition
    const route = (await import(path)) as Record<string, (res: never) => Promise<void>>;
    routeAnswers.length = 0;

    await route[fn]({ writeHead: vi.fn(), end: vi.fn() } as never);

    expect(routeAnswers).toEqual([false]);
  });
});
