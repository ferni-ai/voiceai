/**
 * Challenges are shared by every API instance, and so are the checks on them.
 *
 * Cloud Run runs up to 10 API instances. Music and social challenges lived in
 * a Map inside each process, so a challenge created on one instance was a 404
 * on the others. The "only the challengee may answer" check and the taste-match
 * relationship check then depended on which instance took the request.
 *
 * Here two instances are two separate loads of the real route and service
 * modules (vi.resetModules), with Cloud Run's K_SERVICE set and one fake
 * Firestore shared between them. Only the auth verifier, the engagement store
 * (game history) and Firestore are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  call,
  startInstance,
  type ApiInstance as Instance,
  type Handler,
  type Json,
} from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';

/** One Firestore, shared by both instances. */
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

vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => ({
    getProfile: vi.fn(async (userId: string) => ({
      gameMemory: { genreAffinities: { [`${userId}-genre`]: { affinityScore: 80 } } },
    })),
  })),
}));

const idOf = (body: Json) => (body.challenge as { id: string }).id;

describe('challenges across API instances', () => {
  let one: Instance;
  let two: Instance;

  beforeEach(async () => {
    resetFakeFirestore(fake);
    vi.stubEnv('K_SERVICE', 'api');
    one = await startInstance();
    two = await startInstance();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('social: created on instance 1, answered by its challengee on instance 2, by no one else', async () => {
    const created = await call(one.social, 'POST', '/api/social/challenges/create', 'alice', {
      type: 'score-beat',
      gameType: 'guess',
      challengerName: 'Alice',
      challengeeId: 'carol',
      challengerScore: 5,
    });
    expect(created.status).toBe(200);
    const challengeId = idOf(created.body);

    const accept = (who: string) =>
      call(two.social, 'POST', '/api/social/challenges/accept', who, {
        challengeId,
        challengeeName: who,
      });
    expect((await accept('mallory')).status).toBe(403);
    expect((await accept('carol')).status).toBe(200);

    const complete = (h: Handler, who: string) =>
      call(h, 'POST', '/api/social/challenges/complete', who, {
        challengeId,
        challengeeScore: 9,
      });
    expect((await complete(one.social, 'mallory')).status).toBe(403);
    const done = await complete(one.social, 'carol');
    expect(done.status).toBe(200);
    expect((done.body.challenge as { winnerId: string }).winnerId).toBe('carol');

    const history = await call(two.social, 'GET', '/api/social/challenges/history', 'alice');
    expect((history.body.challenges as Array<{ id: string; status: string }>)[0]).toMatchObject({
      id: challengeId,
      status: 'completed',
    });
  });

  it('musical: sent on instance 1, completed by its challengee on instance 2, by no one else', async () => {
    const sent = await call(one.musical, 'POST', '/api/musical/challenge', 'alice', {
      challengeeId: 'carol',
      gameType: 'guess',
      challengerScore: 5,
    });
    expect(sent.status).toBe(200);
    const path = `/api/musical/challenge/${idOf(sent.body)}/complete`;

    expect((await call(two.musical, 'POST', path, 'mallory', { score: 9 })).status).toBe(403);
    const done = await call(two.musical, 'POST', path, 'carol', { score: 9 });
    expect(done.status).toBe(200);
    expect((done.body.challenge as { status: string }).status).toBe('completed');

    // The relationship is visible to instance 1 too, so alice may compare tastes.
    const match = await call(one.musical, 'POST', '/api/musical/taste-match', 'alice', {
      user2Id: 'carol',
    });
    expect(match.status).toBe(200);
  });

  it('fails closed on Cloud Run when Firestore is unavailable', async () => {
    fake.up = false;
    const sent = await call(one.musical, 'POST', '/api/musical/challenge', 'alice', {
      challengeeId: 'carol',
      gameType: 'guess',
      challengerScore: 5,
    });
    expect(sent.status).toBe(500);
  });
});
