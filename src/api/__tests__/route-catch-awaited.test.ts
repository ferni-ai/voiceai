/**
 * A route that returns a handler's promise inside its own `try` must await it, or the route's
 * catch never sees the handler's rejection (#4139). One row per catch shape in batch 1:
 * - the generic 500 (commands: logs, sends "Internal server error");
 * - the outreach 500, whose body also carries `success: false`;
 * - a handler that sent its response and then rejected: the route's catch runs, its second
 *   writeHead throws ERR_HTTP_HEADERS_SENT, and the client keeps the response it already got.
 *
 * The server below stands in for the API server's outer catch: a rejected route answers 599,
 * so a missing await shows as 599 here instead of the route's own response.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const loadCommandsWithCache = vi.fn();
const getCommand = vi.fn();
const handleOutreachWebhookRoutes = vi.fn();
const sentThenFailed = vi.fn();

vi.mock('../../personas/bundles/commands-loader.js', () => ({
  loadCommandsWithCache,
  getCommand,
  renderCommand: vi.fn(),
}));
vi.mock('../outreach-webhook-routes.js', () => ({ handleOutreachWebhookRoutes }));
vi.mock('../helpers.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...real,
    // Sends the response, then fails: the "headers already sent" shape.
    sendJSONEdgeCached: (res: ServerResponse, data: unknown) => {
      if (!sentThenFailed.getMockImplementation()) {
        real.sendJSONEdgeCached(res, data);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"sent":true}');
      sentThenFailed();
    },
  };
});

const { handleCommandsRoutes } = await import('../commands-routes.js');
const { handleOutreachRoutes } = await import('../outreach.routes.js');

type Route = (req: IncomingMessage, res: ServerResponse, path: string) => Promise<boolean>;
const routes: Record<string, Route> = {
  commands: (req, res, path) => handleCommandsRoutes(req, res, path),
  outreach: (req, res, path) =>
    handleOutreachRoutes(req, res, path, new URL(path, 'http://localhost')),
};

/** What the last route call settled to: `true` or the error it rejected with. */
let settled: Promise<unknown> = Promise.resolve();
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = url.searchParams.get('route') ?? '';
    settled = routes[name](req, res, url.pathname).then(
      (handled) => handled,
      (error: unknown) => {
        if (!res.headersSent) {
          res.writeHead(599);
          res.end('outer catch');
        }
        return error;
      }
    );
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => {
  vi.clearAllMocks();
  sentThenFailed.mockReset();
});

async function get(path: string, route: string) {
  const res = await fetch(`${base}${path}?route=${route}`);
  return { status: res.status, body: await res.text(), settled: await settled };
}

describe('route catches see a rejected handler', () => {
  it('commands, a handler that rejects: the route answers its own generic 500', async () => {
    loadCommandsWithCache.mockRejectedValue(new Error('bundle read failed'));
    const { status, body, settled: result } = await get('/api/commands/ferni', 'commands');
    expect(status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: 'Internal server error' });
    expect(result).toBe(true);
  });

  it('outreach webhooks, a handler that rejects: the 500 body carries success false', async () => {
    handleOutreachWebhookRoutes.mockRejectedValue(new Error('signature store down'));
    const { status, body, settled: result } = await get('/api/outreach/webhooks/sms', 'outreach');
    expect(status).toBe(500);
    expect(JSON.parse(body)).toEqual({ success: false, error: 'Internal server error' });
    expect(result).toBe(true);
  });

  it('commands, a handler that sent its response then rejected: the client keeps it', async () => {
    getCommand.mockResolvedValue({ id: 'recap', name: 'Recap', arguments: [] });
    sentThenFailed.mockImplementation(() => {
      throw new Error('failed after send');
    });
    const { status, body, settled: result } = await get('/api/commands/ferni/recap', 'commands');
    expect(status).toBe(200);
    expect(body).toBe('{"sent":true}');
    // The route's own catch ran: its writeHead on the sent response is what rejected.
    expect((result as NodeJS.ErrnoException).code).toBe('ERR_HTTP_HEADERS_SENT');
  });
});
