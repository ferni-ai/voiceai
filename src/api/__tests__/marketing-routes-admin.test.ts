/**
 * /api/marketing/* is the company's own social publishing tool. It was mounted with
 * no auth: anonymous callers read posts and analytics (200 in production) and wrote
 * scheduled posts under any userId. Every route but the OAuth callbacks is now
 * admin-only, through the real requireAdmin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

const storage = vi.hoisted(() => ({
  schedulePost: vi.fn(async () => 'post-1'),
  getScheduledPosts: vi.fn(async () => []),
  getAnalytics: vi.fn(async () => ({ totalPosts: 0, insights: [] })),
}));

vi.mock('../../tools/domains/marketing/storage.js', () => ({
  MarketingStorage: vi.fn(function () {
    return storage;
  }),
}));

import { handleMarketingRoutes } from '../marketing-routes.js';

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & { [Symbol.asyncIterator]?: unknown };
  req.method = method;
  req.url = url;
  req.headers = { host: 'app.ferni.ai', 'content-type': 'application/json' };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: '203.0.113.9',
  };
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  req[Symbol.asyncIterator] = async function* () {
    yield* chunks;
  };
  return req;
}

type FakeResponse = { status?: number; headersSent: boolean };

function response(): ServerResponse & { status?: number } {
  const state: FakeResponse = { headersSent: false };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end: () => res,
  }) as unknown as ServerResponse & { status?: number };
  return res;
}

async function call(method: string, path: string, body?: unknown) {
  const url = new URL(path, 'https://app.ferni.ai');
  const res = response();
  const handled = await handleMarketingRoutes(request(method, path, body), res, url.pathname, url);
  return { handled, status: res.status };
}

beforeEach(() => vi.clearAllMocks());

describe('marketing routes are admin-only', () => {
  it.each([
    ['GET', '/api/marketing/posts'],
    ['GET', '/api/marketing/accounts'],
    ['GET', '/api/marketing/analytics'],
    ['GET', '/api/marketing/linkedin/connect?userId=default'],
    ['GET', '/api/marketing/twitter/connect?userId=default'],
  ])('refuses an anonymous %s %s', async (method, path) => {
    const { handled, status } = await call(method, path);
    expect(handled).toBe(true);
    expect(status).toBe(401);
    expect(storage.getScheduledPosts).not.toHaveBeenCalled();
    expect(storage.getAnalytics).not.toHaveBeenCalled();
  });

  it('refuses an anonymous post and writes nothing', async () => {
    const { status } = await call('POST', '/api/marketing/posts', {
      userId: 'default',
      platform: 'twitter',
      content: 'spam',
      scheduledAt: '2026-10-05T00:00:00Z',
    });
    expect(status).toBe(401);
    expect(storage.schedulePost).not.toHaveBeenCalled();
  });

  it('leaves the OAuth callbacks to their state check', async () => {
    const { status } = await call('GET', '/api/marketing/linkedin/callback');
    expect(status).not.toBe(401);
  });
});
