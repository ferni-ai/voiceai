/**
 * GET /api/year-in-review/:userId returns a person's commitments, dreams and
 * conversation stats. It used to answer anyone, unauthenticated, for any id.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock('../auth-middleware.js', () => ({ requireAuth }));

import { handleYearInReviewRoutes } from '../year-in-review-routes.js';

function call(userIdInPath: string) {
  const res = {
    statusCode: 200,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    end(data?: string) {
      this.body = data ?? '';
    },
  };
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  const pathname = `/api/year-in-review/${userIdInPath}`;
  return handleYearInReviewRoutes(req, res as unknown as ServerResponse, { pathname, query: {} }).then(
    (handled) => ({ handled, status: res.statusCode, body: res.body })
  );
}

describe('GET /api/year-in-review/:userId access', () => {
  it('refuses a caller with no credentials (requireAuth answers 401)', async () => {
    requireAuth.mockImplementation(async (_req, res: ServerResponse) => {
      res.writeHead(401);
      res.end('{"error":"Unauthorized"}');
      return null;
    });
    const r = await call('victim-uid');
    expect(r.handled).toBe(true);
    expect(r.status).toBe(401);
    expect(r.body).not.toContain('victim-uid');
  });

  it("refuses a signed-in user asking for someone else's year", async () => {
    requireAuth.mockResolvedValue({ userId: 'me-uid', isAdmin: false });
    const r = await call('victim-uid');
    expect(r.status).toBe(403);
    expect(r.body).not.toContain('victim-uid');
  });

  it('serves your own year', async () => {
    requireAuth.mockResolvedValue({ userId: 'me-uid', isAdmin: false });
    const r = await call('me-uid');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).userId).toBe('me-uid');
  });

  it('lets an admin read any year (support)', async () => {
    requireAuth.mockResolvedValue({ userId: 'admin-uid', isAdmin: true });
    const r = await call('someone-uid');
    expect(r.status).toBe(200);
  });
});
