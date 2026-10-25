/**
 * Confirming an SMS code puts the number on the signed-in user's Firebase
 * account, and only theirs: real HTTP requests through the real outreach
 * routes, auth middleware and attachVerifiedPhone. Faked: Firebase token
 * checks, the code store (in memory), the SMS send, and Firebase Auth's user
 * records (a map of uid -> phone).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tokens: Record<string, { uid: string; admin?: boolean }> = {
  'tok-A': { uid: 'uid-A' },
  'tok-admin': { uid: 'admin-1', admin: true },
};

const fake = vi.hoisted(() => {
  const phones = new Map<string, string>(); // uid -> E.164 on the Firebase account
  const codes = new Map<string, { phone: string; code: string; verified: boolean }>();
  const authApi = {
    getUserByPhoneNumber: vi.fn(async (phoneNumber: string) => {
      for (const [uid, p] of phones) if (p === phoneNumber) return { uid };
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    }),
    updateUser: vi.fn(async (uid: string, update: { phoneNumber: string }) => {
      phones.set(uid, update.phoneNumber);
    }),
  };
  return { phones, codes, authApi };
});

// The default app counts as initialized; attachVerifiedPhone uses the modular getAuth().
vi.mock('firebase-admin', () => ({ default: { apps: [{}] } }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => fake.authApi }));
vi.mock('../../services/identity/firebase-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/identity/firebase-auth.js')>()),
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const t = tokens[token];
    return t ? { uid: t.uid, claims: { admin: t.admin === true }, isAnonymous: false } : null;
  }),
}));
vi.mock('../../services/trust-and-identity/verification-store.js', () => ({
  createVerificationCode: vi.fn(async (userId: string, phone: string) => {
    fake.codes.set(userId, { phone, code: '123456', verified: false });
    return { code: '123456', expiresAt: new Date() };
  }),
  getVerificationStatus: vi.fn(async (userId: string) => {
    const stored = fake.codes.get(userId);
    return stored ? { hasPendingCode: true, phone: stored.phone } : null;
  }),
  verifyCode: vi.fn(async (userId: string, code: string) => {
    const stored = fake.codes.get(userId);
    if (!stored) return { valid: false, reason: 'not_found' };
    if (stored.code !== code) return { valid: false, reason: 'invalid' };
    stored.verified = true;
    return { valid: true, reason: 'success', phone: stored.phone };
  }),
}));
const textUser = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../tools/domains/proactive/outreach/index.js', () => ({ textUser }));
// The real textVerificationCode (number, STOP, limits) with Firestore and Twilio faked.
const sms = vi.hoisted(() => ({
  send: vi.fn(async (_m: { to: string; body: string }) => ({ success: true, messageSid: 'SM1' })),
  optedOut: false,
  ips: [] as (string | undefined)[],
  sends: new Map<string, string[]>(),
}));
vi.mock('../../services/outreach/verification-text.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../services/outreach/verification-text.js')>();
  const sends = sms.sends;
  const deps = {
    env: { LOG_HASH_SECRET: 'test-secret' },
    atomically: async <T>(
      keys: string[],
      _optOutHash: string,
      decide: (
        r: Record<string, string[]>,
        optedOut: boolean
      ) => { result: T; write?: Record<string, string[]> }
    ) => {
      const { result, write } = decide(
        Object.fromEntries(keys.map((k) => [k, sends.get(k) ?? []])),
        sms.optedOut
      );
      for (const [k, v] of Object.entries(write ?? {})) sends.set(k, v);
      return result;
    },
    send: (m: { to: string; body: string }) => sms.send(m),
    now: () => new Date(),
  };
  return {
    ...real,
    reserveConfirmTry: (user: string, phone: string) => real.reserveConfirmTry(user, phone, deps),
    textVerificationCode: (
      u: string,
      p: string,
      make: (e: string) => Promise<string>,
      _deps: unknown,
      ip?: string
    ) => {
      for (const k of [...sends.keys()]) if (!k.startsWith('confirm:')) sends.delete(k);
      sms.ips.push(ip);
      return real.textVerificationCode(u, p, make, deps, ip);
    },
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
beforeEach(() => {
  fake.phones.clear();
  fake.codes.clear();
  sms.sends.clear();
  vi.clearAllMocks();
});

const post = (path: string, body: unknown, token: string) =>
  fetch(`${base}/api/outreach${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const MINE = '+12125550100';

describe('asking for a phone code', () => {
  it('texts the code to the number given (never a user lookup), and says sent only when it went', async () => {
    const res = await post('/verify-phone', { phone: '(212) 555-0100' }, 'tok-A');
    expect(res.status).toBe(200);
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: MINE,
        body: 'Your Ferni code is 123456. It expires in 10 minutes.',
      })
    );
    expect(textUser).not.toHaveBeenCalled();
  });

  it("limits the caller's IP: the route passes the client address", async () => {
    sms.ips.length = 0;
    await fetch(`${base}/api/outreach/verify-phone`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer tok-A',
        'x-forwarded-for': '203.0.113.9',
      },
      body: JSON.stringify({ phone: MINE }),
    });
    expect(sms.ips).toEqual(['203.0.113.9']);
  });

  it('a quiet refusal stores no code, so confirming that number fails', async () => {
    sms.optedOut = true;
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    sms.optedOut = false;
    expect(fake.codes.has('uid-A')).toBe(false);
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '123456' }, 'tok-A');
    expect(res.status).toBe(400);
    expect(fake.phones.get('uid-A')).toBeUndefined();
  });

  it('confirm tries are limited per (user, number): the sixth try in the hour is refused, even a right one', async () => {
    await post('/verify-phone', { phone: '+12125550177' }, 'tok-A');
    for (let i = 0; i < 5; i++) {
      await post('/verify-phone/confirm', { phone: '+12125550177', code: '000000' }, 'tok-A');
    }
    const res = await post(
      '/verify-phone/confirm',
      { phone: '+12125550177', code: '123456' },
      'tok-A'
    );
    expect(res.status).toBe(400); // the same answer as any failed confirm
    expect(fake.phones.get('uid-A')).toBeUndefined();
  });

  it('a number that sent STOP gets the same answer as a send, and nothing is sent', async () => {
    const sent = await (await post('/verify-phone', { phone: MINE }, 'tok-A')).json();
    sms.send.mockClear();
    sms.optedOut = true;
    const res = await post('/verify-phone', { phone: MINE }, 'tok-A');
    sms.optedOut = false;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sent); // nothing tells the caller the number opted out
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('a send the provider refused answers with a friendly error, not "sent"', async () => {
    sms.send.mockResolvedValueOnce({ success: false, error: 'carrier said no' } as never);
    const res = await post('/verify-phone', { phone: MINE }, 'tok-A');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      success: false,
      error: "Couldn't send the code. Try again?",
    });
  });
});

describe('confirming a phone code', () => {
  it("puts the number on the signed-in user's Firebase account", async () => {
    expect((await post('/verify-phone', { phone: '(212) 555-0100' }, 'tok-A')).status).toBe(200);
    expect(fake.phones.get('uid-A')).toBeUndefined();
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '123456' }, 'tok-A');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { phoneLinked: boolean }).phoneLinked).toBe(true);
    expect(fake.authApi.updateUser).toHaveBeenCalledWith('uid-A', { phoneNumber: MINE });
    expect(fake.phones.get('uid-A')).toBe(MINE);
  });

  it('refuses a wrong code and attaches nothing', async () => {
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '000000' }, 'tok-A');
    expect(res.status).toBe(400);
    expect(fake.authApi.updateUser).not.toHaveBeenCalled();
  });

  it("refuses someone else's uid, and an admin's confirm for another user attaches nothing", async () => {
    const res = await post(
      '/verify-phone/confirm',
      { phone: MINE, code: '123456', userId: 'uid-B' },
      'tok-A'
    );
    expect(res.status).toBe(403);

    await post('/verify-phone', { phone: MINE, userId: 'uid-B' }, 'tok-admin');
    const admin = await post(
      '/verify-phone/confirm',
      { phone: MINE, code: '123456', userId: 'uid-B' },
      'tok-admin'
    );
    expect(admin.status).toBe(200);
    expect(((await admin.json()) as { phoneLinked: boolean }).phoneLinked).toBe(false);
    expect(fake.authApi.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a number another account already holds, and never overwrites it', async () => {
    fake.phones.set('uid-C', MINE);
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '123456' }, 'tok-A');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/another Ferni account/);
    expect(fake.authApi.updateUser).not.toHaveBeenCalled();
    expect(fake.phones.get('uid-C')).toBe(MINE);
  });

  it('refuses when another account takes the number between the check and the write', async () => {
    fake.authApi.updateUser.mockRejectedValueOnce(
      Object.assign(new Error('taken'), { code: 'auth/phone-number-already-exists' })
    );
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '123456' }, 'tok-A');
    expect(res.status).toBe(409);
  });

  it('attaches the number the code was sent to, not one named in the confirm', async () => {
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    const res = await post(
      '/verify-phone/confirm',
      { phone: '+12125550999', code: '123456' },
      'tok-A'
    );
    expect(res.status).toBe(200);
    expect(fake.phones.get('uid-A')).toBe(MINE);
  });

  it("keys the code to the signed-in user, so another user can't confirm it", async () => {
    tokens['tok-B'] = { uid: 'uid-B' };
    await post('/verify-phone', { phone: MINE }, 'tok-A');
    const res = await post('/verify-phone/confirm', { phone: MINE, code: '123456' }, 'tok-B');
    expect(res.status).toBe(400);
    expect(fake.authApi.updateUser).not.toHaveBeenCalled();
  });
});
