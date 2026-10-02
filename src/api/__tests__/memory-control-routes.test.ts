/**
 * /api/memory/me routes: auth, ownership (404), validation, rate limits, shapes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse } from './http-test-utils.js';

const svc = vi.hoisted(() => ({
  listMemories: vi.fn(),
  editFact: vi.fn(),
  deleteFact: vi.fn(),
  deletePerson: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  deleteConversation: vi.fn(),
  exportMemories: vi.fn(),
  deleteAllMemories: vi.fn(),
  limited: new Set<string>(),
}));

vi.mock('../../services/memory-control/index.js', () => ({
  ...svc,
  MAX_FACT_TEXT: 500,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
}));

vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(
    (
      _req: unknown,
      res: { writeHead: (s: number) => void; end: (b: string) => void },
      opts: { keyPrefix: string }
    ) => {
      if (!svc.limited.has(opts.keyPrefix)) return false;
      res.writeHead(429);
      res.end('{"error":"Too many requests"}');
      return true;
    }
  ),
}));

import { handleMemoryControlRoutes, isMemoryControlPath } from '../memory-control-routes.js';

const ok = <T>(value: T) => ({ ok: true, value });
const notFound = { ok: false, error: { code: 'not_found', message: 'Not found' } };

async function call(
  method: string,
  path: string,
  opts: { user?: string | null; body?: unknown } = {}
): Promise<{
  status: number | undefined;
  json: () => unknown;
  body: () => string;
  handled: boolean;
}> {
  const headers: Record<string, string> = {};
  if (opts.user !== null) headers['x-firebase-uid'] = opts.user ?? 'user-a';
  const req = fakeRequest({
    method,
    url: path,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = fakeResponse();
  const url = new URL(path, 'http://api.test');
  const handled = await handleMemoryControlRoutes(req, res.res, url.pathname, url);
  return { status: res.status(), json: res.json, body: res.body, handled };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.limited.clear();
});

describe('routing', () => {
  it('only claims /api/memory/me paths', async () => {
    expect(isMemoryControlPath('/api/memory/me')).toBe(true);
    expect(isMemoryControlPath('/api/memory/me/facts/x')).toBe(true);
    expect(isMemoryControlPath('/api/memory/metrics')).toBe(false);
    expect(isMemoryControlPath('/api/memory/meta')).toBe(false);
    expect((await call('GET', '/api/memory/metrics')).handled).toBe(false);
  });

  it('404s unknown sub-resources and 405s wrong methods', async () => {
    expect((await call('GET', '/api/memory/me/nope')).status).toBe(404);
    expect((await call('GET', '/api/memory/me/facts/a/b')).status).toBe(404);
    expect((await call('POST', '/api/memory/me')).status).toBe(405);
    expect((await call('GET', '/api/memory/me/people/p1')).status).toBe(405);
    expect((await call('POST', '/api/memory/me/export')).status).toBe(405);
  });
});

describe('auth', () => {
  it('401s without a verified identity on every route', async () => {
    for (const [method, path] of [
      ['GET', '/api/memory/me'],
      ['DELETE', '/api/memory/me'],
      ['PATCH', '/api/memory/me/facts/f1'],
      ['DELETE', '/api/memory/me/facts/f1'],
      ['DELETE', '/api/memory/me/people/p1'],
      ['GET', '/api/memory/me/conversations'],
      ['GET', '/api/memory/me/conversations/c1'],
      ['DELETE', '/api/memory/me/conversations/c1'],
      ['GET', '/api/memory/me/export'],
    ]) {
      const res = await call(method, path, { user: null });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    expect(svc.listMemories).not.toHaveBeenCalled();
  });

  it('uses the verified caller, never a userId query parameter', async () => {
    svc.listMemories.mockResolvedValue(ok({ facts: [], people: [], updatedAt: null }));
    await call('GET', '/api/memory/me?userId=user-b');
    expect(svc.listMemories).toHaveBeenCalledWith('user-a');
  });

  it('accepts anonymous device identities', async () => {
    svc.listMemories.mockResolvedValue(ok({ facts: [], people: [], updatedAt: null }));
    const req = fakeRequest({
      method: 'GET',
      url: '/api/memory/me',
      headers: { 'x-user-id': 'device:abc' },
    });
    const res = fakeResponse();
    await handleMemoryControlRoutes(
      req,
      res.res,
      '/api/memory/me',
      new URL('http://x/api/memory/me')
    );
    expect(res.status()).toBe(200);
    expect(svc.listMemories).toHaveBeenCalledWith('device:abc');
  });
});

describe('GET /api/memory/me', () => {
  it('returns facts and people', async () => {
    const body = { facts: [{ id: 'f1' }], people: [], updatedAt: '2026-01-01T00:00:00.000Z' };
    svc.listMemories.mockResolvedValue(ok(body));
    const res = await call('GET', '/api/memory/me');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual(body);
  });

  it('503s when storage is unavailable', async () => {
    svc.listMemories.mockResolvedValue({
      ok: false,
      error: { code: 'unavailable', message: 'down' },
    });
    expect((await call('GET', '/api/memory/me')).status).toBe(503);
  });
});

describe('facts', () => {
  it('PATCH validates and edits', async () => {
    svc.editFact.mockResolvedValue(ok({ id: 'f1', text: 'New', userEdited: true }));
    const res = await call('PATCH', '/api/memory/me/facts/f1', {
      body: { text: 'New', category: 'work' },
    });
    expect(res.status).toBe(200);
    expect(svc.editFact).toHaveBeenCalledWith('user-a', 'f1', { text: 'New', category: 'work' });
  });

  it('PATCH rejects bad bodies', async () => {
    for (const body of [
      {},
      { text: '' },
      { text: 'x'.repeat(501) },
      { text: 'ok', extra: 1 },
      'nope',
    ]) {
      expect((await call('PATCH', '/api/memory/me/facts/f1', { body })).status).toBe(400);
    }
    expect(svc.editFact).not.toHaveBeenCalled();
  });

  it("404s another user's fact (lookups are scoped to the caller)", async () => {
    svc.editFact.mockResolvedValue(notFound);
    svc.deleteFact.mockResolvedValue(notFound);
    expect(
      (await call('PATCH', '/api/memory/me/facts/theirs', { body: { text: 'x' } })).status
    ).toBe(404);
    expect((await call('DELETE', '/api/memory/me/facts/theirs')).status).toBe(404);
    expect(svc.deleteFact).toHaveBeenCalledWith('user-a', 'theirs');
  });

  it('DELETE returns { deleted: true }', async () => {
    svc.deleteFact.mockResolvedValue(ok({ deleted: true }));
    const res = await call('DELETE', '/api/memory/me/facts/f1');
    expect(res.json()).toEqual({ deleted: true });
  });

  it('rejects malformed ids', async () => {
    expect((await call('DELETE', '/api/memory/me/facts/%2E%2E')).status).toBe(400);
    expect((await call('DELETE', '/api/memory/me/facts/a%2Fb')).status).toBe(400);
    expect((await call('DELETE', '/api/memory/me/facts/%E0%A4%A')).status).toBe(400);
  });

  it('rate-limits destructive routes', async () => {
    svc.limited.add('memory-me-delete');
    expect((await call('DELETE', '/api/memory/me/facts/f1')).status).toBe(429);
    expect((await call('DELETE', '/api/memory/me/people/p1')).status).toBe(429);
    expect((await call('DELETE', '/api/memory/me/conversations/c1')).status).toBe(429);
    expect(svc.deleteFact).not.toHaveBeenCalled();
    expect(svc.deletePerson).not.toHaveBeenCalled();
    expect(svc.deleteConversation).not.toHaveBeenCalled();
  });
});

describe('people', () => {
  it('DELETE deletes and 404s unknown', async () => {
    svc.deletePerson.mockResolvedValueOnce(ok({ deleted: true })).mockResolvedValueOnce(notFound);
    expect((await call('DELETE', '/api/memory/me/people/p1')).json()).toEqual({ deleted: true });
    expect((await call('DELETE', '/api/memory/me/people/zz')).status).toBe(404);
  });
});

describe('conversations', () => {
  it('lists with cursor and clamped limit', async () => {
    svc.listConversations.mockResolvedValue(ok({ conversations: [], nextCursor: 'c9' }));
    const res = await call('GET', '/api/memory/me/conversations?cursor=c5&limit=500');
    expect(res.json()).toEqual({ conversations: [], nextCursor: 'c9' });
    expect(svc.listConversations).toHaveBeenCalledWith('user-a', { cursor: 'c5', limit: 100 });
  });

  it('rejects a malformed cursor and maps an unknown cursor to 400', async () => {
    expect((await call('GET', '/api/memory/me/conversations?cursor=a%20b')).status).toBe(400);
    svc.listConversations.mockResolvedValue({
      ok: false,
      error: { code: 'invalid', message: 'Unknown cursor' },
    });
    expect((await call('GET', '/api/memory/me/conversations?cursor=zz')).status).toBe(400);
  });

  it('gets a conversation with turns, 404 when not owned', async () => {
    const detail = {
      conversation: { id: 'c1', turnCount: 2 },
      turns: [{ role: 'user' }, { role: 'assistant' }],
    };
    svc.getConversation.mockResolvedValueOnce(ok(detail)).mockResolvedValueOnce(notFound);
    expect((await call('GET', '/api/memory/me/conversations/c1')).json()).toEqual(detail);
    expect((await call('GET', '/api/memory/me/conversations/theirs')).status).toBe(404);
  });

  it('deletes with cascade counts', async () => {
    svc.deleteConversation.mockResolvedValue(
      ok({ deleted: { turns: 3, facts: 1, embeddings: 2 } })
    );
    const res = await call('DELETE', '/api/memory/me/conversations/c1');
    expect(res.json()).toEqual({ deleted: { turns: 3, facts: 1, embeddings: 2 } });
  });
});

describe('export', () => {
  it('sends an attachment', async () => {
    svc.exportMemories.mockResolvedValue(
      ok({
        filename: 'ferni-memories-2026-10-02.csv',
        contentType: 'text/csv; charset=utf-8',
        body: '# facts',
      })
    );
    const res = await call('GET', '/api/memory/me/export?format=csv');
    expect(res.status).toBe(200);
    expect(res.body()).toBe('# facts');
    expect(svc.exportMemories).toHaveBeenCalledWith('user-a', 'csv');
  });

  it('defaults to json and rejects other formats', async () => {
    svc.exportMemories.mockResolvedValue(
      ok({ filename: 'a.json', contentType: 'application/json', body: '{}' })
    );
    await call('GET', '/api/memory/me/export');
    expect(svc.exportMemories).toHaveBeenCalledWith('user-a', 'json');
    expect((await call('GET', '/api/memory/me/export?format=xml')).status).toBe(400);
  });
});

describe('DELETE /api/memory/me', () => {
  it("requires { confirm: 'DELETE' }", async () => {
    for (const body of [undefined, {}, { confirm: 'yes' }]) {
      expect((await call('DELETE', '/api/memory/me', { body })).status).toBe(400);
    }
    expect(svc.deleteAllMemories).not.toHaveBeenCalled();
  });

  it('wipes and reports counts', async () => {
    svc.deleteAllMemories.mockResolvedValue(
      ok({ collections: { dynamic_facts: 4 }, embeddings: 3, graphRecords: 0 })
    );
    const res = await call('DELETE', '/api/memory/me', { body: { confirm: 'DELETE' } });
    expect(res.json()).toEqual({
      deleted: true,
      collections: { dynamic_facts: 4 },
      embeddings: 3,
      graphRecords: 0,
    });
  });

  it('is rate-limited separately', async () => {
    svc.limited.add('memory-me-deleteAll');
    expect((await call('DELETE', '/api/memory/me', { body: { confirm: 'DELETE' } })).status).toBe(
      429
    );
  });
});

describe('errors', () => {
  it('500s with a warm message when the service throws', async () => {
    svc.listMemories.mockRejectedValue(new Error('boom'));
    const res = await call('GET', '/api/memory/me');
    expect(res.status).toBe(500);
  });
});
