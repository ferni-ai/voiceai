/**
 * Team Insights (home, "What we're noticing"), call → panel: an insight a persona's
 * voice tool shares on a call comes back through GET /api/team-insights, the request
 * the panel sends (apps/web/src/ui/team-insights.ui.ts fetchTeamInsights). Real route
 * on a node:http server, real Firestore emulator.
 *
 * The voice agent and the web server are separate processes, each with its own copy
 * of cross-persona-insights.ts, so the tests load a separate module instance for each.
 * Before: each process loaded a user once and never read again, so the web server
 * never saw what the agent wrote after its first read; and every writer saved its
 * whole cached list over the stored one, so a second writer wiped the first.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Tool, ToolContext, ToolDefinition } from '../../tools/registry/types.js';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the
// insight store and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-team-insights';

let server: Server;
let base: string;
let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  // The web server's module instance: the route, and the insights service under it.
  const { handleTeamInsightsRoutes } = await import('../routes/team-insights.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleTeamInsightsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
});

afterAll(() => server?.close());

/** The panel's request: GET /api/team-insights, no query, as the signed-in user. */
async function panelRead(uid: string): Promise<{ status: number; contents: string[] }> {
  const res = await fetch(`${base}/api/team-insights`, { headers: { 'x-firebase-uid': uid } });
  const body = (await res.json()) as { insights?: Array<{ content: string }> };
  return { status: res.status, contents: (body.insights ?? []).map((i) => i.content) };
}

type Exec = (args: Record<string, unknown>) => Promise<string>;
interface Agent {
  share: (uid: string, tool: string, args: object) => Promise<void>;
  /** This process's own module instances, for the calls no tool makes on its own. */
  insights: typeof import('../../services/cross-persona/cross-persona-insights.js');
  store: typeof import('../../services/cross-persona/insight-store.js');
  minorCare: typeof import('../../utils/minor-care.js');
  firestoreUtils: typeof import('../../utils/firestore-utils.js');
  logger: typeof import('../../utils/safe-logger.js');
}

/**
 * A voice-agent process: a fresh copy of the tools and of cross-persona-insights.ts,
 * sharing nothing with the web server's copy but Firestore.
 */
async function agentProcess(): Promise<Agent> {
  vi.resetModules();
  const { habitPersistenceTools } = await import('../../tools/domains/habits/persistence.js');
  const { definitions: griefTools } = await import('../../tools/domains/grief/index.js');
  const store = await import('../../services/cross-persona/insight-store.js');
  const defs: ToolDefinition[] = [...habitPersistenceTools, ...griefTools];
  return {
    insights: await import('../../services/cross-persona/cross-persona-insights.js'),
    store,
    minorCare: await import('../../utils/minor-care.js'),
    firestoreUtils: await import('../../utils/firestore-utils.js'),
    logger: await import('../../utils/safe-logger.js'),
    share: async (uid, id, args) => {
      const def = defs.find((d) => d.id === id)!;
      const ctx = { userId: uid, agentId: 'maya-santos' } as ToolContext;
      await ((def.create(ctx) as Tool & { execute: Exec }).execute as Exec)(
        args as Record<string, unknown>
      );
      await store.insightWritesSettled();
    },
  };
}

/** What Maya's surfacePatternInsight tool is called with on a call. */
const mayaNotices = (pattern: string) => ({
  targetPersona: 'all',
  patternDescription: pattern,
  significance: 'it keeps coming up',
  urgency: 'normal',
});
/** What Ferni's shareGriefInsight tool is called with on a call. */
const ferniNotices = (insight: string) => ({
  targetPersona: 'all',
  insightType: 'anniversary',
  insight,
  significance: 'the date is close',
});
const pattern = (p: string) => `${p} | Context: it keeps coming up`;
const grief = (g: string) => `Grief insight (anniversary): ${g} | Significance: the date is close`;

describe.skipIf(!emulator)('Team Insights, call to panel (Firestore emulator)', () => {
  it('an insight Maya shares on a call shows on the panel', async () => {
    const uid = newUser();
    const agent = await agentProcess();

    await agent.share(uid, 'surfacePatternInsight', mayaNotices('Walks after dinner stick'));

    expect(await panelRead(uid)).toEqual({
      status: 200,
      contents: [pattern('Walks after dinner stick')],
    });
  });

  it('a web server that already read the user sees what the agent writes after', async () => {
    const uid = newUser();
    expect(await panelRead(uid)).toEqual({ status: 200, contents: [] });

    const agent = await agentProcess();
    await agent.share(uid, 'surfacePatternInsight', mayaNotices('Mornings go better'));

    expect((await panelRead(uid)).contents).toEqual([pattern('Mornings go better')]);
  });

  it('two calls writing at once both keep their insight, and the app keeps both', async () => {
    const uid = newUser();
    const [a, b] = [await agentProcess(), await agentProcess()];
    expect(await panelRead(uid)).toEqual({ status: 200, contents: [] });

    await Promise.all([
      a.share(uid, 'surfacePatternInsight', mayaNotices('Sleep is better on gym days')),
      b.share(uid, 'shareGriefInsight', ferniNotices("Her dad's birthday is next week")),
    ]);
    const expected = [
      pattern('Sleep is better on gym days'),
      grief("Her dad's birthday is next week"),
    ];
    expect((await panelRead(uid)).contents.sort()).toEqual(expected.sort());

    // The app's own write (acknowledge) hides one and keeps the other's insight stored
    const stored = async () =>
      ((await db.doc(`bogle_users/${uid}/team_insights/data`).get()).data()?.insights ??
        []) as Array<{ id: string; content: string }>;
    const first = (await stored()).find((i) => i.content === expected[0])!;
    const ack = await fetch(`${base}/api/team-insights/acknowledge/${first.id}`, {
      method: 'POST',
      headers: { 'x-firebase-uid': uid },
    });
    expect(ack.status).toBe(200);
    expect((await panelRead(uid)).contents).toEqual([expected[1]]);
    expect((await stored()).map((i) => i.content).sort()).toEqual(expected.sort());
  });

  it('a document written in the old shape still reads', async () => {
    const uid = newUser();
    const now = Date.now();
    await db.doc(`bogle_users/${uid}/team_insights/data`).set({
      insights: [
        {
          id: 'insight_old',
          source: 'peter',
          target: 'all',
          priority: 'low',
          content: 'Saving a little every week adds up.',
          category: 'savings-encouragement',
          createdAt: now - 60_000,
          expiresAt: now + 60 * 60 * 1000,
          proactive: false,
          oneTime: true,
        },
      ],
      lastScannedAt: now - 60_000,
      _updatedAt: new Date(now - 60_000).toISOString(),
      _userId: uid,
    });

    expect((await panelRead(uid)).contents).toEqual(['Saving a little every week adds up.']);
  });
});

/**
 * The rules insight-store.ts holds on its own (#2777 moved them out of the generic
 * persistence layer, whose tests no longer reach them). Each case below goes red
 * when its rule is removed; see the PR that added them for the mutation runs.
 */
describe.skipIf(!emulator)('Team Insights store rules (Firestore emulator)', () => {
  const docOf = (uid: string) => db.doc(`bogle_users/${uid}/team_insights/data`);
  const storedOf = async (uid: string) =>
    ((await docOf(uid).get()).data()?.insights ?? []) as Array<{ id: string; content: string }>;

  /** An insight as cross-persona-insights.ts builds one, created `ageMs` ago. */
  const insightAt = (id: string, ageMs: number, extra: object = {}) => {
    const now = Date.now();
    return {
      id,
      source: 'maya' as const,
      target: 'all' as const,
      priority: 'normal' as const,
      content: `note ${id}`,
      category: 'behavior_pattern',
      createdAt: now - ageMs,
      expiresAt: now + 22 * 60 * 60 * 1000,
      proactive: true,
      oneTime: false,
      ...extra,
    };
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('writes nothing for a caller MINOR_CARE holds (safety)', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const [held, adult] = [newUser(), newUser()];
    const agent = await agentProcess();
    // The caller says they're 14 on a call bound to their account, as a voice turn does
    agent.minorCare.heldAfter('call-held', "I'm 14.", { userId: held });
    expect(agent.minorCare.userHeld(held)).toBe(true);
    expect(agent.minorCare.userHeld(adult)).toBe(false);

    await agent.share(held, 'surfacePatternInsight', mayaNotices('Skips lunch at school'));
    await agent.insights.acknowledgeInsight(held, 'insight_x');
    await agent.share(adult, 'surfacePatternInsight', mayaNotices('Walks after dinner'));

    expect((await docOf(held).get()).exists).toBe(false);
    // The same process, the same tool, a caller who isn't held: stored as usual
    expect((await storedOf(adult)).map((i) => i.content)).toEqual([pattern('Walks after dinner')]);
  });

  it('writes nothing for a shared placeholder id', async () => {
    const placeholders = ['anonymous', 'default', 'unknown', 'session'];
    await Promise.all(placeholders.map((id) => docOf(id).delete()));
    const agent = await agentProcess();
    const real = newUser();

    await Promise.all(
      placeholders.map(async (id) => {
        await agent.share(id, 'surfacePatternInsight', mayaNotices(`Shared id ${id}`));
        await agent.insights.acknowledgeInsight(id, 'insight_x');
      })
    );
    await agent.share(real, 'surfacePatternInsight', mayaNotices('A real account'));

    const exists = await Promise.all(
      placeholders.map(async (id) => (await docOf(id).get()).exists)
    );
    expect(exists).toEqual(placeholders.map(() => false));
    expect((await storedOf(real)).map((i) => i.content)).toEqual([pattern('A real account')]);
  });

  it('two calls adding the same note at once store it once (the check inside the transaction)', async () => {
    const uid = newUser();
    // Neither process has read the user, so each one's own view says "not there yet"
    const [a, b] = [await agentProcess(), await agentProcess()];

    await Promise.all([
      a.share(uid, 'surfacePatternInsight', mayaNotices('Sleeps better on gym days')),
      b.share(uid, 'surfacePatternInsight', mayaNotices('Sleeps better on gym days')),
    ]);

    expect((await storedOf(uid)).map((i) => i.content)).toEqual([
      pattern('Sleeps better on gym days'),
    ]);
  });

  it('an add applied again (a retry after a commit that landed) keeps one copy, by id', async () => {
    const uid = newUser();
    const agent = await agentProcess();
    const { changeStoredInsights, insightChanges } = agent.store;
    const firestore = agent.firestoreUtils.getFirestoreDb();
    // Two hours old, so the recent-duplicate check can't match it: only the id can
    const insight = insightAt('insight_retry', 2 * 60 * 60 * 1000);

    await changeStoredInsights(firestore, uid, insightChanges.add(insight));
    await changeStoredInsights(firestore, uid, insightChanges.add(insight));

    expect((await storedOf(uid)).map((i) => i.id)).toEqual(['insight_retry']);
  });

  it('consuming a one-time insight removes it from the store, and only it', async () => {
    const uid = newUser();
    await docOf(uid).set({
      insights: [
        insightAt('insight_once', 60_000, { oneTime: true, content: 'Ask how the interview went' }),
        insightAt('insight_keep', 60_000, { content: 'Mornings go better' }),
      ],
      lastScannedAt: Date.now() - 60_000,
      _updatedAt: new Date(Date.now() - 60_000).toISOString(),
      _userId: uid,
    });
    const agent = await agentProcess();
    await agent.insights.loadInsights(uid);

    agent.insights.consumeInsight(uid, 'insight_once');
    await agent.store.insightWritesSettled();

    expect((await storedOf(uid)).map((i) => i.id)).toEqual(['insight_keep']);
    expect((await panelRead(uid)).contents).toEqual(['Mornings go better']);
  });

  /**
   * Pinned as it is today, not as it should be (#2777 verifier, item 2): add, consume and
   * expiry fire and forget. When the transaction runs out of attempts the write is logged
   * and dropped: the caller isn't told, this process's view keeps the change, and nothing
   * retries it. acknowledge is the one write that rejects (the route answers 500).
   * Changing any of this should be a deliberate edit of this test.
   */
  it('a failed add is logged and dropped after the retries; acknowledge rejects', async () => {
    const uid = newUser();
    const agent = await agentProcess();
    const firestore = agent.firestoreUtils.getFirestoreDb();
    if (!firestore) throw new Error('no Firestore client');
    const realRun = firestore.runTransaction.bind(firestore);
    const attempts = { count: 0 };
    // Every attempt reads and writes as usual, then loses to contention (ABORTED, which the
    // SDK retries), so the SDK's own retry loop runs to its limit.
    const failing = vi.spyOn(firestore, 'runTransaction').mockImplementation((update, options) =>
      realRun(async (tx) => {
        attempts.count += 1;
        await update(tx);
        throw Object.assign(new Error('10 ABORTED: Transaction lock timeout'), { code: 10 });
      }, options)
    );

    const added = agent.insights.addCrossPersonaInsight(uid, {
      source: 'maya',
      target: 'all',
      priority: 'normal',
      content: 'Walks help on bad days',
      category: 'behavior_pattern',
      proactive: true,
      oneTime: false,
    });
    await expect(agent.store.insightWritesSettled()).resolves.toBeUndefined();

    expect(attempts.count).toBe(5); // the SDK's DEFAULT_MAX_TRANSACTION_ATTEMPTS
    expect(added.content).toBe('Walks help on bad days'); // the caller got its insight back
    expect((await docOf(uid).get()).exists).toBe(false); // nothing stored
    // This process still sees it
    expect(agent.insights.getProactiveInsights(uid).map((i) => i.id)).toEqual([added.id]);
    // Logged once, by the store
    const createLogger = vi.mocked(agent.logger.createLogger);
    const at = createLogger.mock.calls.findIndex(
      ([bindings]) => bindings.module === 'cross-persona-insight-store'
    );
    const storeLog = createLogger.mock.results[at]?.value as { warn: ReturnType<typeof vi.fn> };
    expect(storeLog.warn).toHaveBeenCalledTimes(1);
    expect(storeLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: uid, error: expect.stringContaining('ABORTED') }),
      'Team insight write failed'
    );

    // acknowledge, under the same failure, tells its caller
    const before = attempts.count;
    await expect(agent.insights.acknowledgeInsight(uid, added.id)).rejects.toThrow('ABORTED');
    expect(attempts.count - before).toBe(5);

    // Once writes work again, nothing re-sends the dropped add: the next change lands alone
    failing.mockRestore();
    const later = insightAt('insight_later', 0);
    await agent.store.changeStoredInsights(firestore, uid, agent.store.insightChanges.add(later));
    expect((await storedOf(uid)).map((i) => i.id)).toEqual(['insight_later']);
  }, 60_000);
});
