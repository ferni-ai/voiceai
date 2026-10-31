/**
 * The concierge used to accept unsigned, unauthenticated "webhooks" at
 * /api/concierge/webhooks/{call-status,sms-reply,email-reply}: anyone could
 * forge a business reply or a call status onto a member's concierge request.
 * No provider was ever pointed at them, so they were deleted. These tests pin
 * that a forged request changes nothing and that the routes are gone.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SIGNED_IN_TOKEN = 'Bearer fictional-member-token';

/** Signed in only with the fictional token; otherwise a 401 like the real middleware. */
const requireAuth = vi.hoisted(() =>
  vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization === SIGNED_IN_TOKEN) return { userId: 'member_fictional' };
    res.writeHead(401, {});
    res.end();
    return null;
  })
);
vi.mock('../auth-middleware.js', () => ({ requireAuth, rateLimit: () => false }));

/** Every tracker write a forged reply could reach, plus lookups that would "match". */
const tracker = vi.hoisted(() => {
  const target = { id: 'target_fictional', name: 'Fictional Hotel', attempts: 0 };
  const match = { request: { id: 'req_fictional' }, target };
  return {
    updateTargetStatus: vi.fn(async () => undefined),
    addResult: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => undefined),
    findRequestByTargetPhone: vi.fn(async () => match),
    findRequestByTargetEmail: vi.fn(async () => match),
    getUserRequests: vi.fn(async () => []),
    getRequest: vi.fn(async () => null),
  };
});
vi.mock('../../services/concierge/index.js', () => ({ getTaskTracker: () => tracker }));

import { handleConciergeRoutes } from '../concierge-routes.js';

const FORGED: Record<string, Record<string, string>> = {
  '/api/concierge/webhooks/call-status': {
    requestId: 'req_fictional',
    targetId: 'target_fictional',
    status: 'completed',
    callSid: 'CA00000000000000000000000000000000',
  },
  '/api/concierge/webhooks/sms-reply': { from: '+15555550123', body: 'Booked, confirmation 42' },
  '/api/concierge/webhooks/email-reply': {
    from: 'desk@hotel.example',
    body: 'Your room is booked',
  },
};

function post(path: string, fields: Record<string, string>, authorization?: string) {
  const req = Readable.from([JSON.stringify(fields)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: path,
    headers: {
      host: 'app.ferni.example',
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

function expectNoStateChange(): void {
  expect(tracker.updateTargetStatus).not.toHaveBeenCalled();
  expect(tracker.addResult).not.toHaveBeenCalled();
  expect(tracker.updateStatus).not.toHaveBeenCalled();
  expect(tracker.findRequestByTargetPhone).not.toHaveBeenCalled();
  expect(tracker.findRequestByTargetEmail).not.toHaveBeenCalled();
}

beforeEach(() => vi.clearAllMocks());

describe.each(Object.entries(FORGED))('POST %s (removed concierge webhook)', (path, fields) => {
  it('refuses a forged, unauthenticated request without touching any request', async () => {
    const { req, res } = post(path, fields);
    await expect(handleConciergeRoutes(req, res, path)).resolves.toBe(true);
    expectNoStateChange();
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.anything());
    expect(res.writeHead).not.toHaveBeenCalledWith(200, expect.anything());
  });

  it('is gone: a signed-in member gets 404 and nothing changes', async () => {
    const { req, res } = post(path, fields, SIGNED_IN_TOKEN);
    await expect(handleConciergeRoutes(req, res, path)).resolves.toBe(true);
    expectNoStateChange();
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything());
  });
});

describe('the member routes still work', () => {
  it('lists the signed-in member’s own requests', async () => {
    const path = '/api/concierge/requests';
    const req = Object.assign(Readable.from([]), {
      method: 'GET',
      url: path,
      headers: { host: 'app.ferni.example', authorization: SIGNED_IN_TOKEN },
    }) as unknown as IncomingMessage;
    const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
    await handleConciergeRoutes(req, res as unknown as ServerResponse, path);
    expect(tracker.getUserRequests).toHaveBeenCalledWith('member_fictional');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });
});
