/**
 * MINOR_CARE, through the real job entries: the job routes, their real jobs, engine, batch runner,
 * port and reader. The API server running them can have MINOR_CARE_SHARED_HOLD off while the voice
 * agent that wrote the hold had it on (config skew). The 6 h shared hold must still hold the
 * caller with no window stored yet, and a stored window not yet purged must hold them after it.
 *
 * Only Firestore and the entity and correlation engines are faked. Synthetic ids and names only.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lapsedWithOpenWindow, seedGraph } from './minor-care-fake-firestore.js';

const fs = await vi.hoisted(async () => {
  const { fakeFirestore } = await import('./minor-care-fake-firestore.js');
  return fakeFirestore();
});
// The memory-consolidation route's user scan orders by document id
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FieldPath: { documentId: () => '__name__' },
}));
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => fs.db,
}));
vi.mock('../../entity-store/entity-resolver.js', () => ({ getEntityResolver: () => ({}) }));
vi.mock('../../entity-store/correlation-engine.js', () => ({
  getCorrelationEngine: () => ({ analyzePatterns: async () => [] }),
}));

const HOUR = 60 * 60 * 1000;
const HELD = 'KgMcJobHeld001wQ7zR2pLx';
const LAPSED = 'KgMcJobLapsed002wQ7zR2pLx';
const WINDOW = 'KgMcJobWindow003wQ7zR2pLx';
const FREE = 'KgMcJobFree004wQ7zR2pLx';

/** Every read or write of the caller's data, their hold record aside. */
const touched = (u: string) =>
  [...fs.reads, ...fs.writes].filter((p) => p.includes(u) && !p.startsWith('minor_care_holds/'));
type Route = (res: never) => Promise<void>;
const kgRoutes = () => import('../../../api/scheduled-jobs/knowledge-graph-jobs.js');
const memoryRoutes = () => import('../../../api/scheduled-jobs/memory-maintenance-jobs.js');

beforeEach(() => fs.reset());
afterEach(() => vi.unstubAllEnvs());

it('the route skips a caller the shared hold holds, flags off in this process', async () => {
  vi.stubEnv('MINOR_CARE', 'off');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
  const now = Date.now();
  for (const u of [HELD, LAPSED]) {
    fs.docs.set(`bogle_users/${u}`, { lastContact: new Date(now).toISOString() });
    seedGraph(fs.docs, u);
  }
  // Written by a voice agent with MINOR_CARE_SHARED_HOLD on; no held window stored yet
  fs.docs.set(`minor_care_holds/${HELD}`, { heldUntil: now + HOUR, v: 1 });
  fs.docs.set(`minor_care_holds/${LAPSED}`, { heldUntil: now - HOUR, v: 1 });
  vi.resetModules();
  const { handleKnowledgeGraphConsolidation } =
    await import('../../../api/scheduled-jobs/knowledge-graph-jobs.js');
  const res = { writeHead: vi.fn(), end: vi.fn() };

  await handleKnowledgeGraphConsolidation(res as never);

  expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  expect(fs.writes).toContain(`add knowledge_graph/${LAPSED}/consolidation_log`); // the job ran
  expect(fs.graphTouched(HELD)).toEqual([]);
});

it.each([
  ['knowledge-graph-insights', async () => (await kgRoutes()).handleKnowledgeGraphInsights],
  [
    'knowledge-graph-consolidation',
    async () => (await kgRoutes()).handleKnowledgeGraphConsolidation,
  ],
  ['memory-consolidation', async () => (await memoryRoutes()).handleMemoryConsolidation],
])(
  '%s: a lapsed shared hold with a held window not yet purged still holds the caller',
  async (_, route: () => Promise<Route>) => {
    vi.stubEnv('MINOR_CARE', 'off');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    const now = Date.now();
    for (const u of [WINDOW, FREE]) {
      fs.docs.set(`bogle_users/${u}`, { lastContact: new Date(now).toISOString() });
      seedGraph(fs.docs, u);
    }
    fs.docs.set(`minor_care_holds/${WINDOW}`, lapsedWithOpenWindow(now));
    vi.resetModules();
    const res = { writeHead: vi.fn(), end: vi.fn() };

    await (
      await route()
    )(res as never);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(touched(FREE)).not.toEqual([]); // the job ran and read the caller nobody holds
    expect(touched(WINDOW)).toEqual([]); // no read and no write of the held caller
    expect(fs.selects.filter((f) => f !== 'bogle_users.lastContact')).toEqual([]); // no profile
  }
);
