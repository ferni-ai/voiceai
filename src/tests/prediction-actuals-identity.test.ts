/**
 * POST /api/predictions/:id/actuals acts only as the verified caller.
 *
 * Before: the route resolved the user as `body.userId || requireUserId(...)`,
 * so a body naming someone else rewrote that person's prediction outcome
 * before any credential was looked at. Now the user is the one
 * bindVerifiedIdentity bound from the token (x-firebase-uid); a body naming
 * anyone else gets 403, and no credential gets 401.
 *
 * Drives the real route and validators; only the engagement store is faked.
 */

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updatePredictionActuals = vi.fn();
// The route resolves the caller through acting-user.ts -> requireAuth. Stand in
// for the verified token with the uid bindVerifiedIdentity would have bound
// (x-firebase-uid); no uid means no credentials (401).
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const uid = req.headers['x-firebase-uid'];
    if (typeof uid !== 'string' || !uid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: uid, isAdmin: false };
  }),
}));

vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ updatePredictionActuals }),
}));

const { handlePredictionsRoutes } = await import('../api/routes/predictions.js');

const DEEP_WORK = 'Deep work hours';

async function post(
  signedInUid: string | null,
  body: unknown
): Promise<{ status: number; error?: string }> {
  let status = 0;
  let error: string | undefined;
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: '/api/predictions/pred_1/actuals',
    headers: { host: 'localhost', ...(signedInUid ? { 'x-firebase-uid': signedInUid } : {}) },
  });
  const res = {
    setHeader: vi.fn(),
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      if (chunk) error = (JSON.parse(chunk) as { error?: string }).error;
    },
  } as unknown as ServerResponse;
  const url = new URL('http://localhost/api/predictions/pred_1/actuals');
  await handlePredictionsRoutes(req, res, url.pathname, url);
  return { status, error };
}

beforeEach(() => {
  updatePredictionActuals.mockReset();
  updatePredictionActuals.mockResolvedValue({
    accuracy: 100,
    metrics: [{ key: DEEP_WORK, predicted: 7, actual: 7, accuracy: 100 }],
  });
});

describe('recording prediction actuals uses the verified caller', () => {
  it('writes for the signed-in user (the web sends their own id)', async () => {
    const { status } = await post('alice', { userId: 'alice', actuals: { [DEEP_WORK]: 7 } });

    expect(status).toBe(200);
    expect(updatePredictionActuals).toHaveBeenCalledWith('alice', 'pred_1', { [DEEP_WORK]: 7 });
  });

  it('writes for the signed-in user when the body names nobody', async () => {
    await post('alice', { actuals: { [DEEP_WORK]: 7 } });

    expect(updatePredictionActuals).toHaveBeenCalledWith('alice', 'pred_1', { [DEEP_WORK]: 7 });
  });

  it('refuses a body naming another user', async () => {
    const { status, error } = await post('alice', { userId: 'bob', actuals: { [DEEP_WORK]: 7 } });

    expect(status).toBe(403);
    expect(updatePredictionActuals).not.toHaveBeenCalled();
  });

  it('refuses a caller with no verified identity, whatever the body says', async () => {
    const { status } = await post(null, { userId: 'bob', actuals: { [DEEP_WORK]: 7 } });

    expect(status).toBe(401);
    expect(updatePredictionActuals).not.toHaveBeenCalled();
  });
});
