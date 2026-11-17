/**
 * The guest's invite routes over real HTTP, on the real use cases with
 * in-memory stores: her page's wording, her yes once, one refusal for every
 * token that can't be used, nothing about her or the owner in a reply, and a
 * time or wording version from the page ignored.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../services/stores/single-use-records.js';
import { GUEST_CONSENT_WORDING_VERSION } from '../../services/messaging/guest-consent/domain/guest-consent.js';
import { hasGuestConsent } from '../../services/messaging/guest-consent/use-cases/check-guest-consent.js';
import { phoneHash } from '../../services/outreach/checkin-replies.js';
import {
  answerGuestInvite,
  viewGuestInvite,
} from '../../services/messaging/guest-consent/use-cases/guest-invite.js';
import {
  GUEST,
  INVITE_TTL_MS,
  OWNER,
  memoryGuestInvites,
} from '../../services/messaging/guest-consent/__tests__/memory-guest-invite.js';
import { handleGuestInviteRoutes } from '../guest-invite-routes.js';

let m: ReturnType<typeof memoryGuestInvites>;
/** Each test calls from its own address (IPv6 documentation range), so the rate limit is per test. */
let caller = 0;
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const deps = {
        view: async (token: unknown) => viewGuestInvite(token, m.deps),
        answer: async (token: unknown, a: 'yes' | 'no' | 'forget') =>
          answerGuestInvite(token, a, m.deps),
      };
      if (await handleGuestInviteRoutes(req, res, url.pathname, deps)) return;
      res.writeHead(418);
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
beforeEach(() => {
  m = memoryGuestInvites();
  caller++;
});
const from = () => ({ 'x-forwarded-for': `2001:db8::${caller.toString(16)}` });

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${GUEST_INVITE_PATH}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...from() },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};
const GUEST_INVITE_PATH = '/api/guest-invite';
const NOT_VALID = { error: "This link isn't valid any more." };
const mint = (): string => m.mint();
const consents = () => hasGuestConsent(OWNER, GUEST, m.deps.consent);

describe('POST /api/guest-invite and /yes', () => {
  it('shows the wording with the first name, takes her yes once, then refuses', async () => {
    const token = mint();
    const view = await post('', { token });
    expect(view.status).toBe(200);
    expect(JSON.parse(view.text)).toEqual({
      ownerFirstName: 'Rowan',
      wording:
        'Rowan would like Ferni, their AI friend, to be able to bring you into their calls. ' +
        'Ferni takes notes for Rowan on those calls. ' +
        'You can say no on any call, or stop this any time.',
      wordingVersion: GUEST_CONSENT_WORDING_VERSION,
    });

    expect(await post('/yes', { token })).toEqual({ status: 200, text: '{"ok":true}' });
    expect(await consents()).toBe(true);
    const again = await post('/yes', { token });
    expect(again.status).toBe(404);
    expect(JSON.parse(again.text)).toEqual(NOT_VALID);
  });

  it('the view holds no phone number, uid or hash', async () => {
    const token = mint();
    const { text } = await post('', { token });
    const hash = phoneHash(GUEST, m.deps.consent.env) ?? 'setup: no hash';
    for (const secret of [OWNER, '5555550123', '555-0123', hash, sha256Hex(token), token]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual([
      'ownerFirstName',
      'wording',
      'wordingVersion',
    ]);
  });

  it('a time or wording version sent by the page is ignored: we stamp both', async () => {
    const token = mint();
    m.clock.now += 60 * 60 * 1000;
    const arrived = new Date(m.clock.now).toISOString();
    const body = { token, saidAt: '2026-11-10T00:00:00.000Z', wordingVersion: 999 };
    expect((await post('/yes', body)).status).toBe(200);
    expect([...m.consent.docs.values()]).toEqual([
      expect.objectContaining({
        consentedAt: arrived,
        wordingVersion: GUEST_CONSENT_WORDING_VERSION,
      }),
    ]);
  });
});

describe('every token that cannot be used gets the same answer', () => {
  it('unknown, used, expired and missing tokens: one 404 body, nothing recorded', async () => {
    const used = mint();
    await post('/no', { token: used });
    const expired = mint();
    m.clock.now += INVITE_TTL_MS;
    const unknown = sha256Hex('nobody').slice(0, 43);
    const replies = new Set<string>();
    for (const body of [
      { token: unknown },
      { token: used },
      { token: expired },
      {},
      { token: 7 },
    ]) {
      caller++; // under the rate limit: 4 calls from each address
      for (const path of ['', '/yes', '/no', '/forget']) {
        const reply = await post(path, body);
        replies.add(`${reply.status} ${reply.text}`);
      }
    }
    expect([...replies]).toEqual([`404 ${JSON.stringify(NOT_VALID)}`]);
    expect(m.consent.docs.size).toBe(0);
  });
});

describe('/no and /forget', () => {
  it('no records nothing', async () => {
    expect((await post('/no', { token: mint() })).status).toBe(200);
    expect(m.consent.docs.size).toBe(0);
  });

  it('forget deletes her consent and its record', async () => {
    expect((await post('/yes', { token: mint() })).status).toBe(200);
    expect(await consents()).toBe(true);
    expect((await post('/forget', { token: mint() })).status).toBe(200);
    expect(await consents()).toBe(false);
    expect(m.consent.docs.size).toBe(0);
  });
});

describe('the routes', () => {
  it('take the token only in a POST body: a GET is refused', async () => {
    const res = await fetch(`${base}${GUEST_INVITE_PATH}`, { headers: from() });
    expect(res.status).toBe(405);
  });

  it('leave every other path alone', async () => {
    for (const path of ['/api/guest-invite/maybe', '/api/guest-invites', '/api/other']) {
      expect((await fetch(`${base}${path}`, { method: 'POST' })).status).toBe(418);
    }
  });

  it('are rate limited per caller', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await post('', { token: 'x' })).status);
    expect(statuses).toContain(429);
  });
});
