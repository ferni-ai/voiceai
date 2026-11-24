/**
 * Partner feedback sybil guard (PARTNER_VOTE_GUARD, #2356) over real HTTP.
 *
 * Since iOS signs every install in with an anonymous Firebase account, each
 * reinstall (or scripted anonymous token) was a new "unique" voter on a
 * partner's global quality score, and eight not_helpful votes deactivated it.
 * The server here dispatches /api/monetization/* the way src/servers/api/index.ts
 * does (serveMonetizationRoute), through the real auth middleware, router,
 * feedback handler and partnership service. Only Firebase token verification
 * and persistence are faked, shaped like firebase-auth.ts's VerifiedToken
 * (isAnonymous = anonymous provider OR no email, so a phone sign-in has it set):
 * "anon-<n>" anonymous, "tok-<n>" Google, "phone-<n>" phone (no email),
 * "pw-<n>" email/password unverified, "pwv-<n>" email/password verified.
 */
/* eslint-disable no-await-in-loop -- votes are cast in order */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOMMENDATION_FLOOR } from '../../services/monetization/contextual-partnerships.js';

const warnings = vi.hoisted(() => ({ calls: [] as Array<{ ctx: unknown; msg: unknown }> }));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const [kind, name] = token.split('-');
    const kinds: Record<string, [provider: string, email?: string, verified?: boolean]> = {
      anon: ['anonymous'],
      tok: ['google.com', 'river@example.com', true],
      phone: ['phone'],
      pw: ['password', 'kestrel@example.com', false],
      pwv: ['password', 'heron@example.com', true],
    };
    const shape = kind ? kinds[kind] : undefined;
    if (!shape || !name) return null;
    const [signInProvider, email, emailVerified = false] = shape;
    const isAnonymous = signInProvider === 'anonymous' || !email;
    return { uid: `uid-${token}`, claims: {}, email, emailVerified, signInProvider, isAnonymous };
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
/** Which partner /partners/recommend picks for a sleep message (partner_0 is Calm) */
async function recommendedForSleep(): Promise<string | undefined> {
  const res = await post('/api/monetization/partners/recommend', 'tok-reader', {
    message: "I can't sleep lately",
  });
  expect(res.status).toBe(200);
  return (res.body as { partner?: { id: string } }).partner?.id;
}
const reviewLogs = () =>
  warnings.calls.filter(
    (w) => (w.ctx as { marker?: string }).marker === 'partner_deactivation_review'
  );
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

  it('votes never take a partner out of recommendations: held at the floor, logged once', async () => {
    expect(await recommendedForSleep()).toBe(PARTNER);
    for (let i = 0; i < 9; i++) {
      await click(`tok-d${i}`, PARTNER);
      expect(await vote(`tok-d${i}`, PARTNER, 'not_helpful')).toEqual(THANKS);
    }
    expect(score()).toBe(RECOMMENDATION_FLOOR); // 70, not 85 - 9 * 5
    expect(await recommendedForSleep()).toBe(PARTNER);
    expect(activeIds()).toContain(PARTNER);
    const held = reviewLogs();
    expect(held).toHaveLength(1);
    expect(held[0]?.ctx).toMatchObject({ partnerId: PARTNER, qualityScore: 70 });
    expect(warnings.calls.map((w) => w.msg)).not.toContain(
      'Partner deactivated due to low quality'
    );
  });

  it('six counted not_helpful votes leave the partner recommendable over HTTP', async () => {
    for (let i = 0; i < 6; i++) {
      await click(`phone-s${i}`, PARTNER);
      await vote(`phone-s${i}`, PARTNER, 'not_helpful');
    }
    expect(score()).toBe(70);
    expect(await recommendedForSleep()).toBe(PARTNER);

    // Helpful votes still lift it, and a later fall back to the floor is logged again
    for (let i = 0; i < 2; i++) {
      await click(`pwv-u${i}`, PARTNER);
      await vote(`pwv-u${i}`, PARTNER, 'helpful');
    }
    expect(score()).toBe(74);
    await click('tok-s9', PARTNER);
    await vote('tok-s9', PARTNER, 'not_helpful');
    expect(score()).toBe(70);
    expect(reviewLogs()).toHaveLength(2);
  });

  it('a phone sign-in counts, though the shared isAnonymous helper calls it anonymous', async () => {
    await click('phone-1', PARTNER);
    await vote('phone-1', PARTNER, 'not_helpful');
    expect(score()).toBe(80);
  });

  it('an email/password sign-in counts only once the email is verified', async () => {
    await click('pw-1', PARTNER);
    expect(await vote('pw-1', PARTNER, 'not_helpful')).toEqual(THANKS);
    expect(score()).toBe(85);

    await click('pwv-1', PARTNER);
    await vote('pwv-1', PARTNER, 'not_helpful');
    expect(score()).toBe(80);
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

  it('four not_helpful votes take the partner out of recommendations', async () => {
    expect(await recommendedForSleep()).toBe(PARTNER);
    for (let i = 0; i < 4; i++) await vote(`anon-r${i}`, PARTNER, 'not_helpful');
    expect(score()).toBe(65);
    expect(await recommendedForSleep()).not.toBe(PARTNER);
    expect(reviewLogs()).toHaveLength(0);
  });

  it('eight not_helpful votes from anonymous identities deactivate the partner', async () => {
    for (let i = 0; i < 8; i++) await vote(`anon-y${i}`, PARTNER, 'not_helpful');
    expect(activeIds()).not.toContain(PARTNER);
    expect(warnings.calls.map((w) => w.msg)).toContain('Partner deactivated due to low quality');
  });
});
