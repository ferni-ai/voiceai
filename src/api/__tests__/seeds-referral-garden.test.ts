/**
 * The referral link the garden shows must be the one the server registered, and
 * the counts must be ones the server really holds.
 *
 * user_seeds docs are also created by paths that never set a referralCode (seed
 * awards for conversations/streaks). For those users GET /api/seeds/garden handed
 * out a freshly generated, never-saved code on every call, so the shared link did
 * not resolve and POST /api/seeds/referral answered "Invalid referral code".
 * The garden also reported `activeReferrals` / `weeklyPassiveSeeds` that nothing
 * tracks or pays.
 *
 * Real HTTP through the real handler; only Firestore is faked (in memory).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const fs = vi.hoisted(() => {
  const docs = new Map<string, Doc>();
  const inc = (n: number) => ({ __inc: n });
  const union = (v: unknown) => ({ __union: v });

  const applyField = (target: Doc, path: string, value: unknown) => {
    const keys = path.split('.');
    let node = target;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {}) as Doc;
    const last = keys[keys.length - 1];
    const v = value as { __inc?: number; __union?: unknown };
    if (v && typeof v === 'object' && '__inc' in v)
      node[last] = ((node[last] as number) ?? 0) + v.__inc!;
    else if (v && typeof v === 'object' && '__union' in v) {
      const cur = (node[last] as unknown[]) ?? [];
      node[last] = cur.includes(v.__union) ? cur : [...cur, v.__union];
    } else node[last] = value;
  };
  const write = (id: string, data: Doc, merge: boolean) => {
    const target: Doc = merge ? (docs.get(id) ?? {}) : {};
    for (const [k, v] of Object.entries(data)) applyField(target, k, v);
    docs.set(id, target);
  };
  const ref = (id: string) => ({
    id,
    get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
    set: async (d: Doc, o?: { merge?: boolean }) => write(id, d, !!o?.merge),
  });
  const db = {
    collection: () => ({
      doc: (id: string) => ref(id),
      where: (field: string, _op: string, value: unknown) => ({
        limit: () => ({
          get: async () => {
            const hits = [...docs.entries()].filter(([, d]) => d[field] === value);
            return {
              empty: hits.length === 0,
              docs: hits.slice(0, 1).map(([id, d]) => ({ id, data: () => d })),
            };
          },
        }),
      }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: (r: { get: () => Promise<unknown> }) => r.get(),
        set: (r: { id: string }, d: Doc, o?: { merge?: boolean }) => write(r.id, d, !!o?.merge),
        update: (r: { id: string }, d: Doc) => write(r.id, d, true),
      }),
  };
  return { docs, db, inc, union };
});

vi.mock('firebase-admin', () => {
  const firestore = Object.assign(() => fs.db, {
    Timestamp: { now: () => new Date(0) },
    FieldValue: { increment: fs.inc, arrayUnion: fs.union },
  });
  return { default: { apps: [{}], initializeApp: () => ({}), firestore } };
});

const { handleSeedsRoutes } = await import('../seeds-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleSeedsRoutes(req, res, url.pathname).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => fs.docs.clear());

type Garden = {
  title: string;
  totalReferrals: number;
  totalEarnedFromReferrals: number;
  referralCode: string;
  referralUrl: string;
} & Record<string, unknown>;

const garden = async (uid: string) =>
  (await (
    await fetch(`${base}/api/seeds/garden`, { headers: { 'x-firebase-uid': uid } })
  ).json()) as Garden;
const refer = (uid: string, referralCode: string) =>
  fetch(`${base}/api/seeds/referral`, {
    method: 'POST',
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: JSON.stringify({ referralCode }),
  });

/** A user whose seeds doc came from a seed award, so it has no referralCode. */
const seedAwardOnlyUser = (uid: string) =>
  fs.docs.set(uid, {
    balance: 12,
    lifetimeEarned: 12,
    earnedFrom: { conversations: 2, streaks: 0, referrals: 0 },
  });

describe('garden: the shared link is the registered one', () => {
  it('gives a user whose seeds doc has no code ONE stable, saved code', async () => {
    seedAwardOnlyUser('alice');

    const first = await garden('alice');
    const second = await garden('alice');

    expect(first.referralCode).toMatch(/^[a-z0-9]{6}-[a-z]+$/);
    expect(second.referralCode).toBe(first.referralCode);
    expect(first.referralUrl).toBe(`https://ferni.ai/grow/${first.referralCode}`);
    expect(fs.docs.get('alice')?.referralCode).toBe(first.referralCode); // persisted, not just returned
  });

  it('a friend using the shown link registers, and the garden counts move', async () => {
    seedAwardOnlyUser('alice');
    const before = await garden('alice');
    expect(before.totalReferrals).toBe(0);
    expect(before.totalEarnedFromReferrals).toBe(0);

    const res = await refer('bob', before.referralCode);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, newUserBonus: 25, referrerBonus: 25 });
    const after = await garden('alice');
    expect(after.totalReferrals).toBe(1);
    expect(after.totalEarnedFromReferrals).toBe(25);
    expect(after.referralCode).toBe(before.referralCode);
  });

  it('a code the server never issued is rejected', async () => {
    const res = await refer('bob', 'zzzzzz-meadow');
    expect(res.status).toBe(404);
  });

  it('does not report counters nothing tracks or pays', async () => {
    seedAwardOnlyUser('alice');
    await refer('bob', (await garden('alice')).referralCode);

    const g = await garden('alice');
    expect(g).not.toHaveProperty('activeReferrals');
    expect(g).not.toHaveProperty('weeklyPassiveSeeds');

    const summary = (await (
      await fetch(`${base}/api/seeds`, { headers: { 'x-firebase-uid': 'alice' } })
    ).json()) as { garden: Record<string, unknown>; referralCode: string };
    expect(summary.referralCode).toBe(g.referralCode);
    expect(summary.garden).toEqual({ title: 'seedling', totalReferrals: 1 });
  });
});
