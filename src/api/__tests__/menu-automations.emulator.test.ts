/**
 * Menu item 3, What I Do For You: a routine set up in a call shows in the panel.
 * Write with the voice routines tool (tools/domains/routines/index.ts, createRoutine),
 * then GET /api/life-automation/workflows through the real route handler, the path
 * life-automation.service.ts sends, on the Firestore emulator. Only requireAuth is
 * replaced: it answers with the uid the test names, as a verified token would.
 * apps/web/tests/ui/menu-automations.test.ts pins the panel to this exact GET.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../tools/registry/types.js';

// The shared setup fakes this module for every test; here the store must reach the emulator
vi.mock('../../utils/firestore-utils.js', async () =>
  vi.importActual('../../utils/firestore-utils.js')
);
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(
    async (
      req: { headers: Record<string, string | undefined> },
      res: { writeHead: (s: number) => { end: () => void } }
    ) => {
      const uid = req.headers['x-test-uid'];
      if (!uid) {
        res.writeHead(401).end();
        return null;
      }
      return { userId: uid, isAdmin: false, isDevMode: false, authMethod: 'firebase' };
    }
  ),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// src/tests/setup.ts fakes firebase-admin for every test; this file reads the emulator
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
process.env.GCLOUD_PROJECT ??= 'demo-menu-automations';

let server: Server;
let base: string;
let db: Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  const { handleLifeAutomationRoutes } = await import('../life-automation-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleLifeAutomationRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** The createRoutine tool exactly as the voice agent gets it */
async function createRoutineByVoice(
  uid: string,
  args: Record<string, string>,
  sessionId?: string
): Promise<string> {
  const { routineToolDefinitions } = await import('../../tools/domains/routines/index.js');
  const definition = routineToolDefinitions.find((d) => d.id === 'createRoutine');
  const tool = definition!.create({ userId: uid, sessionId } as ToolContext) as unknown as {
    execute: (a: unknown, o?: unknown) => Promise<string>;
  };
  return tool.execute(args, {});
}

async function listWorkflows(uid: string) {
  const res = await fetch(
    `${base}/api/life-automation/workflows?userId=${encodeURIComponent(uid)}`,
    { headers: { 'x-test-uid': uid } }
  );
  return {
    status: res.status,
    body: (await res.json()) as { workflows?: Array<Record<string, unknown>> },
  };
}

describe.skipIf(!emulator)('routines: voice writer -> panel route (Firestore emulator)', () => {
  it('a routine made in a call comes back from /api/life-automation/workflows', async () => {
    const uid = id();
    const said = await createRoutineByVoice(uid, {
      name: 'Morning stretch',
      triggerType: 'time',
      triggerValue: '7:30 AM',
      action: 'Time to stretch',
    });

    expect(said).not.toMatch(/trouble|wrong|couldn/i);
    // It reached Firestore, not only the process memory
    const stored = await db.doc(`users/${uid}/life_automation/workflows`).get();
    expect(JSON.stringify(stored.data()?.workflows)).toContain('Morning stretch');

    const { status, body } = await listWorkflows(uid);
    expect(status).toBe(200);
    expect(body.workflows).toContainEqual(
      expect.objectContaining({
        name: 'Morning stretch',
        tags: ['voice-created'],
        trigger: expect.objectContaining({ type: 'time' }),
      })
    );
  });

  it("a time said in a call reads back in the caller's zone, saved but not running", async () => {
    const uid = id();
    const { rememberCallerTimeZone, forgetCallerTimeZone } =
      await import('../../utils/caller-time-zone.js');
    rememberCallerTimeZone('America/Chicago', `s-${uid}`, uid); // as voice-agent-entry does
    const said = await createRoutineByVoice(
      uid,
      { name: 'Evening walk', triggerType: 'time', triggerValue: '7 pm', action: 'Walk time' },
      `s-${uid}`
    );
    forgetCallerTimeZone(`s-${uid}`, uid);

    expect(said).toBe(`Saved "Evening walk" in What I Do For You. It won't run on its own yet.`);
    const { body } = await listWorkflows(uid);
    expect(body.workflows).toEqual([
      expect.objectContaining({
        name: 'Evening walk',
        status: 'paused', // nothing runs saved routines yet
        runCount: 0,
        trigger: { type: 'time', schedule: '0 19 * * *', timezone: 'America/Chicago' },
      }),
    ]);
  });

  it("someone else's routine never shows", async () => {
    await createRoutineByVoice(id(), {
      name: 'Private routine',
      triggerType: 'phrase',
      triggerValue: 'good night',
      action: 'Sleep well',
    });
    const { body } = await listWorkflows(id());
    expect(JSON.stringify(body)).not.toContain('Private routine');
  });
});
