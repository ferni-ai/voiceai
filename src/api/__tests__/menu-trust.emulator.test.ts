/**
 * "Trust & Growth", call → panel: what the voice agent records during a call
 * comes back through the six /api/trust/* routes the panel calls.
 *
 * Writer: the agent's real per-turn recorder (recordTurnTrustData, called from
 * recordAllLearningData in turn-learning.ts) and its real session-end save
 * (onSessionEnd, called from cleanup-handler.ts). Reader: the real route on
 * node:http, loaded after vi.resetModules so its in-memory trust Maps start
 * empty, like the separate API process. URLs come from the panel's own
 * trustTabUrl. Real firebase-admin on the Firestore emulator.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LearningContext } from '../../agents/voice-agent/turn-learning.js';

// src/tests/setup.ts fakes firebase-admin for every test; swap the real one back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
// The agent's logger needs the LiveKit runtime; nothing here reads its output.
vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livekit/agents')>()),
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
  requireAuth: vi.fn(async (req: IncomingMessage, _res: ServerResponse) => ({
    userId: req.headers['x-test-uid'] as string,
    isAdmin: false,
  })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-trust';

const TZ = 'America/New_York';
const TABS = ['health', 'timeline', 'events', 'journal', 'media', 'insights'] as const;
type Tab = (typeof TABS)[number];

/**
 * The panel's own URL builder and parser (apps/web trust-dashboard-data.ts). Imported
 * by a variable path because apps/web is outside this tsconfig's rootDir.
 */
const PANEL_DATA = '../../../apps/web/src/ui/trust-dashboard-data.js';
interface PanelData {
  trustTabUrl(tab: Tab, opts: { tz?: string; period?: 'week' | 'month' }): string;
  parseTrustTab(tab: Tab, body: unknown): unknown;
}
const panelData = (): Promise<PanelData> => import(PANEL_DATA) as Promise<PanelData>;

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const userA = newUser();

/** One call for `userId`: a turn through the agent's recorder, then the session-end save. */
async function agentCall(userId: string, userText: string): Promise<void> {
  const { recordTurnTrustData } = await import('../../agents/voice-agent/turn-learning.js');
  const { onSessionEnd } = await import('../../services/trust-systems/index.js');
  const ctx: LearningContext = {
    userId,
    sessionId: `s-${userId}`,
    personaId: 'ferni',
    turnCount: 1,
    userText,
    emotionalResult: { primary: 'joy', intensity: 0.8, distressLevel: 0 },
    injections: [],
    turnResult: { emotional: { primary: 'joy', intensity: 0.8 }, context: {} },
  };
  expect(await recordTurnTrustData(ctx)).toBe(true);
  await onSessionEnd(userId);
}

beforeAll(async () => {
  if (!emulator) return;
  await agentCall(userA, 'I have a job interview next Tuesday at Google');
  vi.resetModules(); // the API server is another process: fresh, empty trust Maps
  const { handleTrustSystemsRoutes } = await import('../trust-systems-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleTrustSystemsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** GET a tab the way the panel does (trust-dashboard.ui.ts loadTabData). */
async function panelGet(uid: string, tab: Tab, extra = ''): Promise<Record<string, unknown>> {
  const { trustTabUrl } = await panelData();
  const path = trustTabUrl(tab, { tz: TZ, period: 'month' });
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${extra ? sep + extra : ''}`, {
    headers: { 'x-test-uid': uid },
  });
  expect(res.status, path).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe.skipIf(!emulator)('Trust & Growth, call to panel (Firestore emulator)', () => {
  it('every tab has data after one call, and the panel parses each one', async () => {
    const { parseTrustTab } = await panelData();
    for (const tab of TABS) {
      const body = await panelGet(userA, tab);
      expect(body.hasData, tab).toBe(true);
      expect(parseTrustTab(tab, body), tab).not.toBeNull();
    }
  });

  it('the panel shows what was said: the mood and the interview', async () => {
    const timeline = await panelGet(userA, 'timeline');
    expect(String(timeline.currentMood)).toContain('joy');
    expect((await panelGet(userA, 'media')).mood).toBe('joy');

    const events = await panelGet(userA, 'events');
    const all = ['today', 'thisWeek', 'nextWeek', 'thisMonth'].flatMap(
      (k) => events[k] as Array<{ description: string }>
    );
    expect(all.map((e) => e.description.toLowerCase()).join(' | ')).toContain('interview');
  });

  it('another user sees none of it, even asking for it by ?userId', async () => {
    const userB = newUser();
    for (const tab of TABS) {
      expect((await panelGet(userB, tab)).hasData, tab).toBe(false);
      expect((await panelGet(userB, tab, `userId=${userA}`)).hasData, tab).toBe(false);
    }
  });
});
