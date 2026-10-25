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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
type Agent = { share: (uid: string, tool: string, args: object) => Promise<void> };

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
