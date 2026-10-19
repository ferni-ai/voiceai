/**
 * End to end with the REAL counters: the real verify-phone route, the real
 * code store (its in-memory fallback, with its per-code attempt limit and
 * single use), and the real textVerificationCode limits over an in-memory
 * transaction that is never reset between requests. Only Firebase Auth and the
 * SMS provider are faked. A per-code attempt limit or confirm limit that
 * stopped counting would fail here, not just in unit tests.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const phones = new Map<string, string>();
  const texts: Array<{ to: string; body: string }> = [];
  const store = new Map<string, string[]>();
  return {
    phones,
    texts,
    store,
    clock: Date.parse('2026-10-18T16:00:00Z'),
    authApi: {
      getUserByPhoneNumber: async (phoneNumber: string) => {
        for (const [uid, p] of phones) if (p === phoneNumber) return { uid };
        throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      },
      updateUser: async (uid: string, update: { phoneNumber: string }) => {
        phones.set(uid, update.phoneNumber);
      },
    },
  };
});

vi.mock('firebase-admin', () => ({ default: { apps: [{}] } }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => fake.authApi }));
// No Firestore: the code store uses its own in-memory fallback, with its real rules.
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => {
    throw new Error('no firestore in this test');
  },
}));
vi.mock('../../services/identity/firebase-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/identity/firebase-auth.js')>()),
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: token.slice(4), claims: { admin: false }, isAnonymous: false }
      : null
  ),
}));
vi.mock('../../services/outreach/verification-text.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../services/outreach/verification-text.js')>();
  const deps = {
    env: { LOG_HASH_SECRET: 'test-secret' },
    atomically: async <T>(
      keys: string[],
      _optOut: string,
      decide: (
        r: Record<string, string[]>,
        optedOut: boolean
      ) => { result: T; write?: Record<string, string[]> }
    ) => {
      const { result, write } = decide(
        Object.fromEntries(keys.map((k) => [k, fake.store.get(k) ?? []])),
        false
      );
      for (const [k, v] of Object.entries(write ?? {})) fake.store.set(k, v);
      return result;
    },
    send: async (m: { to: string; body: string }) => {
      fake.texts.push(m);
      return { success: true, messageSid: 'SM1' };
    },
    now: () => new Date(fake.clock),
  };
  return {
    ...real,
    reserveConfirmTry: (u: string, p: string) => real.reserveConfirmTry(u, p, deps),
    textVerificationCode: (u: string, p: string, make: (e: string) => Promise<string>) =>
      real.textVerificationCode(u, p, make, deps),
  };
});

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
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

const post = async (path: string, body: unknown, user: string) => {
  const res = await fetch(`${base}/api/outreach${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer tok-${user}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
/** Asks for a code and returns the one texted (a minute later each time). */
async function codeFor(user: string, phone: string): Promise<string> {
  fake.clock += 61_000;
  expect((await post('/verify-phone', { phone }, user)).status).toBe(200);
  const sent = fake.texts.at(-1);
  expect(sent?.to).toBe(phone);
  return /code is (\d{6})/.exec(sent?.body ?? '')?.[1] ?? '';
}
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
const confirm = (user: string, phone: string, code: string) =>
  post('/verify-phone/confirm', { phone, code }, user);

describe('verify-phone with the real counters', () => {
  it('three wrong tries use up a code: the right one fails after', async () => {
    const code = await codeFor('u1', '+12125550101');
    for (let i = 0; i < 3; i++)
      expect((await confirm('u1', '+12125550101', wrong(code))).status).toBe(400);
    expect((await confirm('u1', '+12125550101', code)).status).toBe(400);
    expect(fake.phones.get('u1')).toBeUndefined();
  });

  it('a code works once: the same code again fails', async () => {
    const code = await codeFor('u2', '+12125550102');
    expect((await confirm('u2', '+12125550102', code)).status).toBe(200);
    expect(fake.phones.get('u2')).toBe('+12125550102');
    expect((await confirm('u2', '+12125550102', code)).status).toBe(400);
  });

  it('every failed confirm looks the same: nothing pending, wrong code, used up', async () => {
    const nothing = await confirm('u3', '+12125550103', '123456');
    const code = await codeFor('u3', '+12125550103');
    const wrongOne = await confirm('u3', '+12125550103', wrong(code));
    expect(nothing).toEqual(wrongOne);
    expect(nothing).toEqual({
      status: 400,
      body: { success: false, error: "That code didn't work. Ask for a new one?" },
    });
  });

  it('confirm tries count per (user, number) across new codes: the sixth fails, even right', async () => {
    let code = await codeFor('u4', '+12125550104');
    await confirm('u4', '+12125550104', wrong(code));
    await confirm('u4', '+12125550104', wrong(code));
    code = await codeFor('u4', '+12125550104');
    await confirm('u4', '+12125550104', wrong(code));
    await confirm('u4', '+12125550104', wrong(code));
    code = await codeFor('u4', '+12125550104');
    await confirm('u4', '+12125550104', wrong(code)); // the fifth try this hour
    expect((await confirm('u4', '+12125550104', code)).status).toBe(400);
    expect(fake.phones.get('u4')).toBeUndefined();
  });
});
