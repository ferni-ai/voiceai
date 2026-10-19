/**
 * POST /api/outreach/test/send acts only for the signed-in caller: a body
 * userId that names someone else is refused and nothing is sent or rung.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-middleware.js', async (orig) => ({
  ...(await orig<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
  requireAuth: async () => ({
    userId: 'owner-1',
    isAdmin: false,
    isDevMode: false,
    authMethod: 'firebase',
  }),
}));
const sends = vi.hoisted(() => ({
  callUser: vi.fn(async () => ({ success: true })),
  textUser: vi.fn(async () => ({ success: true })),
  emailUser: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../tools/domains/proactive/outreach/index.js', () => sends);

import { handleOutreachRoutes } from '../outreach.routes.js';

const PATH = '/api/outreach/test/send';
function post(body: Record<string, unknown>) {
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { 'content-type': 'application/json' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn(), statusCode: 200 };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/outreach/test/send', () => {
  it('a body userId that is not the caller is refused; nothing is rung', async () => {
    const { req, res } = post({ channel: 'call', message: 'hi', userId: 'someone-else' });
    await handleOutreachRoutes(req, res, PATH, new URL(`http://x${PATH}`));
    expect(sends.callUser).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
  });

  it("the caller's own id (or none) rings the caller's own verified number", async () => {
    const { req, res } = post({ channel: 'call', message: 'hi' });
    await handleOutreachRoutes(req, res, PATH, new URL(`http://x${PATH}`));
    expect(sends.callUser).toHaveBeenCalledWith('owner-1', 'hi');
  });
});
