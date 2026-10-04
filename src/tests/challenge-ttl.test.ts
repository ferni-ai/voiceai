/**
 * Every challenge write carries `ttlAt`, a real Date (a Firestore Timestamp),
 * so a Firestore TTL policy can delete it:
 * - pending: at its expiry;
 * - accepted (social, still being played): 30 days after its expiry;
 * - completed or declined: 30 days after it finished.
 * Firestore TTL ignores strings and numbers, so an ISO string here would never
 * expire.
 *
 * Drives the real routes against a fake Firestore (K_SERVICE set) and checks
 * every document written to musical_challenges and social_challenges.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { call, startInstance, type ApiInstance, type Json } from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';

const fake = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  versions: new Map<string, number>(),
  up: true,
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('./helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: header.slice(7), isAdmin: false };
  }),
}));

const DAY = 24 * 60 * 60 * 1000;

/** The last document written to `collection/id`. */
function lastWrite(collection: string, id: string): Json {
  const write = [...fake.writes].reverse().find((w) => w.path === `${collection}/${id}`);
  if (!write) throw new Error(`nothing written to ${collection}/${id}`);
  return write.data;
}

function ttlOf(doc: Json): Date {
  expect(doc.ttlAt).toBeInstanceOf(Date);
  return doc.ttlAt as Date;
}

const near = (actual: Date, expected: number) =>
  expect(Math.abs(actual.getTime() - expected)).toBeLessThan(5_000);

describe('challenge records carry a ttlAt Date on every write', () => {
  let api: ApiInstance;

  beforeEach(async () => {
    resetFakeFirestore(fake);
    vi.stubEnv('K_SERVICE', 'api');
    api = await startInstance();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('musical: sent (expiry), completed and declined (30 days on)', async () => {
    const send = async () =>
      call(api.musical, 'POST', '/api/musical/challenge', 'alice', {
        challengeeId: 'carol',
        gameType: 'guess',
        challengerScore: 5,
      });
    const a = ((await send()).body.challenge as { id: string; expiresAt: string }) ?? {};
    const sent = lastWrite('musical_challenges', a.id);
    expect(ttlOf(sent).getTime()).toBe(new Date(a.expiresAt).getTime());

    await call(api.musical, 'POST', `/api/musical/challenge/${a.id}/complete`, 'carol', {
      score: 9,
    });
    near(ttlOf(lastWrite('musical_challenges', a.id)), Date.now() + 30 * DAY);

    const b = (await send()).body.challenge as { id: string };
    await call(api.musical, 'POST', `/api/musical/challenge/${b.id}/decline`, 'carol');
    near(ttlOf(lastWrite('musical_challenges', b.id)), Date.now() + 30 * DAY);
  });

  it('social: created (expiry), accepted (expiry + 30 days), completed and declined', async () => {
    const create = async () =>
      call(api.social, 'POST', '/api/social/challenges/create', 'alice', {
        type: 'score-beat',
        gameType: 'guess',
        challengerName: 'Alice',
        challengeeId: 'carol',
        challengerScore: 5,
      });
    const a = (await create()).body.challenge as { id: string; expiresAt: string };
    const expiresAt = new Date(a.expiresAt).getTime();
    expect(ttlOf(lastWrite('social_challenges', a.id)).getTime()).toBe(expiresAt);

    await call(api.social, 'POST', '/api/social/challenges/accept', 'carol', {
      challengeId: a.id,
      challengeeName: 'Carol',
    });
    expect(ttlOf(lastWrite('social_challenges', a.id)).getTime()).toBe(expiresAt + 30 * DAY);

    await call(api.social, 'POST', '/api/social/challenges/complete', 'carol', {
      challengeId: a.id,
      challengeeScore: 9,
    });
    near(ttlOf(lastWrite('social_challenges', a.id)), Date.now() + 30 * DAY);

    const b = (await create()).body.challenge as { id: string };
    await call(api.social, 'POST', '/api/social/challenges/decline', 'carol', {
      challengeId: b.id,
    });
    near(ttlOf(lastWrite('social_challenges', b.id)), Date.now() + 30 * DAY);
  });

  it('never returns ttlAt to callers', async () => {
    const res = await call(api.musical, 'POST', '/api/musical/challenge', 'alice', {
      challengeeId: 'carol',
      gameType: 'guess',
      challengerScore: 5,
    });
    const id = (res.body.challenge as { id: string }).id;
    const read = await call(api.musical, 'GET', `/api/musical/challenge/${id}`, 'carol');
    expect(read.raw).not.toContain('ttlAt');
  });
});
