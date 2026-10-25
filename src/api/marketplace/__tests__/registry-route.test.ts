/**
 * GET /api/marketplace/registry lists only agents the voice agent can be, with no invented stats.
 *
 * None of the 15 registry agents has a persona bundle: an id the voice agent
 * doesn't know resolves to Ferni (persona-ids.ts toCanonical), so "Add to team"
 * promised a friend who never came. The registry also rated all 15 at 5.0 with
 * 0 downloads, which every card showed as five stars.
 */
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { isKnownId } from '../../../personas/persona-ids.js';
import { handleBrowseRoutes } from '../browse-routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

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

describe('GET /api/marketplace/registry', () => {
  it('leaves out agents that would turn into Ferni on a call', async () => {
    const file = JSON.parse(
      readFileSync(join(root, 'apps/marketplace-agents/registry.json'), 'utf-8')
    ) as { agents: Array<{ id: string }> };
    const unknown = file.agents.filter((a) => !isKnownId(a.id)).map((a) => a.id);
    expect(unknown).toContain('moxie-accountability');

    const res = createRes();
    expect(await handleBrowseRoutes(createReq(), res, '/api/marketplace/registry', 'GET')).toBe(
      true
    );
    expect(res._status).toBe(200);
    const listed = (res._body as { agents: Array<{ id: string }> }).agents.map((a) => a.id);
    for (const id of unknown) expect(listed).not.toContain(id);
    for (const id of listed) expect(isKnownId(id)).toBe(true);
  });

  it.each(['apps/marketplace-agents/registry.json'])(
    '%s carries no invented rating or download count',
    (path) => {
      const file = JSON.parse(readFileSync(join(root, path), 'utf-8')) as {
        agents: Array<Record<string, unknown>>;
      };
      expect(file.agents.length).toBeGreaterThan(0);
      for (const agent of file.agents) {
        expect(agent).not.toHaveProperty('rating');
        expect(agent).not.toHaveProperty('downloads');
      }
    }
  );
});
