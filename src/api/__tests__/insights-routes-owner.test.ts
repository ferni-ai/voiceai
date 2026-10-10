/**
 * GET /api/insights/:userId answers only the person it names.
 *
 * The route took the user from the path and never checked who was asking, so any caller
 * could read anyone's commitments, dreams and energy history by changing the id. The door
 * (request-identity) rewrites ?userId=, not path segments, so the route must check itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';

const { requireAuth } = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth,
}));

const { handleInsightsRoutes } = await import('../insights-routes.js');

function response() {
  const res = {
    statusCode: 0,
    body: '',
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    end: vi.fn((chunk?: string) => {
      res.body = chunk ?? '';
      res.writableEnded = true;
    }),
  };
  return res;
}

const request = { method: 'GET', headers: {}, url: '/api/insights/victim' } as http.IncomingMessage;

describe('GET /api/insights/:userId', () => {
  beforeEach(() => requireAuth.mockReset());

  it("refuses a signed-in caller asking for someone else's insights", async () => {
    requireAuth.mockResolvedValue({ userId: 'attacker', isAdmin: false });
    const res = response();
    const handled = await handleInsightsRoutes(
      request,
      res as unknown as http.ServerResponse,
      '/api/insights/victim'
    );
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  it('stops at the auth check when the caller is not signed in', async () => {
    requireAuth.mockResolvedValue(null); // requireAuth has already sent the 401
    const res = response();
    const handled = await handleInsightsRoutes(
      request,
      res as unknown as http.ServerResponse,
      '/api/insights/victim'
    );
    expect(handled).toBe(true);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lets the person, and an admin, through to their insights', async () => {
    for (const auth of [{ userId: 'victim', isAdmin: false }, { userId: 'ops', isAdmin: true }]) {
      requireAuth.mockResolvedValue(auth);
      const res = response();
      await handleInsightsRoutes(request, res as unknown as http.ServerResponse, '/api/insights/victim');
      expect(res.statusCode).not.toBe(403);
    }
  });
});
