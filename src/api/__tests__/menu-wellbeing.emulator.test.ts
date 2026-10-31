/**
 * "How You're Feeling", call → panel: the after-call wellbeing task
 * (wellbeing-tracking/after-call.ts) writes a snapshot that comes back through
 * GET /api/wellbeing/dashboard, the route the panel calls. Real persistence and
 * route on the Firestore emulator; only the model is a stand-in.
 *
 * Before: the only writer was a per-turn regex ("I'm exhausted"), which missed
 * how callers usually describe their week, so the panel stayed empty.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writer
// and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
  requireAuth: vi.fn(async (req: IncomingMessage, _res: ServerResponse) => ({
    userId: req.headers['x-test-uid'] as string,
    isAdmin: false,
  })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-wellbeing';

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleWellbeingRoutes } = await import('../wellbeing.routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleWellbeingRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** A call where the caller never says "I'm <feeling>" the way the per-turn regex needs. */
const CALL = [
  { role: 'assistant', content: 'Hey, how is your week going?' },
  { role: 'user', content: 'Doing pretty good honestly, just wiped out from all the travel.' },
];

async function callEnds(uid: string, flag: 'on' | 'off'): Promise<void> {
  const { recordWellbeingAfterCall } =
    await import('../../services/wellbeing-tracking/after-call.js');
  await recordWellbeingAfterCall(
    { userId: uid, sessionId: `s-${uid}`, startedAt: new Date(), turns: CALL },
    {
      env: { WELLBEING_AFTER_CALL: flag },
      llm: async () => '{"mood":0.7,"energy":0.2,"worry":null}',
    }
  );
}

async function dashboard(uid: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}/api/wellbeing/dashboard`, { headers: { 'x-test-uid': uid } });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe.skipIf(!emulator)("How You're Feeling, call to panel (Firestore emulator)", () => {
  it('a completed call shows up on the panel as how the caller is doing', async () => {
    const uid = newUser();
    expect((await dashboard(uid)).hasData).toBe(false);

    await callEnds(uid, 'on');

    const body = await dashboard(uid);
    expect(body.hasData).toBe(true);
    expect(body.currentState).toMatchObject({ mood: 0.7, energy: 0.2, anxiety: null });
  });

  it('writes nothing while WELLBEING_AFTER_CALL is off', async () => {
    const uid = newUser();
    await callEnds(uid, 'off');
    expect((await dashboard(uid)).hasData).toBe(false);
  });
});
