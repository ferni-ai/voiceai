/**
 * The calendar router reads a POST body to find the user, then the handler reads
 * it again. With a real one-shot request stream the second read never saw 'end',
 * so Apple connect and notification-preference saves hung forever.
 * These tests use a real stream (data + end emitted exactly once) and a timeout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const mocks = vi.hoisted(() => ({
  storeCredentials: vi.fn(),
  registerUser: vi.fn(),
  pollUser: vi.fn(),
  setNotificationPreference: vi.fn(),
}));

vi.mock('../../services/calendar/providers/apple-provider.js', () => ({
  appleCalendarProvider: { storeCredentials: mocks.storeCredentials },
}));
vi.mock('../../services/calendar/polling/apple-polling.js', () => ({
  registerUser: mocks.registerUser,
  unregisterUser: vi.fn(),
  pollUser: mocks.pollUser,
}));
vi.mock('../../services/calendar/notification-preferences.js', () => ({
  setNotificationPreference: mocks.setNotificationPreference,
  getNotificationPreferences: vi.fn(),
}));

import { handleCalendarRoutes } from '../calendar-routes/index.js';

function post(path: string, body: unknown): IncomingMessage {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = { 'content-type': 'application/json' };
  stream.end(JSON.stringify(body));
  return req;
}

function response(): ServerResponse & { status: () => number; json: () => Record<string, unknown> } {
  let status = 0;
  let raw = '';
  return {
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    setHeader: vi.fn(),
    end: vi.fn((d?: string) => {
      raw = d ?? '';
    }),
    status: () => status,
    json: () => JSON.parse(raw || '{}') as Record<string, unknown>,
  } as unknown as ServerResponse & { status: () => number; json: () => Record<string, unknown> };
}

function withinOneSecond<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('request hung')), 1000)),
  ]);
}

describe('calendar POST bodies are read once', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeCredentials.mockResolvedValue(true);
    mocks.setNotificationPreference.mockResolvedValue(undefined);
  });

  it('Apple connect completes and sees the credentials', async () => {
    const res = response();
    const req = post('/api/calendar/apple/connect', {
      userId: 'u1',
      apple_id: 'me@icloud.com',
      app_password: 'abcd-efgh-ijkl-mnop',
    });

    await withinOneSecond(handleCalendarRoutes(req, res, '/api/calendar/apple/connect', new URL('http://x/api/calendar/apple/connect')));

    expect(mocks.storeCredentials).toHaveBeenCalledWith('u1', 'me@icloud.com', 'abcd-efgh-ijkl-mnop');
    expect(res.json().success).toBe(true);
  });

  it('notification preference saves complete', async () => {
    const res = response();
    const req = post('/api/calendar/notification-preferences', {
      userId: 'u1',
      setting: 'morningBriefing',
      enabled: false,
    });

    await withinOneSecond(
      handleCalendarRoutes(req, res, '/api/calendar/notification-preferences', new URL('http://x/api/calendar/notification-preferences'))
    );

    expect(mocks.setNotificationPreference).toHaveBeenCalledWith('u1', 'morningBriefing', false);
    expect(res.status()).toBe(200);
  });
});
