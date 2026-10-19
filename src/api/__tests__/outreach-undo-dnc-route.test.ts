/**
 * POST /api/outreach/consent/calls/undo lifts the do-not-call on the signed-in
 * owner's own number only: no auth sends nothing, and a number in the body is
 * ignored (the service reads the account's verified phone).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: 'owner-1' as string | null }));
vi.mock('../auth-middleware.js', async (orig) => ({
  ...(await orig<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
  requireAuth: async (_req: unknown, res: { writeHead: (n: number) => void; end: () => void }) => {
    if (auth.userId)
      return { userId: auth.userId, isAdmin: false, isDevMode: false, authMethod: 'firebase' };
    res.writeHead(401);
    res.end();
    return null;
  },
}));
const undoOwnCallOptOut = vi.hoisted(() => vi.fn(async () => ({ ok: true, phoneLast4: '0199' })));
vi.mock('../../services/messaging/owner-call-optin.js', () => ({ undoOwnCallOptOut }));

import { handleOutreachRoutes } from '../outreach.routes.js';

const PATH = '/api/outreach/consent/calls/undo';
function post(body: Record<string, unknown> = {}) {
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { 'content-type': 'application/json' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn(), statusCode: 200 };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

beforeEach(() => {
  auth.userId = 'owner-1';
  undoOwnCallOptOut.mockClear();
});

describe('POST /api/outreach/consent/calls/undo', () => {
  it("lifts the signed-in owner's own do-not-call, ignoring any number in the body", async () => {
    const { req, res } = post({ phone: '+12025550123', userId: 'someone-else' });
    await handleOutreachRoutes(req, res, PATH, new URL(`http://x${PATH}`));
    expect(undoOwnCallOptOut).toHaveBeenCalledWith('owner-1');
  });

  it('MESSAGING_PIPELINE off: 404, the route does not exist yet', async () => {
    undoOwnCallOptOut.mockResolvedValueOnce({ ok: false, reason: 'pipeline-off' } as never);
    const { req, res } = post();
    await handleOutreachRoutes(req, res, PATH, new URL(`http://x${PATH}`));
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything());
  });

  it('without a login, nothing is changed', async () => {
    auth.userId = null;
    const { req, res } = post();
    await handleOutreachRoutes(req, res, PATH, new URL(`http://x${PATH}`));
    expect(undoOwnCallOptOut).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(401);
  });
});
