/**
 * Trust routes that answered from nothing are gone.
 *
 * POST /api/trust/insights/generate built a report from the API process's
 * empty memory (0 conversations, 0 wins), POST /api/trust/health/calculate
 * filled every missing input with 50, and POST /api/trust/life-events saved
 * detected events only to API memory that nothing persists. No client calls
 * any of them (grep apps/ src/), so they are deleted: the router no longer
 * claims them and the server answers 404 instead of a fabricated result.
 */

import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'signed-in-user', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const { handleTrustSystemsRoutes } = await import('../trust-systems-routes.js');

async function post(path: string, body: unknown): Promise<{ handled: boolean; status: number }> {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url: path,
    headers: { host: 'localhost', 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
  let status = 0;
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(s: number) {
      status = s;
      return this;
    },
    end: vi.fn(),
  } as unknown as ServerResponse;
  const url = new URL(path, 'http://localhost');
  const handled = await handleTrustSystemsRoutes(req, res, url.pathname, url);
  return { handled, status };
}

describe('unbacked trust routes', () => {
  it.each([
    ['/api/trust/insights/generate', { period: 'month' }],
    ['/api/trust/health/calculate', {}],
    ['/api/trust/life-events', { text: 'I have a job interview next Tuesday' }],
  ])('%s is not served (no fabricated result)', async (path, body) => {
    const { handled, status } = await post(path, body);
    expect(handled).toBe(false);
    expect(status).toBe(0);
  });
});
