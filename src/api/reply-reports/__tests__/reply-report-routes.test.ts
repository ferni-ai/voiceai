/**
 * POST /api/reports without a database: who may call it and what it accepts.
 * The transcript lookup, the daily limit and the stored record are proven
 * against Firestore in src/api/__tests__/menu-report-reply.emulator.test.ts.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { replyReportBodySchema, toEpochMs } from '../reply-report-input.js';
import { hintOverlap } from '../reply-report-lookup.js';
import { handleReplyReportRoutes, type ReplyReportDeps } from '../reply-report-routes.js';

function call(
  method: string,
  path: string,
  body: unknown,
  deps: Partial<ReplyReportDeps> = {}
): Promise<{ handled: boolean; status: number }> {
  const req = Object.assign(new EventEmitter(), {
    url: path,
    method,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.9' },
    pause: () => {},
    resume: () => {},
  });
  let status = 0;
  const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: () => {} };
  const getDb = vi.fn(() => null);
  const done = handleReplyReportRoutes(req as never, res as never, path, {
    authenticate: async () => ({ userId: 'uid-a' }),
    getDb,
    now: () => 0,
    ...deps,
  });
  void Promise.resolve().then(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return done.then((handled) => ({ handled, status }));
}

const valid = { sessionId: 'voice-1', messageAt: 1_760_000_000_000, reason: 'wrong' };

describe('POST /api/reports', () => {
  it('leaves other paths to other routes', async () => {
    expect((await call('POST', '/api/reportsx', valid)).handled).toBe(false);
  });

  it('only takes POST', async () => {
    expect((await call('GET', '/api/reports', valid)).status).toBe(405);
  });

  it('answers 401 when the caller is not verified (the real requireAuth, no token)', async () => {
    const { requireAuth } = await import('../../auth-middleware.js');
    const { status } = await call('POST', '/api/reports', valid, {
      authenticate: (req, res) => requireAuth(req, res),
    });
    expect(status).toBe(401);
  });

  it('a valid report reaches storage (503 here, with no database)', async () => {
    expect((await call('POST', '/api/reports', valid)).status).toBe(503);
  });

  it('refuses a body that names no reply before touching storage', async () => {
    const getDb = vi.fn(() => null);
    const { status } = await call(
      'POST',
      '/api/reports',
      { sessionId: 's', reason: 'wrong' },
      { getDb }
    );
    expect(status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe('what a report may say', () => {
  it('takes the four reasons and nothing else', () => {
    for (const reason of ['harmful', 'wrong', 'inappropriate', 'other']) {
      expect(replyReportBodySchema.safeParse({ ...valid, reason }).success).toBe(true);
    }
    expect(replyReportBodySchema.safeParse({ ...valid, reason: 'spam' }).success).toBe(false);
  });

  it('takes a note up to 500 characters', () => {
    expect(replyReportBodySchema.safeParse({ ...valid, note: 'x'.repeat(500) }).success).toBe(true);
    expect(replyReportBodySchema.safeParse({ ...valid, note: 'x'.repeat(501) }).success).toBe(
      false
    );
  });

  it('needs a turn id or a time to find the reply', () => {
    const { messageAt: _omit, ...noTime } = valid;
    expect(replyReportBodySchema.safeParse(noTime).success).toBe(false);
    expect(replyReportBodySchema.safeParse({ ...noTime, turnId: 't1' }).success).toBe(true);
  });

  it('reads a time as epoch ms or ISO, and nothing else', () => {
    expect(toEpochMs(1_760_000_000_000)).toBe(1_760_000_000_000);
    expect(toEpochMs('2026-10-18T15:00:00.000Z')).toBe(Date.UTC(2026, 9, 18, 15));
    expect(toEpochMs('yesterday')).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
  });
});

describe('matching on-screen words to a stored reply', () => {
  it('counts whole words, ignoring case and punctuation', () => {
    expect(
      hintOverlap('Double whatever, sleeping PILLS', 'You could double whatever sleeping pills.')
    ).toBe(1);
    expect(hintOverlap('informal', 'That was formal.')).toBe(0);
    expect(hintOverlap('', 'anything')).toBe(0);
  });
});
