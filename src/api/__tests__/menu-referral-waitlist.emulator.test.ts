// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://app.ferni.ai/"}
/**
 * Bring a Friend (menu item 33) with the waitlist gate on: a friend who opens
 * the link, is waitlisted, and is approved later is still recorded as referred.
 *
 * The code used to be read from the URL only after the sign-in gate and the
 * waitlist check, so a waitlisted friend never kept it. Now the web keeps it
 * from first load and sends it with the access check, the waitlist record keeps
 * it, and the check hands it back on approval (even on another device).
 *
 * Real seeds and waitlist routes on a node:http server against the Firestore
 * emulator; the real web referral and access-check services in a page on the
 * app's origin. Only the Firebase token check is faked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithFakeTokens } from '../../tests/helpers/fake-firebase-auth.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-referral';

// src/tests/setup.ts fakes these for every test; the waitlist route needs the real ones
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));

const server = vi.hoisted(() => ({ base: '', uid: '' }));

// The web API client, sending as the signed-in person to the test server
vi.mock('../../../apps/web/src/utils/api.js', () => {
  const send = async (
    method: string,
    path: string,
    params?: Record<string, string>,
    body?: unknown
  ) => {
    const url = new URL(`${server.base}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${server.uid}`,
        'x-firebase-uid': server.uid,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: (await res.json()) as unknown };
  };
  return {
    apiGet: (path: string, params?: Record<string, string>) => send('GET', path, params),
    apiPost: (path: string, body?: unknown) => send('POST', path, undefined, body),
  };
});
vi.mock('../../../apps/web/src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));

/** The web services' surface this test drives. */
interface WebReferral {
  loadGarden(): Promise<{ referralCode: string; referralUrl: string } | null>;
  checkReferralFromUrl(): string | null;
  processPendingReferral(): Promise<{ processed: boolean; bonusAwarded?: number }>;
}
interface WebAccess {
  checkAccess(options?: { attempts?: number }): Promise<{ kind: string }>;
}
// Non-literal specifiers keep the root tsc, which compiles src/ only, out of the web app
const WEB_REFERRAL = '../../../apps/web/src/services/referral.service.js';
const WEB_ACCESS = '../../../apps/web/src/services/access-check.js';

let http: Server;
let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const emailOf = (uid: string) => `${uid}@example.com`;
const docIdOf = (email: string) => Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

beforeAll(async () => {
  if (!emulator) return;
  process.env.WAITLIST_GATE = 'on';
  const { handleSeedsRoutes } = await import('../seeds-routes.js');
  const { handleWaitlistRoutes } = await import('../waitlist-routes.js');
  http = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    const route = pathname.startsWith('/api/waitlist')
      ? handleWaitlistRoutes(req, res)
      : handleSeedsRoutes(req, res, pathname);
    void route.then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    http.listen(0, '127.0.0.1', resolve);
  });
  server.base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const { getAdminApp, getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  // The bearer token is the uid; everyone has a verified email and a live account
  signInWithFakeTokens(getAuth(getAdminApp()), (token) => ({
    uid: token,
    email: emailOf(token),
    email_verified: true,
  }));
});

afterAll(() => {
  http?.close();
  delete process.env.WAITLIST_GATE;
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

/** What approving from the waitlist writes (waitlist-routes.ts approveUserAndGrantAccess). */
async function approve(uid: string): Promise<void> {
  const id = docIdOf(emailOf(uid));
  await db.collection('waitlist').doc(id).update({ status: 'approved', approvedAt: new Date() });
  await db
    .collection('user_profiles')
    .doc(id)
    .set({
      email: emailOf(uid),
      subscription: { tier: 'partner', status: 'active' },
    });
}

async function friendOpensLinkAndWaits(referrer: string, friend: string) {
  const web = (await import(WEB_REFERRAL)) as WebReferral;
  const access = (await import(WEB_ACCESS)) as WebAccess;
  server.uid = referrer;
  const garden = await web.loadGarden();
  expect(garden).not.toBeNull();

  // First load on the link (/grow/<code> on the app; #1257 makes referralUrl point here):
  // the code is kept before the sign-in gate (app.ts)
  window.history.replaceState({}, '', `/grow/${garden!.referralCode}`);
  expect(web.checkReferralFromUrl()).toBe(garden!.referralCode);
  server.uid = friend;
  expect(await access.checkAccess({ attempts: 1 })).toEqual({
    kind: 'waitlisted',
    email: emailOf(friend),
  });
  const record = (
    await db
      .collection('waitlist')
      .doc(docIdOf(emailOf(friend)))
      .get()
  ).data();
  expect(record).toMatchObject({ status: 'pending', referralCode: garden!.referralCode });
  return { web, access };
}

async function expectReferred(friend: string, referrer: string): Promise<void> {
  const friendSeeds = (await db.collection('user_seeds').doc(friend).get()).data();
  expect(friendSeeds?.referredBy).toBe(referrer);
}

describe.skipIf(!emulator)('Bring a Friend through the waitlist (Firestore emulator)', () => {
  it('a waitlisted friend, approved later on the same device, is recorded as referred', async () => {
    const [referrer, friend] = [newUser(), newUser()];
    const { web, access } = await friendOpensLinkAndWaits(referrer, friend);

    await approve(friend);
    // They come back to the app itself, not the link
    expect(await access.checkAccess({ attempts: 1 })).toEqual({ kind: 'approved' });
    expect(await web.processPendingReferral()).toEqual({ processed: true, bonusAwarded: 25 });

    await expectReferred(friend, referrer);
  });

  it('approved and back on another device, the waitlist record supplies the code', async () => {
    const [referrer, friend] = [newUser(), newUser()];
    const { web, access } = await friendOpensLinkAndWaits(referrer, friend);

    await approve(friend);
    localStorage.clear(); // a different browser
    expect(await access.checkAccess({ attempts: 1 })).toEqual({ kind: 'approved' });
    expect(await web.processPendingReferral()).toEqual({ processed: true, bonusAwarded: 25 });

    await expectReferred(friend, referrer);
  });
});
