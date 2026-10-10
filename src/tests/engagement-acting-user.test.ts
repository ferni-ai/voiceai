/**
 * Ritual and prediction writes act on the verified caller, not on body.userId.
 *
 * Before: POST /api/rituals, POST /api/rituals/:id/complete and
 * POST /api/predictions/:id/actuals took `body.userId || requireUserId(...)`.
 * A body naming someone won before any credential was looked at, so anyone
 * could add rituals to, complete rituals for (moving streaks and weather
 * history), or rewrite prediction outcomes of any user.
 *
 * Drives the real routes and body validators; only the auth verifier and the
 * engagement store (plus the daily-rituals service) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const store = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getRitualStreak: vi.fn(),
  saveRitualStreak: vi.fn(),
  recordWeather: vi.fn(),
  updatePredictionActuals: vi.fn(),
}));
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => store),
}));
vi.mock('../services/daily-rituals.js', () => ({
  getDailyRitualsService: vi.fn(() => ({ recordCompletionAsync: vi.fn() })),
  PERSONA_RITUALS: { 'ferni-sky-check': { personaId: 'ferni', name: 'Sky Check' } },
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>.
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

const { handleRitualsRoutes } = await import('../api/routes/rituals.js');
const { handlePredictionsRoutes } = await import('../api/routes/predictions.js');

async function post(
  handler: typeof handleRitualsRoutes,
  path: string,
  body: Record<string, unknown>,
  caller: string | null
): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = caller ? { authorization: `Bearer ${caller}`, 'x-firebase-uid': caller } : {};
  stream.end(JSON.stringify(body));

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handler(req, res, path, new URL(`http://localhost${path}`));
  return status;
}

const WRITES = [
  {
    name: 'create a ritual',
    handler: handleRitualsRoutes,
    path: '/api/rituals',
    body: { ritual: { personaId: 'ferni', name: 'Morning' } },
  },
  {
    name: 'complete a ritual',
    handler: handleRitualsRoutes,
    path: '/api/rituals/ferni-sky-check/complete',
    body: { weather: { primary: 'sunny', energy: 'high' } },
  },
  {
    name: 'record prediction actuals',
    handler: handlePredictionsRoutes,
    path: '/api/predictions/pred-1/actuals',
    body: { actuals: { sleep: 7 } },
  },
];

function storeTouched(userId: string): boolean {
  return Object.values(store).some((fn) => fn.mock.calls.some((args) => args[0] === userId));
}

describe('ritual and prediction writes act on the verified caller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.getProfile.mockResolvedValue({ userId: 'alice', activeRituals: [] });
    store.saveProfile.mockResolvedValue(undefined);
    store.saveRitualStreak.mockResolvedValue(undefined);
    store.getRitualStreak.mockResolvedValue(null);
    store.updatePredictionActuals.mockResolvedValue({ id: 'pred-1', accuracy: 90 });
  });

  for (const w of WRITES) {
    it(`${w.name}: signed-in alice naming bob gets 403 and bob's data is untouched`, async () => {
      const status = await post(w.handler, w.path, { ...w.body, userId: 'bob' }, 'alice');

      expect(status).toBe(403);
      expect(storeTouched('bob')).toBe(false);
    });

    it(`${w.name}: with no credentials, naming bob gets 401 and bob's data is untouched`, async () => {
      const status = await post(w.handler, w.path, { ...w.body, userId: 'bob' }, null);

      expect(status).toBe(401);
      expect(storeTouched('bob')).toBe(false);
    });
  }

  it('alice creating her own ritual still works', async () => {
    const status = await post(
      handleRitualsRoutes,
      '/api/rituals',
      { ...WRITES[0].body, userId: 'alice' },
      'alice'
    );

    expect(status).toBe(201);
    expect(store.saveRitualStreak.mock.calls[0]?.[0]).toBe('alice');
  });

  it('alice recording her own prediction actuals (as the web does, no userId) still works', async () => {
    const status = await post(
      handlePredictionsRoutes,
      '/api/predictions/pred-1/actuals',
      WRITES[2].body,
      'alice'
    );

    expect(status).toBe(200);
    expect(store.updatePredictionActuals).toHaveBeenCalledWith('alice', 'pred-1', { sleep: 7 });
  });
});
