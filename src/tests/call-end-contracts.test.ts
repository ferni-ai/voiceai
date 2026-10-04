/**
 * Call-end contracts between the web app and the UI server.
 *
 * Feeds the web app's REAL request bodies (apps/web/src/services/call-payloads.ts)
 * into the REAL server handlers, so a field rename on either side fails here:
 * - POST /usage/conversation: the web used to send `minutesTalked` while the
 *   server reads `durationMinutes`, so every call was billed as 0 minutes.
 * - POST /api/conversations: the web posted session summaries to a route that
 *   only had a GET handler, so conversation history was never written.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConversationHistoryBody,
  buildConversationUsageBody,
} from '../../apps/web/src/services/call-payloads.js';

vi.mock('../services/stripe-subscription.js', () => ({
  isStripeConfigured: vi.fn(() => true),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  recordConversation: vi.fn(async () => ({ conversationsUsed: 1 })),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));

const recordSession = vi.fn(async () => 'session-abc');
vi.mock('../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({ recordSession }),
}));

const optionalAuthAsync = vi.fn();
vi.mock('../api/auth-middleware.js', () => ({ optionalAuthAsync }));

const { handleSubscriptionRequest } = await import('../api/subscription-routes.js');
const { recordConversation } = await import('../services/stripe-subscription.js');
const { handleConversationsRoutes } = await import('../api/routes/conversations.js');

function jsonRequest(body: unknown): IncomingMessage {
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json' };
  return req;
}

function captureResponse(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let status = 0;
  let raw = '';
  const res = {
    writeHead: (code: number) => {
      status = code;
      return res;
    },
    setHeader: () => res,
    end: (chunk?: string) => {
      raw = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, status: () => status, body: () => (raw ? JSON.parse(raw) : null) };
}

describe('POST /usage/conversation contract', () => {
  it('records the real call length the web app sends', async () => {
    const start = Date.parse('2026-10-03T10:00:00Z');
    const body = buildConversationUsageBody('device-1', start, start + 12 * 60_000);

    const response = await handleSubscriptionRequest({
      method: 'POST',
      pathname: '/usage/conversation',
      query: {},
      headers: {},
      body,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(recordConversation)).toHaveBeenCalledWith('device-1', 12);
  });

  it('sends nothing for a call that never started', () => {
    expect(buildConversationUsageBody('device-1', null)).toBeNull();
  });
});

describe('POST /api/conversations contract', () => {
  beforeEach(() => {
    recordSession.mockClear();
    optionalAuthAsync.mockReset();
  });

  const tracked = {
    id: 'session_1',
    startTime: '2026-10-03T10:00:00.000Z',
    endTime: '2026-10-03T10:07:00.000Z',
    personaId: 'maya-santos',
    personaName: 'Maya',
    messages: [{}, {}, {}],
    insights: ['sleeps better after walks'],
    topicsDiscussed: ['sleep'],
  };

  it('stores the session summary the web tracker sends for the signed-in user', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'uid-42', isAdmin: false, isDevMode: false });
    const { res, status, body } = captureResponse();

    const handled = await handleConversationsRoutes(
      jsonRequest(buildConversationHistoryBody(tracked, 7)),
      res,
      '/api/conversations',
      new URL('http://localhost/api/conversations')
    );

    expect(handled).toBe(true);
    expect(status()).toBe(201);
    expect(body()).toEqual({ id: 'session-abc' });
    expect(recordSession).toHaveBeenCalledWith('uid-42', {
      personaId: 'maya-santos',
      personaName: 'Maya',
      duration: 7,
      messageCount: 3,
      insights: ['sleeps better after walks'],
      topicsDiscussed: ['sleep'],
      highlights: [],
    });
  });

  it('rejects writes without verified auth, even with a userId query param', async () => {
    optionalAuthAsync.mockResolvedValue(null);
    const { res, status } = captureResponse();

    await handleConversationsRoutes(
      jsonRequest(buildConversationHistoryBody(tracked, 7)),
      res,
      '/api/conversations',
      new URL('http://localhost/api/conversations?userId=someone-else')
    );

    expect(status()).toBe(401);
    expect(recordSession).not.toHaveBeenCalled();
  });

  it('rejects a body that is not a session summary', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'uid-42', isAdmin: false, isDevMode: false });
    const { res, status } = captureResponse();

    await handleConversationsRoutes(
      jsonRequest({ session: { personaId: 'ferni' } }),
      res,
      '/api/conversations',
      new URL('http://localhost/api/conversations')
    );

    expect(status()).toBe(400);
    expect(recordSession).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of claiming it saved', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'uid-42', isAdmin: false, isDevMode: false });
    recordSession.mockRejectedValueOnce(new Error('firestore down'));
    const { res, status } = captureResponse();

    await handleConversationsRoutes(
      jsonRequest(buildConversationHistoryBody(tracked, 7)),
      res,
      '/api/conversations',
      new URL('http://localhost/api/conversations')
    );

    expect(status()).toBe(500);
  });
});
