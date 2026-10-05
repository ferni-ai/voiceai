/**
 * A Taste Match game works across API instances.
 *
 * Sessions lived in each process's memory, so a game created on one Cloud Run
 * instance was a 404 when join, ready or answer landed on another. Here two
 * instances (separate loads of the real routes and services) share one fake
 * Firestore (K_SERVICE set); only the token verifier is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { call, startInstance, type ApiInstance, type Json } from './helpers/api-instances.js';
import { resetFakeFirestore } from './helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('./helpers/fake-firestore.js')).newFakeFirestoreState()
);

vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('./helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../api/auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
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

interface Session {
  id: string;
  status: string;
  currentRound: number;
  compatibilityScore?: number;
  participants: Array<{ userId: string; answers: unknown[] }>;
}
const sessionOf = (body: Json) => body.session as Session;

describe('Taste Match across API instances', () => {
  let one: ApiInstance;
  let two: ApiInstance;

  beforeEach(async () => {
    resetFakeFirestore(fake);
    vi.stubEnv('K_SERVICE', 'api');
    one = await startInstance();
    two = await startInstance();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a game created on instance 1 is joined, played and finished on instance 2', async () => {
    const created = await call(one.social, 'POST', '/api/social/tastematch/create', 'ann', {
      hostDisplayName: 'Ann',
      rounds: 2,
    });
    expect(created.status).toBe(200);
    const sessionId = sessionOf(created.body).id;

    const join = await call(two.social, 'POST', '/api/social/tastematch/join', 'ben', {
      sessionId,
      displayName: 'Ben',
    });
    expect(join.status).toBe(200);

    for (const who of ['ann', 'ben']) {
      const ready = await call(two.social, 'POST', '/api/social/tastematch/ready', who, {
        sessionId,
      });
      expect(ready.status).toBe(200);
    }

    for (let round = 1; round <= 2; round++) {
      // Both players answer at once, on different instances: neither answer is lost.
      const [a, b] = await Promise.all([
        call(one.social, 'POST', '/api/social/tastematch/answer', 'ann', {
          sessionId,
          answer: '3', // valid for every question type (rate-song parses it)
          timeMs: 900,
        }),
        call(two.social, 'POST', '/api/social/tastematch/answer', 'ben', {
          sessionId,
          answer: '3',
          timeMs: 800,
        }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
    }

    const final = await call(one.social, 'GET', `/api/social/tastematch/${sessionId}`, 'ann');
    expect(final.status).toBe(200);
    const session = sessionOf(final.body);
    expect(session.status).toBe('completed');
    expect(session.participants.map((p) => p.answers.length)).toEqual([2, 2]);
    expect(session.compatibilityScore).toEqual(expect.any(Number));
  });

  it('a stranger on another instance still cannot play in it', async () => {
    const created = await call(one.social, 'POST', '/api/social/tastematch/create', 'ann', {
      hostDisplayName: 'Ann',
    });
    const sessionId = sessionOf(created.body).id;

    const ready = await call(two.social, 'POST', '/api/social/tastematch/ready', 'mallory', {
      sessionId,
    });
    expect(ready.status).toBe(404);
  });

  it('every session write carries ttlAt as a Date (a day while unfinished)', async () => {
    const created = await call(one.social, 'POST', '/api/social/tastematch/create', 'ann', {
      hostDisplayName: 'Ann',
    });
    const sessionId = sessionOf(created.body).id;
    const writes = fake.writes.filter((w) => w.path === `social_taste_match_sessions/${sessionId}`);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.data.ttlAt).toBeInstanceOf(Date);
      const ms = (w.data.ttlAt as Date).getTime() - Date.now();
      expect(ms).toBeGreaterThan(23 * 3600_000);
      expect(ms).toBeLessThan(25 * 3600_000);
    }
  });
});
