/**
 * MINOR_CARE, through the real job entry: the knowledge-graph-consolidation route, its real
 * ConsolidationJob, engine, port and reader. The API server running it can have
 * MINOR_CARE_SHARED_HOLD off while the voice agent that wrote the hold had it on (config skew).
 * The 6 h shared hold must still hold the caller, with no window stored yet.
 *
 * Only Firestore and the entity and correlation engines are faked. Synthetic ids and names only.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedGraph } from './minor-care-fake-firestore.js';

const fs = await vi.hoisted(async () => {
  const { fakeFirestore } = await import('./minor-care-fake-firestore.js');
  return fakeFirestore();
});
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
