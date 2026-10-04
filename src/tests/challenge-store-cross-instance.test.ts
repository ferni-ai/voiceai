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
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

type Json = Record<string, unknown>;

/** One Firestore, shared by both instances. */
const fake = vi.hoisted(() => ({ docs: new Map<string, Json>(), up: true }));

vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const ref = (path: string) => ({
    get: async () => ({ exists: fake.docs.has(path), data: () => fake.docs.get(path) }),
    set: async (data: Json) => {
      fake.docs.set(path, JSON.parse(JSON.stringify(data)) as Json);
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      where: (field: string, _op: '==', value: unknown) => ({
        get: async () => ({
          docs: [...fake.docs]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([, data]) => ({ data: () => data })),
        }),
      }),
    }),
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: ReturnType<typeof ref>) => ReturnType<ReturnType<typeof ref>['get']>;
        set: (r: ReturnType<typeof ref>, data: Json) => void;
      }) => Promise<T>
    ) => fn({ get: async (r) => r.get(), set: (r, data) => void r.set(data) }),
  };
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: () => (fake.up ? db : null),
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

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: URLSearchParams
) => Promise<boolean>;

interface Instance {
  musical: Handler;
  social: Handler;
}

/** A fresh API process: new module instances, nothing shared but Firestore. */
async function startInstance(): Promise<Instance> {
  vi.resetModules();
  const { handleMusicalYouRoutes } = await import('../api/routes/musical-you-routes.js');
  const { handleSocialRoutes } = await import('../api/routes/social-routes.js');
  return { musical: handleMusicalYouRoutes, social: handleSocialRoutes };
}

async function call(
  handler: Handler,
  method: 'GET' | 'POST',
  path: string,
  caller: string,
  body: Json = {}
): Promise<{ status: number; body: Json }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = { authorization: `Bearer ${caller}` };
  stream.end(method === 'POST' ? JSON.stringify(body) : undefined);
  const out = { status: 200, body: {} as Json };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.body = JSON.parse(data || '{}') as Json;
    }),
  } as unknown as ServerResponse;
  await handler(req, res, path, new URLSearchParams());
  return out;
}

const idOf = (body: Json) => (body.challenge as { id: string }).id;

describe('challenges across API instances', () => {
  let one: Instance;
  let two: Instance;

  beforeEach(async () => {
    fake.docs.clear();
    fake.up = true;
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
