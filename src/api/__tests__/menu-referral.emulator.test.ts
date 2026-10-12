// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://app.ferni.ai/"}
/**
 * Bring a Friend (menu item 33), link → referral: the link /api/seeds/garden
 * hands out opens in the app, and a friend who opens it is recorded as
 * referred. The real seeds route runs on a node:http server against the
 * Firestore emulator. The friend's side is the real web referral service
 * (apps/web/src/services/referral.service.ts) in a page on the app's origin,
 * with its API client pointed at that server.
 *
 * The link used to be https://ferni.ai/grow/<code>, the website, which has
 * no such page (HTTP 200 with a raw '{{ errorPage.title | t }}' title). The
 * code never reached the app, so referredBy stayed 0.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-referral';

const server = vi.hoisted(() => ({ base: '', uid: '' }));

// The web API client, sending as the signed-in friend to the test server
vi.mock('../../../apps/web/src/utils/api.js', () => {
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${server.base}${path}`, {
      method,
      headers: { 'x-firebase-uid': server.uid, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: (await res.json()) as unknown };
  };
  return {
    apiGet: (path: string) => send('GET', path),
    apiPost: (path: string, body?: unknown) => send('POST', path, body),
  };
});
vi.mock('../../../apps/web/src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));

/** The web service's surface this test drives (apps/web/src/services/referral.service.ts). */
interface WebReferral {
  loadGarden(): Promise<{ referralCode: string; referralUrl: string } | null>;
  checkReferralFromUrl(): string | null;
  processPendingReferral(): Promise<{ processed: boolean; bonusAwarded?: number }>;
}
// A non-literal specifier keeps the root tsc, which compiles src/ only, out of the web app
const WEB_REFERRAL = '../../../apps/web/src/services/referral.service.js';

let http: Server;
let db: admin.firestore.Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleSeedsRoutes } = await import('../seeds-routes.js');
  http = createServer((req, res) => {
    void handleSeedsRoutes(req, res, new URL(req.url ?? '/', 'http://x').pathname).then(
      (handled) => {
        if (!handled) res.writeHead(404).end();
      }
    );
  });
  await new Promise<void>((resolve) => {
    http.listen(0, '127.0.0.1', resolve);
  });
  server.base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = admin.firestore();
});

afterAll(() => http?.close());

describe.skipIf(!emulator)('Bring a Friend link (Firestore emulator)', () => {
  it('the shared link opens in the app, and the friend who opens it is recorded as referred', async () => {
    const referrer = newUser();
    const friend = newUser();
    const web = (await import(WEB_REFERRAL)) as WebReferral;

    server.uid = referrer;
    const garden = await web.loadGarden();
    expect(garden).not.toBeNull();
    const link = new URL(garden!.referralUrl);
    expect(link.origin).toBe(window.location.origin); // the app, not the website

    // The friend opens the link, signs in and finishes a first conversation
    window.history.replaceState({}, '', link.href);
    expect(web.checkReferralFromUrl()).toBe(garden!.referralCode);
    server.uid = friend;
    expect(await web.processPendingReferral()).toEqual({ processed: true, bonusAwarded: 25 });

    const friendSeeds = (await db.collection('user_seeds').doc(friend).get()).data();
    const referrerSeeds = (await db.collection('user_seeds').doc(referrer).get()).data();
    expect(friendSeeds?.referredBy).toBe(referrer);
    expect(referrerSeeds?.referrals).toEqual([friend]);
  });
});
