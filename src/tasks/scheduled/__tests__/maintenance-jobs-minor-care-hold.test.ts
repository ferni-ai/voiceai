/**
 * MINOR_CARE, through the real job entries: the memory-decay, memory-deduplication,
 * knowledge-graph-thread-maintenance and knowledge-graph-entity-decay routes run their real jobs.
 * Each reads every recent caller's stored memory (and the graph jobs rewrite it), held or not, on
 * main. Now each skips a caller the hold record holds before any read, whatever this process's
 * MINOR_CARE flags are: the API server can have them off while the voice agent that wrote the
 * hold had them on.
 *
 * Firestore is faked (every path read or written is recorded), and so are the graph's thread,
 * insight and entity stores (every call is recorded). Synthetic ids and data only.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fs = await vi.hoisted(async () => {
  const { fakeFirestore } =
    await import('../../../memory/knowledge-graph/__tests__/minor-care-fake-firestore.js');
  return { ...fakeFirestore(), stores: [] as string[] };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => fs.db, // the hold record
}));
vi.mock('../../../memory/knowledge-graph/storage/index.js', () => ({
  markDormantThreads: async (u: string) => (fs.stores.push(`threads ${u}`), 0),
  deleteExpiredInsights: async (u: string) => (fs.stores.push(`expired insights ${u}`), 0),
  deleteNegativeInsights: async (u: string) => void fs.stores.push(`negative insights ${u}`),
}));
vi.mock('../../../memory/entity-store/storage.js', () => ({
  getAllEntities: async (u: string) => (fs.stores.push(`entities ${u}`), []),
  updateEntity: async (u: string) => void fs.stores.push(`update entity ${u}`),
}));

const HOUR = 60 * 60 * 1000;
const HELD = 'MjMcHeld001wQ7zR2pLx';
const FREE = 'MjMcFree002wQ7zR2pLx';

/** Every read or write of the caller's data, their hold record aside. */
const touched = (u: string) =>
  [...fs.reads, ...fs.writes, ...fs.stores].filter(
    (p) => p.includes(u) && !p.startsWith('minor_care_holds/')
  );
type Route = (res: never) => Promise<void>;
const memoryRoutes = () => import('../../../api/scheduled-jobs/memory-maintenance-jobs.js');
const kgRoutes = () => import('../../../api/scheduled-jobs/knowledge-graph-jobs.js');

beforeEach(() => {
  fs.reset();
  fs.stores.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ['memory-decay', async () => (await memoryRoutes()).handleMemoryDecay],
  ['memory-deduplication', async () => (await memoryRoutes()).handleMemoryDeduplication],
  [
    'knowledge-graph-thread-maintenance',
    async () => (await kgRoutes()).handleKnowledgeGraphThreadMaintenance,
  ],
  ['knowledge-graph-entity-decay', async () => (await kgRoutes()).handleKnowledgeGraphEntityDecay],
])(
  '%s: no read or write of a held caller, flags off here; a free caller is still processed',
  async (_, route: () => Promise<Route>) => {
    vi.stubEnv('MINOR_CARE', 'off');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    const now = Date.now();
    for (const u of [HELD, FREE]) {
      fs.docs.set(`bogle_users/${u}`, { lastContact: new Date(now).toISOString() });
    }
    // Written by a voice agent with MINOR_CARE_SHARED_HOLD on
    fs.docs.set(`minor_care_holds/${HELD}`, { heldUntil: now + HOUR, v: 1 });
    vi.resetModules();
    const res = { writeHead: vi.fn(), end: vi.fn() };

    await (
      await route()
    )(res as never);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(touched(FREE)).not.toEqual([]); // the job ran and read the caller nobody holds
    expect(touched(HELD)).toEqual([]);
  }
);

it('skipIfHeld counts a held caller as skipped and logs the reason, not the id', async () => {
  vi.resetModules();
  const info = vi.fn();
  vi.doMock('../../../utils/safe-logger.js', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getLogger: () => ({ info }),
  }));
  const { skipIfHeld } = await import('../skip-if-held.js');
  const { setBackgroundHoldReader } = await import('../../../utils/minor-care-background-hold.js');
  setBackgroundHoldReader(async (u) => u === HELD);
  const counts = { processed: 0, success: 0, skipped: 0, errors: 0 };

  expect(await skipIfHeld(FREE, counts)).toBe(false);
  expect(await skipIfHeld(HELD, counts)).toBe(true);

  expect(counts).toEqual({ processed: 0, success: 0, skipped: 1, errors: 0 });
  expect(info).toHaveBeenCalledWith({ reason: 'minor_care' }, expect.any(String));
  expect(JSON.stringify(info.mock.calls)).not.toContain(HELD);
  vi.doUnmock('../../../utils/safe-logger.js');
});
