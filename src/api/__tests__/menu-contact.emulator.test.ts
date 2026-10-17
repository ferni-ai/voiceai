/**
 * "Staying in Touch", call → panel: the phone and email the voice agent saves
 * (saveContactInfo → setUserContactInfo, written to the profile's contactInfo) come
 * back through GET /api/user/contact, the route the panel now reads
 * (apps/web/src/ui/contact-settings.ui.ts). The panel read /api/outreach/context,
 * which never returns contact details, and GET /api/user/contact masked them as '***',
 * so the form always opened blank.
 */
import { createServer, type Server } from 'node:http';
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
// Production's store (Firestore on Cloud Run); outside production getStore() picks memory.
vi.mock('../../memory/storage/store-factory.js', async () => {
  const { getFirestoreStore } = await import('../../memory/storage/firestore-store.js');
  return { getStore: async () => getFirestoreStore() };
});
// Signed in as the user named by the test header; no Firebase account (no verified phone).
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-test-uid'],
    isAdmin: false,
    authMethod: 'api_key',
  })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-contact';
process.env.PERSIST_AGENT_PROFILES = 'true'; // the agent's profile writes reach Firestore

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleUserRoutes } = await import('../user-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleUserRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

async function panelRead(uid: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`${base}/api/user/contact`, { headers: { 'x-test-uid': uid } });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!emulator)('Staying in Touch, call to panel (Firestore emulator)', () => {
  it('the phone and email the agent saves on a call show in the panel', async () => {
    const uid = newUser();
    const { getStore } = await import('../../memory/storage/store-factory.js');
    await (await getStore()).getOrCreateProfile(uid); // the caller's profile, made by the call
    const { setUserContactInfo } = await import('../../tools/domains/proactive/outreach/index.js');
    await setUserContactInfo(uid, { phone: '+15552017497', email: 'sam@example.com' });

    const { status, body } = await panelRead(uid);
    expect(status).toBe(200);
    expect(body.contactInfo).toMatchObject({ phone: '+15552017497', email: 'sam@example.com' });
  });

  it('the name and details saved from the panel come back on the next open', async () => {
    const uid = newUser();
    const save = await fetch(`${base}/api/user/contact`, {
      method: 'POST',
      headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '(555) 201-7400',
        email: 'alex@example.com',
        preferredName: 'Alex',
      }),
    });
    expect(save.status).toBe(200);

    expect((await panelRead(uid)).body.contactInfo).toMatchObject({
      phone: '+15552017400',
      email: 'alex@example.com',
      preferredName: 'Alex',
    });
  });
});
