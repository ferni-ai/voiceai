/**
 * A new caller's first engagement save lands; an erased caller's is dropped (#2982, #2966).
 *
 * Every engagement write (the profile, ritual streaks, weather, predictions, huddles,
 * sessions) is dropped when neither the user record (bogle_users/{uid}) nor the
 * engagement profile exists, because that is what an account erasure leaves
 * (engagement-write-unless-erased.ts). The worry in #2982: a brand-new caller looks the
 * same. This runs the real path: the app's first call (GET /api/user/profile) creates the
 * record, then the real engagement store saves the profile and a ritual streak.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the route
// and the stores read through them, so this file swaps the real ones back in.
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
// A request carrying x-test-uid is signed in as that user (a verified token's uid).
vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  return {
    ...actual,
    requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const uid = req.headers['x-test-uid'];
      if (typeof uid !== 'string') return actual.requireAuth(req, res);
      return { userId: uid, isAdmin: false, isDevMode: false, authMethod: 'firebase' as const };
    }),
  };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-engagement-first-save';

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const streak = (ritualId: string) => ({
  ritualId,
  personaId: 'ferni',
  currentStreak: 1,
  longestStreak: 1,
  lastCompletedAt: '2026-10-31T08:00:00.000Z',
  totalCompletions: 1,
  streakHistory: [],
});

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

async function exists(path: string): Promise<boolean> {
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  return (await getAdminFirestore().doc(path).get()).exists;
}

describe.skipIf(!emulator)('engagement first save (Firestore emulator)', () => {
  it("a new caller's first save lands once the app's first call made their record", async () => {
    const uid = newUser();
    expect(await exists(`bogle_users/${uid}`)).toBe(false);

    const first = await fetch(`${base}/api/user/profile`, { headers: { 'x-test-uid': uid } });
    expect(first.status).toBe(200);
    expect(await exists(`bogle_users/${uid}`)).toBe(true);

    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    await store.getProfile(uid); // a new caller: creates and saves the default profile
    await store.saveRitualStreak(uid, streak('morning-sky'));

    expect(await exists(`engagement_profiles/${uid}`)).toBe(true);
    expect(await exists(`engagement_profiles/${uid}/ritual_streaks/morning-sky`)).toBe(true);
  });

  it("an erased caller's save writes nothing", async () => {
    const uid = newUser();
    await fetch(`${base}/api/user/profile`, { headers: { 'x-test-uid': uid } });
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    await store.saveRitualStreak(uid, streak('morning-sky'));
    expect(await exists(`engagement_profiles/${uid}/ritual_streaks/morning-sky`)).toBe(true);

    // What account erasure leaves: no record, no profile, nothing under it
    const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
    await getAdminFirestore().recursiveDelete(
      getAdminFirestore().doc(`engagement_profiles/${uid}`)
    );
    await getAdminFirestore().recursiveDelete(getAdminFirestore().doc(`bogle_users/${uid}`));

    await store.saveRitualStreak(uid, streak('evening-wind-down')); // a live call, still running
    expect(await exists(`engagement_profiles/${uid}/ritual_streaks/evening-wind-down`)).toBe(false);
    expect(await exists(`engagement_profiles/${uid}`)).toBe(false);
  });
});
