/**
 * Partner feedback sybil guard (PARTNER_VOTE_GUARD, #2356) over real HTTP.
 *
 * Since iOS signs every install in with an anonymous Firebase account, each
 * reinstall (or scripted anonymous token) was a new "unique" voter on a
 * partner's global quality score, and eight not_helpful votes deactivated it.
 * The server here dispatches /api/monetization/* the way src/servers/api/index.ts
 * does (serveMonetizationRoute), through the real auth middleware, router,
 * feedback handler and partnership service. Only Firebase token verification
 * and persistence are faked: "anon-<n>" verifies as an anonymous sign-in,
 * "tok-<n>" as a full account.
 */
/* eslint-disable no-await-in-loop -- votes are cast in order */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const warnings = vi.hoisted(() => ({ calls: [] as Array<{ ctx: unknown; msg: unknown }> }));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const [kind, name] = token.split('-');
    if ((kind !== 'tok' && kind !== 'anon') || !name) return null;
    return { uid: `uid-${token}`, claims: {}, isAnonymous: kind === 'anon' };
  }),
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/monetization/persistence.js', () => ({
  initMonetizationPersistence: () => {},
  celebrateJourneyMilestone: vi.fn(),
  createUserJourney: vi.fn(),
  getUserJourney: vi.fn(),
  recordJourneyConversation: vi.fn(),
  recordJourneyGoal: vi.fn(),
}));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) => ({
      ...actual.createLogger(bindings),
      debug: () => undefined,
      info: () => undefined,
      warn: (ctx: unknown, msg?: unknown) => {
        warnings.calls.push({ ctx, msg });
      },
    }),
  };
});

type Serve = typeof import('../monetization-http.js').serveMonetizationRoute;
type Partnerships =
  typeof import('../../services/monetization/contextual-partnerships.js').contextualPartnerships;

let serve: Serve;
let partnerships: Partnerships;
let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://local');
    await serve(req, res, url.pathname, url.searchParams);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

// Fresh partner scores and voter books for every test
beforeEach(async () => {
  vi.resetModules();
  warnings.calls = [];
  ({ serveMonetizationRoute: serve } = await import('../monetization-http.js'));
  ({ contextualPartnerships: partnerships } =
    await import('../../services/monetization/contextual-partnerships.js'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function post(path: string, token: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

const vote = (token: string, partnerId: string, feedback: string, extra: object = {}) =>
  post('/api/monetization/partners/feedback', token, { partnerId, feedback, ...extra });
const click = (token: string, partnerId: string) =>
  post('/api/monetization/partners/click', token, { partnerId });

const PARTNER = 'partner_0';
const score = (id = PARTNER) =>
  partnerships.getActivePartners().find((p) => p.id === id)?.qualityScore;
const activeIds = () => partnerships.getActivePartners().map((p) => p.id);
const THANKS = { status: 200, body: { success: true, message: 'Thank you for your feedback!' } };

describe('PARTNER_VOTE_GUARD on', () => {
  beforeEach(() => {
    vi.stubEnv('PARTNER_VOTE_GUARD', 'on');
  });

  it("an anonymous sign-in's vote is thanked like a counted one and moves nothing", async () => {
    const before = score();
    expect(before).toBe(85);
    expect((await click('anon-1', PARTNER)).status).toBe(200); // even after using the partner
    expect(await vote('anon-1', PARTNER, 'not_helpful')).toEqual(THANKS);
    expect(score()).toBe(before);

    // A full account that used the partner gets the very same answer, and its vote counts
    await click('tok-1', PARTNER);
    expect(await vote('tok-1', PARTNER, 'not_helpful')).toEqual(THANKS);
    expect(score()).toBe(80);
  });

  it('a body claiming the caller is not anonymous changes nothing', async () => {
    await click('anon-2', PARTNER);
    await vote('anon-2', PARTNER, 'not_helpful', {
      isAnonymous: false,
      signInProvider: 'google.com',
    });
    expect(score()).toBe(85);
  });

  it('many anonymous identities cannot push a partner down at all', async () => {
    for (let i = 0; i < 12; i++) {
      await click(`anon-x${i}`, PARTNER);
      expect(await vote(`anon-x${i}`, PARTNER, 'not_helpful')).toEqual(THANKS);
    }
    expect(score()).toBe(85);
    expect(activeIds()).toContain(PARTNER);
  });

  it('a full account with no referral from the partner moves nothing until it has one', async () => {
    expect(await vote('tok-2', PARTNER, 'helpful')).toEqual(THANKS);
    expect(score()).toBe(85);

    // Not booked as a vote, so after using the partner it still counts, once
    await click('tok-2', PARTNER);
    await vote('tok-2', PARTNER, 'helpful');
    expect(score()).toBe(87);
    await vote('tok-2', PARTNER, 'helpful');
    expect(score()).toBe(87);
  });

  it('a referral from another partner is not an interaction with this one', async () => {
    await click('tok-3', 'partner_1');
    await vote('tok-3', PARTNER, 'not_helpful');
    expect(score()).toBe(85);
  });

  it('feedback never deactivates a partner: it is held for admin review', async () => {
    for (let i = 0; i < 9; i++) {
      await click(`tok-d${i}`, PARTNER);
      expect(await vote(`tok-d${i}`, PARTNER, 'not_helpful')).toEqual(THANKS);
    }
    expect(score()).toBe(40); // 85 - 9 * 5: every vote counted
    expect(activeIds()).toContain(PARTNER);
    const held = warnings.calls.filter(
      (w) => (w.ctx as { marker?: string }).marker === 'partner_deactivation_review'
    );
    expect(held.length).toBeGreaterThan(0);
    expect(held[0]?.ctx).toMatchObject({ partnerId: PARTNER });
    expect(warnings.calls.map((w) => w.msg)).not.toContain(
      'Partner deactivated due to low quality'
    );
  });
});

describe('PARTNER_VOTE_GUARD off (as on main)', () => {
  beforeEach(() => {
    vi.stubEnv('PARTNER_VOTE_GUARD', 'off');
  });

  it("an anonymous sign-in's vote counts, with no referral", async () => {
    expect(await vote('anon-3', PARTNER, 'not_helpful')).toEqual(THANKS);
    expect(score()).toBe(80);
  });

  it('a full account with no referral counts', async () => {
    await vote('tok-4', PARTNER, 'helpful');
    expect(score()).toBe(87);
  });

  it('eight not_helpful votes from anonymous identities deactivate the partner', async () => {
    for (let i = 0; i < 8; i++) await vote(`anon-y${i}`, PARTNER, 'not_helpful');
    expect(activeIds()).not.toContain(PARTNER);
    expect(warnings.calls.map((w) => w.msg)).toContain('Partner deactivated due to low quality');
  });
});
