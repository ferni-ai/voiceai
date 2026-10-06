/**
 * GET /api/marketplace/agents/:id/manifest
 * Registry IDs only; public fields only.
 */
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleBrowseRoutes } from '../browse-routes.js';

function createReq(): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'GET';
  req.headers = {};
  return req;
}

function createRes(): ServerResponse & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: null as unknown,
    writeHead: function (this: { _status: number }, status: number) {
      this._status = status;
    },
    end: function (this: { _body: unknown }, data?: string) {
      this._body = data ? JSON.parse(data) : null;
    },
    setHeader: () => undefined,
  };
  return res as unknown as ServerResponse & { _status: number; _body: unknown };
}

describe('GET /api/marketplace/agents/:id/manifest', () => {
  it('returns a public manifest for a registry agent', async () => {
    const res = createRes();
    const handled = await handleBrowseRoutes(
      createReq(),
      res,
      '/api/marketplace/agents/moxie-accountability/manifest',
      'GET'
    );

    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    const body = res._body as { manifest: Record<string, unknown> };
    expect(body.manifest.id).toBe('moxie-accountability');
    expect(body.manifest.name).toBe('Moxie');
    expect(body.manifest).not.toHaveProperty('llm_context');
    expect(body.manifest).not.toHaveProperty('voice');
    expect(body.manifest).not.toHaveProperty('hooks');
    expect(body.manifest).not.toHaveProperty('secrets');
    expect(JSON.stringify(body.manifest)).not.toMatch(/api[_-]?key/i);
  });

  it('returns 404 for an id that is not in the registry', async () => {
    const res = createRes();
    const handled = await handleBrowseRoutes(
      createReq(),
      res,
      '/api/marketplace/agents/not-a-real-agent/manifest',
      'GET'
    );

    expect(handled).toBe(true);
    expect(res._status).toBe(404);
  });

  it('returns 404 for a path-traversal style id', async () => {
    const res = createRes();
    const handled = await handleBrowseRoutes(
      createReq(),
      res,
      '/api/marketplace/agents/..%2Fferni/manifest',
      'GET'
    );

    expect(handled).toBe(true);
    expect(res._status).toBe(404);
  });
});
