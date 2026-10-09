/**
 * The feedback routes name the user in the URL path or the body, which central
 * identity binding cannot see. They used to answer anyone: an unauthenticated
 * GET /api/feedback/user/:id returned that user's last chat messages, and
 * POST /api/feedback let anyone overwrite another user's reaction.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock('../auth-middleware.js', () => ({ requireAuth }));

const store = vi.hoisted(() => ({
  calculateUserFeedbackStats: vi.fn(async (userId: string) => ({ userId, totalPrompts: 1 })),
  getPersonaFeedback: vi.fn(async () => []),
  getRecentFeedback: vi.fn(async (userId: string) => [{ userId, context: { lastUserMessage: 'secret' } }]),
  getSessionFeedback: vi.fn(async () => []),
  recordFeedbackReaction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../services/feedback/conversation-feedback-store.js', () => store);
vi.mock('../../services/feedback/feedback-insights.js', () => ({
  generateFeedbackInsights: vi.fn(async (userId: string) => ({ userId })),
}));

import { handleFeedbackRoutes } from '../feedback-routes.js';

async function call(method: string, path: string, body?: unknown) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []) as unknown as IncomingMessage;
  Object.assign(req, { method, url: path, headers: { host: 'x', 'content-type': 'application/json' } });
  const res = {
    statusCode: 200,
    body: '',
    headersSent: false,
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    getHeader() {},
    end(data?: string) {
      this.body = data ?? '';
      this.headersSent = true;
    },
  };
  await handleFeedbackRoutes(req, res as unknown as ServerResponse);
  return { status: res.statusCode, body: res.body };
}

const signedOut = () =>
  requireAuth.mockImplementation(async (_req, res: ServerResponse) => {
    res.writeHead(401);
    res.end('{"error":"Authentication required"}');
    return null;
  });
const signedInAs = (userId: string, isAdmin = false) => requireAuth.mockResolvedValue({ userId, isAdmin });

beforeEach(() => vi.clearAllMocks());

describe.each(['user', 'insights', 'stats'])('GET /api/feedback/%s/:userId', (kind) => {
  it('refuses a caller with no credentials, reading nothing', async () => {
    signedOut();
    const r = await call('GET', `/api/feedback/${kind}/victim`);
    expect(r.status).toBe(401);
    expect(r.body).not.toContain('secret');
    expect(store.getRecentFeedback).not.toHaveBeenCalled();
    expect(store.calculateUserFeedbackStats).not.toHaveBeenCalled();
  });

  it("refuses someone else's id with 403", async () => {
    signedInAs('me');
    const r = await call('GET', `/api/feedback/${kind}/victim`);
    expect(r.status).toBe(403);
    expect(r.body).not.toContain('secret');
  });

  it('serves your own', async () => {
    signedInAs('me');
    const r = await call('GET', `/api/feedback/${kind}/me`);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
  });
});

describe('POST /api/feedback', () => {
  it("refuses to record a reaction for someone else's feedback", async () => {
    signedInAs('me');
    const r = await call('POST', '/api/feedback', { feedbackId: 'f1', userId: 'victim', reaction: 'loved' });
    expect(r.status).toBe(403);
    expect(store.recordFeedbackReaction).not.toHaveBeenCalled();
  });

  it('records your own, for the verified caller', async () => {
    signedInAs('me');
    const r = await call('POST', '/api/feedback', { feedbackId: 'f1', userId: 'me', reaction: 'loved' });
    expect(r.status).toBe(200);
    expect(store.recordFeedbackReaction).toHaveBeenCalledWith({ feedbackId: 'f1', userId: 'me', reaction: 'loved' });
  });
});
