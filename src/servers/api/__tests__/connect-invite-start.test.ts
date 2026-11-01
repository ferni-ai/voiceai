/**
 * POST /auth/oauth/start-from-invite: a texted connect-moment invite starts the
 * normal Google Calendar connect for its owner, signed in, once, in the browser
 * that tapped it, and the grant lands on that uid. Not signed in is 401 before
 * any invite is looked up; every other refusal is one 404, and starts no flow.
 *
 * Real HTTP through bindVerifiedIdentity and the REAL route handlers
 * (oauth-start, Google login and callback). Mocked: Firebase token
 * verification, Google's token endpoint (fetch), the calendar token save and
 * the watch channel. Invites and OAuth states use memory stores; account
 * records a fake Firestore; log lines are captured.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectInvite } from '../../../services/connect-moments/connect-invites.js';
import type { SingleUseStore } from '../../../services/stores/single-use-records.js';
import type { OAuthLinkRecord } from '../../token/oauth-link-state.js';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
});

const lines = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', async (importActual) => {
  const logger: Record<string, unknown> = { child: () => logger };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args: unknown[]) => lines.push([level, ...args]);
  }
  const capture = { createLogger: () => logger, getLogger: () => logger, logger, default: logger };
  return { ...(await importActual<object>()), ...capture };
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));
const savedCalendar = vi.hoisted(() => vi.fn(async (_uid: string, _tokens: unknown) => undefined));
vi.mock('../../token/oauth/google-calendar.js', () => ({ saveTokens: savedCalendar }));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(async () => null),
  stopAllUserChannels: vi.fn(async () => undefined),
}));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleOAuthStartRoute, INVITE_NOT_FOUND } = await import('../routes/oauth-start.js');
const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');
const { setOAuthLinkStore } = await import('../../token/oauth-link-state.js');
const { memorySingleUseStore, sha256Hex } =
  await import('../../../services/stores/single-use-records.js');
const invites = await import('../../../services/connect-moments/connect-invites.js');
const { createFakeFirestore, newFakeFirestoreState } =
  await import('../../../tests/helpers/fake-firestore.js');
const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
const firestore = newFakeFirestoreState();

const realFetch = globalThis.fetch;
let base = '';
let server: Server;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new globalThis.Response(
        JSON.stringify({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/calendar.events',
        })
      );
    }
    return realFetch(input, init);
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleOAuthStartRoute(req, res, url.pathname)) return;
      if (await handleGoogleCalendarRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404, { 'x-fell-through': '1' });
      res.end();
    })();
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
let inviteStore: SingleUseStore<ConnectInvite>;
let stateStore: SingleUseStore<OAuthLinkRecord>;
beforeEach(() => {
  process.env.CONNECT_MOMENT_CALENDAR = 'on';
  stateStore = memorySingleUseStore<OAuthLinkRecord>(100);
  setOAuthLinkStore(stateStore);
  inviteStore = memorySingleUseStore<ConnectInvite>(100);
  invites.setConnectInviteStore(inviteStore);
  savedCalendar.mockClear();
  lines.length = 0;
  firestore.docs.clear();
  for (const uid of ['uid-ana', 'uid-ben']) firestore.docs.set(`bogle_users/${uid}`, {});
  vi.mocked(getFirestoreDb).mockImplementation(createFakeFirestore(firestore) as never);
});

const send = (path: string, init: Parameters<typeof fetch>[1] = {}) =>
  realFetch(`${base}${path}`, { redirect: 'manual', ...init });

const tap = (invite: unknown, auth?: string) =>
  send('/auth/oauth/start-from-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ invite }),
  });

const ANA = 'Bearer tok-ana';
const BEN = 'Bearer tok-ben';
const UNKNOWN = 'x'.repeat(43);

const inviteFor = async (uid: string) =>
  (await invites.createConnectInvite({ uid, integration: 'calendar' })) as string;

/** An invite for uid-ana that expired a minute ago. */
async function expiredInvite(): Promise<string> {
  const token = 'e'.repeat(43);
  await inviteStore.put(sha256Hex(token), {
    uid: 'uid-ana',
    integration: 'calendar',
    createdAt: Date.now() - 31 * 60_000,
    expiresAt: Date.now() - 60_000,
  });
  return token;
}

/** Status, body and whether an OAuth flow was started (a state stored or a cookie set). */
async function outcome(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as unknown,
    cookie: res.headers.get('set-cookie'),
  };
}

describe('start-from-invite', () => {
  it("(a) connects Google Calendar for the invite's owner, signed in", async () => {
    const res = await tap(await inviteFor('uid-ana'), ANA);
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/auth\/google\/login\?state=/);

    const login = await send(url, { headers: { cookie } });
    const google = new URL(login.headers.get('location') ?? '');
    expect(google.origin).toBe('https://accounts.google.com');
    const state = google.searchParams.get('state') ?? '';

    const callback = await send(`/auth/google/callback?code=c&state=${state}`, {
      headers: { cookie },
    });
    expect(callback.status).toBe(302);
    expect(savedCalendar).toHaveBeenCalledTimes(1);
    expect(savedCalendar.mock.calls[0]?.[0]).toBe('uid-ana');
  });

  it('(a) not signed in: the same 401 for an unknown, an expired and a valid invite, before any lookup', async () => {
    const valid = await inviteFor('uid-ana');
    const expired = await expiredInvite();
    const get = vi.spyOn(inviteStore, 'get');
    const take = vi.spyOn(inviteStore, 'take');
    const answers = [];
    for (const token of [UNKNOWN, expired, valid]) answers.push(await outcome(await tap(token)));
    expect(answers[0]).toEqual({ status: 401, body: { error: 'Sign in required' }, cookie: null });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    expect(get).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    expect((await tap(valid, ANA)).status).toBe(200); // still unspent for its owner
  });

  it('(a) signed in as someone else: the same 404 as an unknown invite, and the invite is not spent', async () => {
    const invite = await inviteFor('uid-ana');
    const unknown = await outcome(await tap(UNKNOWN, BEN));
    const otherAccount = await outcome(await tap(invite, BEN));
    expect(unknown).toEqual({ status: 404, body: INVITE_NOT_FOUND, cookie: null });
    expect(otherAccount).toEqual(unknown);
    expect((await tap(invite, ANA)).status).toBe(200);
  });

  it('(b) used or expired: the same 404, and no OAuth flow starts', async () => {
    const invite = await inviteFor('uid-ana');
    expect((await tap(invite, ANA)).status).toBe(200);
    const put = vi.spyOn(stateStore, 'put');
    const used = await outcome(await tap(invite, ANA));
    const expired = await outcome(await tap(await expiredInvite(), ANA));
    expect(used).toEqual({ status: 404, body: INVITE_NOT_FOUND, cookie: null });
    expect(expired).toEqual(used);
    expect(put).not.toHaveBeenCalled();
  });

  it('(b) four taps at once by the owner start exactly one flow', async () => {
    const invite = await inviteFor('uid-ana');
    const statuses = await Promise.all(
      [1, 2, 3, 4].map(async () => (await tap(invite, ANA)).status)
    );
    expect(statuses.sort()).toEqual([200, 404, 404, 404]);
  });

  it("(c) when the flow can't start, the owner keeps the invite and can tap again", async () => {
    const token = await inviteFor('uid-ana');
    vi.spyOn(stateStore, 'put').mockResolvedValueOnce(false);
    expect((await tap(token, ANA)).status).toBe(503);
    const retry = await outcome(await tap(token, ANA));
    expect(retry.status).toBe(200);
    expect(await outcome(await tap(token, ANA))).toMatchObject({
      status: 404,
      body: INVITE_NOT_FOUND,
    });
  });

  it("(c) the invite it puts back keeps exactly the expiry it had", async () => {
    const token = await inviteFor('uid-ana');
    const before = await inviteStore.get(sha256Hex(token));
    const spent = await inviteStore.take(sha256Hex(token));
    await inviteStore.put(sha256Hex(token), spent!);
    vi.spyOn(stateStore, 'put').mockResolvedValueOnce(false);
    expect((await tap(token, ANA)).status).toBe(503);
    const after = await inviteStore.get(sha256Hex(token));
    expect(after?.expiresAt).toBe(before?.expiresAt);
    expect(after?.createdAt).toBe(before?.createdAt);
  });

  it("(c) puts nothing back once the account is being erased", async () => {
    const token = await inviteFor('uid-ana');
    vi.spyOn(stateStore, 'put').mockImplementationOnce(async () => {
      firestore.docs.set('bogle_users/uid-ana', { erasing: true });
      return false;
    });
    expect((await tap(token, ANA)).status).toBe(503);
    expect(await inviteStore.get(sha256Hex(token))).toBeNull();
  });

  it('no log line carries the invite, on a tap that starts the flow or one that cannot', async () => {
    const started = await inviteFor('uid-ana');
    expect((await tap(started, ANA)).status).toBe(200);
    const returned = await inviteFor('uid-ana');
    vi.spyOn(stateStore, 'put').mockResolvedValueOnce(false);
    expect((await tap(returned, ANA)).status).toBe(503);
    const logged = JSON.stringify(lines);
    // The capture works: both taps logged their step.
    expect(logged).toContain('"step":"tapped"');
    expect(logged).toContain('"reason":"no_state"');
    for (const token of [started, returned]) {
      expect(logged).not.toContain(token);
      expect(logged).not.toContain(token.slice(0, 16));
    }
  });

  it('refuses a GET', async () => {
    expect(
      (await send('/auth/oauth/start-from-invite', { headers: { authorization: ANA } })).status
    ).toBe(405);
  });

  it('with the flag off the route does not exist: the request falls through as before', async () => {
    const invite = await inviteFor('uid-ana');
    process.env.CONNECT_MOMENT_CALENDAR = 'off';
    const res = await tap(invite, ANA);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-fell-through')).toBe('1');
  });
});
