/**
 * POST /api/outbound-call/initiate was mounted on the prod web server with no
 * auth: any body with user.phone and user.name rang that number through Twilio
 * with a message of the caller's choosing. GET /active listed who was being
 * called. Both are now admin-only through the real requireAdmin; health stays
 * open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

vi.hoisted(() => {
  process.env.ADMIN_API_KEYS = 'test-admin-key';
});

const calls = vi.hoisted(() => ({
  makeConversationalCall: vi.fn(async () => ({ id: 'call-1', status: 'initiated' })),
  getActiveCalls: vi.fn(async () => []),
}));

vi.mock('../../services/outreach/conversational-calls.js', () => ({
  makeConversationalCall: calls.makeConversationalCall,
  isConversationalCallsConfigured: () => true,
  getConversationalCallService: () => ({ getActiveCalls: calls.getActiveCalls }),
}));

import { handleOutboundCallRoutes } from '../outbound-call-handler.js';

function request(method: string, url: string, headers: Record<string, string>, body?: unknown) {
  const req = new EventEmitter() as IncomingMessage & { [Symbol.asyncIterator]?: unknown };
  req.method = method;
  req.url = url;
  req.headers = { host: 'app.ferni.ai', 'content-type': 'application/json', ...headers };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: '203.0.113.9',
  };
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

function response(): ServerResponse & { status?: number } {
  const state: { status?: number; headersSent: boolean } = { headersSent: false };
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

const body = { user: { id: 'u-1', name: 'Test Person', phone: '+15555550123' }, message: 'hi' };

async function call(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  sent: unknown = body
) {
  const res = response();
  const handled = await handleOutboundCallRoutes(
    request(method, path, headers, method === 'POST' ? sent : undefined),
    res,
    path
  );
  return { handled, status: res.status };
}

beforeEach(() => vi.clearAllMocks());

describe('outbound-call routes are admin-only', () => {
  it('refuses an anonymous initiate and dials nothing', async () => {
    const { handled, status } = await call('POST', '/api/outbound-call/initiate');
    expect(handled).toBe(true);
    expect(status).toBe(401);
    expect(calls.makeConversationalCall).not.toHaveBeenCalled();
  });

  it('refuses a wrong key', async () => {
    const { status } = await call('POST', '/api/outbound-call/initiate', { 'x-api-key': 'nope' });
    expect([401, 403]).toContain(status);
    expect(calls.makeConversationalCall).not.toHaveBeenCalled();
  });

  it('refuses an anonymous list of active calls', async () => {
    const { status } = await call('GET', '/api/outbound-call/active');
    expect(status).toBe(401);
    expect(calls.getActiveCalls).not.toHaveBeenCalled();
  });

  it('lets an admin key place the call', async () => {
    const { status } = await call('POST', '/api/outbound-call/initiate', {
      'x-api-key': 'test-admin-key',
    });
    expect(status).toBe(200);
    expect(calls.makeConversationalCall).toHaveBeenCalledTimes(1);
  });

  it('keeps health open', async () => {
    const { status } = await call('GET', '/api/outbound-call/health');
    expect(status).toBe(200);
  });
});

describe('an admin-initiated call is placed for a named user, with provenance', () => {
  const admin = { 'x-api-key': 'test-admin-key' };
  it('the named user is the owner (the owner rule applies to them) and the admin is recorded', async () => {
    await call('POST', '/api/outbound-call/initiate', admin, { ...body, userId: 'owner-9' });
    expect(calls.makeConversationalCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-9',
        reason: expect.stringMatching(/^admin-initiated by .+: outbound_call$/),
      })
    );
  });

  it('with no userId, the callee in user.id is the owner (the rich proactive shape)', async () => {
    await call('POST', '/api/outbound-call/initiate', admin);
    expect(calls.makeConversationalCall).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('with no user named, nothing is placed', async () => {
    const { user: _u, ...noOwner } = body;
    const { status } = await call('POST', '/api/outbound-call/initiate', admin, {
      ...noOwner,
      user: { name: 'Test Person', phone: '+15555550123' },
    });
    expect(status).toBe(400);
    expect(calls.makeConversationalCall).not.toHaveBeenCalled();
  });

  it("a refusal (the named user's consent rule) is reported, not claimed as placed", async () => {
    calls.makeConversationalCall.mockResolvedValueOnce({
      success: false,
      error: 'Not calling: needs-consent',
    } as never);
    const { status } = await call('POST', '/api/outbound-call/initiate', admin);
    expect(status).toBe(409);
  });
});
