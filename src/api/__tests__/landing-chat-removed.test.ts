/**
 * The marketing page used to carry a text chat widget that posted to
 * POST /api/landing/ai/chat. That route answered anonymous visitors through the
 * model with no sign-in and none of the crisis handling every real conversation
 * gets. Ferni is a voice companion, so the chat was removed rather than guarded
 * (#3683). Two handlers served the path; both are gone, and the request now falls
 * through to the landing-ai router's 404. The other landing routes still answer.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { describe, expect, it } from 'vitest';

import { handleLandingIntelligenceRoutes } from '../landing-intelligence.routes.js';
import { handleLandingAIRoutes } from '../routes/landing-ai.js';

function post(path: string, body: unknown): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: path,
    headers: { host: 'ferni.ai', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.9' },
  }) as unknown as IncomingMessage;
}

function response(): ServerResponse & { status?: number; body: string } {
  const state = { status: undefined as number | undefined, body: '', headersSent: false };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end(chunk?: string) {
      state.body += chunk ?? '';
      return res;
    },
  });
  return res as unknown as ServerResponse & { status?: number; body: string };
}

/** The order src/servers/api/index.ts tries them: landing intelligence, then landing AI. */
async function dispatch(path: string, body: unknown) {
  const res = response();
  const byIntelligence = await handleLandingIntelligenceRoutes(post(path, body), res, path);
  if (byIntelligence) return { res, answeredBy: 'landing-intelligence' as const };
  const byLandingAI = await handleLandingAIRoutes(
    post(path, body),
    res,
    path,
    new URL(`https://ferni.ai${path}`)
  );
  return { res, answeredBy: byLandingAI ? ('landing-ai' as const) : ('nobody' as const) };
}

describe('POST /api/landing/ai/chat is gone', () => {
  it('the landing intelligence handler no longer answers it', async () => {
    const res = response();
    const handled = await handleLandingIntelligenceRoutes(
      post('/api/landing/ai/chat', { visitorId: 'fv_test', message: 'hello' }),
      res,
      '/api/landing/ai/chat'
    );
    expect(handled).toBe(false);
    expect(res.status).toBeUndefined();
  });

  it('falls through to a 404 with no reply text', async () => {
    const { res, answeredBy } = await dispatch('/api/landing/ai/chat', {
      visitorId: 'fv_test',
      message: 'i feel awful tonight',
      persona: 'ferni',
    });
    expect(answeredBy).toBe('landing-ai');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('"response"');
  });

  it('a neighbouring landing route still answers', async () => {
    const { res, answeredBy } = await dispatch('/api/landing/ai/faq', {
      question: 'how much does it cost?',
    });
    expect(answeredBy).toBe('landing-intelligence');
    expect(res.status ?? 200).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('answer');
  });

  it('the landing-ai router still serves its own routes', async () => {
    const res = response();
    const handled = await handleLandingAIRoutes(
      post('/api/landing/ai/hover-preview', { elementType: 'pricing' }),
      res,
      '/api/landing/ai/hover-preview',
      new URL('https://ferni.ai/api/landing/ai/hover-preview')
    );
    expect(handled).toBe(true);
    expect(res.status ?? 200).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('preview');
  });
});
