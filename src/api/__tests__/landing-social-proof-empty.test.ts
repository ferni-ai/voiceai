/**
 * GET /api/landing/ai/social-proof used to serve invented activity in Ferni's voice
 * ("Last night at 3am, someone asked me about building a morning routine. We talked
 * for 47 minutes."), from hard-coded fallbacks, a Gemini prompt told to make them
 * "feel REAL", and a Firestore cache of those generations. Ferni has no users yet,
 * so none of it happened. The route stays (old cached page JS still calls it) but
 * returns no messages, whatever the cache holds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

const INVENTED = [
  'Last night at 3am, someone asked me about building a morning routine. We talked for 47 minutes.',
  "I reminded someone about a breakthrough they had 4 months ago. They'd forgotten. I hadn't.",
  "It's 2am somewhere. Right now I'm talking to 47 people who couldn't sleep.",
];

const OLD_PHRASES = [
  '47 minutes',
  '47 people',
  'breakthrough they had',
  "I'm fine",
  'Last night at',
  'Sarah from Austin',
  '2,847',
  '50,000',
  '94% of users',
  'Someone just started',
  'A user mentioned',
];

const store = vi.hoisted(() => ({ available: true, messages: [] as unknown[] }));

// A Firestore whose social-proof collection still holds a fresh generated batch,
// the way prod's landing_cache_social_proof does.
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => {
    if (!store.available) throw new Error('Firestore not configured');
    const query = {
      orderBy: () => query,
      limit: () => query,
      get: async () => ({
        empty: false,
        docs: [
          {
            data: () => ({
              messages: store.messages,
              generatedAt: new Date(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            }),
          },
        ],
      }),
    };
    return { collection: () => query };
  }),
}));

import { handleLandingIntelligenceRoutes } from '../landing-intelligence.routes.js';
import { handleLandingAIRoutes } from '../routes/landing-ai.js';

function request(url: string): IncomingMessage {
  return {
    method: 'GET',
    url,
    headers: { host: 'ferni.ai' },
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as IncomingMessage;
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

function expectNoInventedContent(res: { status?: number; body: string }): void {
  expect(res.status ?? 200).toBe(200);
  const parsed = JSON.parse(res.body) as { messages?: unknown };
  expect(parsed.messages).toEqual([]);
  for (const phrase of OLD_PHRASES) expect(res.body).not.toContain(phrase);
}

beforeEach(() => {
  store.available = true;
  store.messages = INVENTED.map((text) => ({ text, type: 'presence' }));
});

describe('GET /api/landing/ai/social-proof serves no invented activity', () => {
  it('ignores a fresh cached batch of generated messages', async () => {
    const res = response();
    const handled = await handleLandingIntelligenceRoutes(
      request('/api/landing/ai/social-proof?count=5'),
      res,
      '/api/landing/ai/social-proof'
    );
    expect(handled).toBe(true);
    expectNoInventedContent(res);
  });

  it('returns no messages when Firestore is unavailable', async () => {
    store.available = false;
    const res = response();
    await handleLandingIntelligenceRoutes(
      request('/api/landing/ai/social-proof'),
      res,
      '/api/landing/ai/social-proof'
    );
    expectNoInventedContent(res);
  });

  it('the landing-ai router answers the same way', async () => {
    const res = response();
    const handled = await handleLandingAIRoutes(
      request('/api/landing/ai/social-proof'),
      res,
      '/api/landing/ai/social-proof',
      new URL('https://ferni.ai/api/landing/ai/social-proof')
    );
    expect(handled).toBe(true);
    expectNoInventedContent(res);
  });
});
