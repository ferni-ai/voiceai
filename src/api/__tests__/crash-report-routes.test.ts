/**
 * /api/crash-report and /api/disconnect-diagnostic: reads go through the real
 * requireAdmin; posts need no sign-in but are rate limited per caller and
 * validated, and the reply never carries stored data.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

vi.hoisted(() => {
  process.env.ADMIN_API_KEYS = 'test-admin-key';
  process.env.API_KEYS = 'test-service-key';
});

import { handleCrashReportRoutes, CRASH_REPORT_POSTS_PER_MINUTE } from '../crash-report-routes.js';
import { CRASH_REPORT_MAX_BODY_BYTES, crashReportBodySchema } from '../crash-report-input.js';

const CRASH = '/api/crash-report';
const DIAGNOSTIC = '/api/disconnect-diagnostic';

let ipCounter = 0;
/** Each test calls from its own address so rate-limit buckets don't carry over. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function request(
  method: string,
  url: string,
  ip: string,
  headers: Record<string, string> = {},
  body?: unknown
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'app.ferni.ai', 'content-type': 'application/json', ...headers };
  (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: ip };
  (req as unknown as { destroy: () => void }).destroy = () => undefined;
  (req as unknown as { pause: () => void }).pause = () => undefined;
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  // The body reader listens for 'data'/'end'; send them once it is listening.
  const on = req.on.bind(req);
  req.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === 'end') {
      setTimeout(() => {
        for (const c of chunks) req.emit('data', c);
        req.emit('end');
      }, 0);
    }
    return req;
  }) as typeof req.on;
  return req;
}

type TestResponse = ServerResponse & { status?: number; body: string };

function response(): TestResponse {
  const state = { status: undefined as number | undefined, headersSent: false, body: '' };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end(chunk?: string) {
      if (chunk) state.body += chunk;
      return res;
    },
  }) as unknown as TestResponse;
  return res;
}

async function call(
  method: string,
  url: string,
  opts: { ip?: string; headers?: Record<string, string>; body?: unknown } = {}
) {
  const res = response();
  const handled = await handleCrashReportRoutes(
    request(method, url, opts.ip ?? freshIp(), opts.headers, opts.body),
    res
  );
  return { handled, status: res.status, body: res.body };
}

const ADMIN = { 'x-api-key': 'test-admin-key' };
const NON_ADMIN = { 'x-api-key': 'test-service-key' };

const crash = {
  errorName: 'TypeError',
  errorMessage: 'Cannot read properties of undefined',
  sessionId: 'voice-1700000000000',
  userId: 'uid-crash-reader-test',
  roomName: 'voice-1700000000000',
  connectionState: 'connected',
  turnCount: 2,
  fromQueue: true, // unknown fields are dropped, not refused
};

const diagnostic = {
  timestamp: '2026-10-22T00:00:00.000Z',
  sessionDurationMs: 12_000,
  timeSinceLastActivityMs: 400,
  livekitReason: 'CLIENT_INITIATED',
  wasGraceful: false,
  isOnline: true,
  wasOfflineRecently: false,
  visibilityState: 'visible',
  wasBackgroundedRecently: false,
  isMuted: false,
  turnCount: 3,
  userAgent: 'test-agent',
  platform: 'MacIntel',
  rttMs: null, // NaN arrives as null
  sessionId: 'voice-1700000000001',
  userId: 'uid-diagnostic-reader-test',
};

describe.each([
  ['crash reports', CRASH, crash],
  ['disconnect diagnostics', DIAGNOSTIC, diagnostic],
])('%s', (_name, path, validBody) => {
  it('refuses an unauthenticated read with 401', async () => {
    await call('POST', path, { body: validBody });
    const { handled, status, body } = await call('GET', path);
    expect(handled).toBe(true);
    expect(status).toBe(401);
    expect(body).not.toContain('voice-170000000000');
  });

  it('refuses a signed-in non-admin read with 403', async () => {
    const { status, body } = await call('GET', path, { headers: NON_ADMIN });
    expect(status).toBe(403);
    expect(body).not.toContain('voice-170000000000');
  });

  it('serves an admin read with 200', async () => {
    await call('POST', path, { body: validBody });
    const { status, body } = await call('GET', path, { headers: ADMIN });
    expect(status).toBe(200);
    expect(body).toContain(validBody.sessionId);
  });

  it('accepts a valid unauthenticated post and replies with only an id', async () => {
    const { status, body } = await call('POST', path, { body: validBody });
    expect(status).toBe(200);
    const reply = JSON.parse(body) as Record<string, unknown>;
    expect(reply.received).toBe(true);
    expect(Object.keys(reply).sort()).toEqual(
      path === CRASH ? ['crashId', 'received', 'timestamp'] : ['id', 'received', 'timestamp']
    );
    expect(body).not.toContain(validBody.userId);
  });

  it('refuses an invalid post with 400', async () => {
    const { status } = await call('POST', path, { body: { ...validBody, turnCount: 'many' } });
    expect(status).toBe(400);
  });

  it('refuses a post missing a required field with 400', async () => {
    const { errorName: _a, wasGraceful: _b, ...missing } = validBody as Record<string, unknown>;
    const { status } = await call('POST', path, { body: missing });
    expect(status).toBe(400);
  });

  it('keeps a report whose text runs long, and one sent before sign-in (userId: null)', async () => {
    const { status } = await call('POST', path, {
      body: { ...validBody, userAgent: 'x'.repeat(5000), userId: null },
    });
    expect(status).toBe(200);
  });

  it('refuses a body over the byte cap with 413', async () => {
    const { status } = await call('POST', path, {
      headers: { 'content-length': '65537' }, // a literal: the cap is 64 KB, not whatever the constant says
      body: validBody,
    });
    expect(status).toBe(413);
  });

  it('trips the rate limit after the per-minute allowance', async () => {
    const ip = freshIp();
    const statuses: Array<number | undefined> = [];
    for (let i = 0; i < CRASH_REPORT_POSTS_PER_MINUTE + 1; i++) {
      statuses.push((await call('POST', path, { ip, body: validBody })).status);
    }
    expect(statuses.slice(0, CRASH_REPORT_POSTS_PER_MINUTE).every((s) => s === 200)).toBe(true);
    expect(statuses[CRASH_REPORT_POSTS_PER_MINUTE]).toBe(429);
  });
});

describe('crash report input caps', () => {
  it('reads at most 64 KB', () => expect(CRASH_REPORT_MAX_BODY_BYTES).toBe(65_536));
  it('cuts long text to its cap and reads null as absent', () => {
    const r = crashReportBodySchema.parse({
      errorName: 'E',
      errorMessage: 'x'.repeat(3000),
      userId: null,
    });
    expect(r.errorMessage).toHaveLength(2000);
    expect(r.userId).toBeUndefined();
  });
});

describe('routing', () => {
  it('leaves other paths alone', async () => {
    expect((await call('GET', '/api/other')).handled).toBe(false);
  });

  it('answers other methods with 405', async () => {
    expect((await call('DELETE', CRASH)).status).toBe(405);
  });
});
