/**
 * /api/seeds claim-daily, gift and referral pay through the seed ledger: real HTTP through
 * the real handler, on the Firestore emulator. Each pays exactly once however it's retried,
 * a gift moves seeds between two existing accounts or not at all, and a reused gift id
 * can't mint seeds.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-seed-ledger';

let server: Server;
let base: string;
let db: admin.firestore.Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleSeedsRoutes } = await import('../seeds-routes.js');
  server = createServer((req, res) => {
    void handleSeedsRoutes(req, res, new URL(req.url ?? '/', 'http://x').pathname).then(
      (handled) => {
        if (!handled) res.writeHead(404).end();
      }
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = admin.firestore();
});

afterAll(() => server?.close());

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Record<string, unknown>;
}
const balance = async (uid: string) =>
  (await db.collection('user_seeds').doc(uid).get()).data()?.balance;

let a: string;
let b: string;
beforeEach(() => {
  a = id();
  b = id();
});

describe.skipIf(!emulator)('seeds routes on the ledger (Firestore emulator)', () => {
  it('claim-daily pays once a day, and a conversation that day pays nothing more', async () => {
    const first = await call(a, 'POST', '/api/seeds/claim-daily');
    const second = await call(a, 'POST', '/api/seeds/claim-daily');
    const { awardDailyConversation } = await import('../../services/seeds/earn.js');
    const conversation = await awardDailyConversation(db, a);

    expect(first).toMatchObject({ claimed: true, amount: 5, newBalance: 30 });
    expect(second).toEqual({ claimed: false, reason: 'Already claimed today' });
    expect(conversation.daily.applied).toBe(false);
    expect(await balance(a)).toBe(30);
  });

  it('a gift moves seeds once between two accounts, with the bonus', async () => {
    await call(a, 'GET', '/api/seeds');
    await call(b, 'GET', '/api/seeds');
    const gift = { toUserId: b, amount: 10, giftId: 'gift-0001' };

    expect(await call(a, 'POST', '/api/seeds/gift', gift)).toMatchObject({
      success: true,
      totalReceived: 12,
      newBalance: 15,
    });
    expect(await call(a, 'POST', '/api/seeds/gift', gift)).toEqual({
      success: false,
      error: 'Gift already sent',
    });
    expect([await balance(a), await balance(b)]).toEqual([15, 37]);
  });

  it('reusing a gift id for someone else mints nothing (it used to credit them free)', async () => {
    const c = id();
    for (const u of [a, b, c]) await call(u, 'GET', '/api/seeds');
    await call(a, 'POST', '/api/seeds/gift', { toUserId: b, amount: 10, giftId: 'gift-0002' });
    const reuse = await call(a, 'POST', '/api/seeds/gift', {
      toUserId: c,
      amount: 10,
      giftId: 'gift-0002',
    });

    expect(reuse).toMatchObject({ success: false });
    expect([await balance(a), await balance(c)]).toEqual([15, 25]);
  });

  it('a gift needs an existing recipient and enough seeds; neither failure moves any', async () => {
    await call(a, 'GET', '/api/seeds');
    expect(
      await call(a, 'POST', '/api/seeds/gift', { toUserId: 'nobody-' + id(), amount: 10 })
    ).toEqual({
      success: false,
      error: 'Recipient not found',
    });
    await call(b, 'GET', '/api/seeds');
    await call(a, 'POST', '/api/seeds/gift', { toUserId: b, amount: 20 }); // 25 -> 5
    expect(await call(a, 'POST', '/api/seeds/gift', { toUserId: b, amount: 10 })).toEqual({
      success: false,
      error: 'Insufficient seeds',
    });
    expect(await balance(a)).toBe(5);
  });

  it('a referral pays both people 25, once', async () => {
    const { referralCode } = await call(a, 'GET', '/api/seeds');
    const first = await call(b, 'POST', '/api/seeds/referral', { referralCode });
    const again = await call(b, 'POST', '/api/seeds/referral', { referralCode });

    expect(first).toMatchObject({ success: true, newUserBonus: 25, referrerBonus: 25 });
    expect(again).toEqual({ success: false, error: 'Already referred by someone' });
    expect([await balance(a), await balance(b)]).toEqual([50, 50]);
    expect((await db.collection('user_seeds').doc(a).get()).data()?.referrals).toEqual([b]);
  });

  it('a friend using the shown link registers, and the garden counts move', async () => {
    // A seeds doc written by an older path, with no referral code yet
    await db.collection('user_seeds').doc(a).set({ balance: 10 });
    const before = await call(a, 'GET', '/api/seeds/garden');
    expect(before).toMatchObject({ totalReferrals: 0, totalEarnedFromReferrals: 0 });

    expect(
      await call(b, 'POST', '/api/seeds/referral', { referralCode: before.referralCode })
    ).toMatchObject({
      success: true,
    });
    const after = await call(a, 'GET', '/api/seeds/garden');
    expect(after).toMatchObject({
      totalReferrals: 1,
      totalEarnedFromReferrals: 25,
      referralCode: before.referralCode,
    });
    expect(after).not.toHaveProperty('activeReferrals');
    expect(after).not.toHaveProperty('weeklyPassiveSeeds');

    const summary = await call(a, 'GET', '/api/seeds');
    expect(summary.referralCode).toBe(after.referralCode);
    expect(summary.garden).toEqual({ title: 'seedling', totalReferrals: 1 });
  });
});
