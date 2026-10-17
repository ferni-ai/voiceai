/**
 * /demo-token?persona_id=john-bogle (or joel-dickson) used to skip the demo
 * limit, so anyone could get unlimited demos by adding a query parameter.
 * Every demo now counts, whatever persona the caller asks for.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reserveDemoSession, releaseDemoSession, createDemoSession, createRoomWithAgent } =
  vi.hoisted(() => ({
    reserveDemoSession: vi.fn(),
    releaseDemoSession: vi.fn(async () => undefined),
    createDemoSession: vi.fn(async () => ({ claimToken: 'ct', roomName: 'r', expiresAt: 1 })),
    createRoomWithAgent: vi.fn(async () => ({ roomReady: true, agentDispatched: true })),
  }));
vi.mock('../../../token/demo-rate-limit-shared.js', () => ({
  reserveDemoSession,
  releaseDemoSession,
  peekDemoAllowance: vi.fn(),
}));
vi.mock('../../../token/demo-rate-limit.js', () => ({
  DEMO_CONFIG: { maxSessionsPerDay: 3, sessionDurationMinutes: 3, cooldownMinutes: 5 },
  startRateLimitCleanup: vi.fn(),
  stopRateLimitCleanup: vi.fn(),
}));
vi.mock('../../services/demo-sessions.js', () => ({ createDemoSession, shutdown: vi.fn() }));
vi.mock('../../../token/livekit.js', () => ({
  createToken: vi.fn(async () => 'jwt-token'),
  createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
}));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../services/identity/geo-detection.js', () => ({
  detectGeoFromRequest: vi.fn(async () => ({ primaryLanguage: 'en-US', accent: 'american' })),
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: vi.fn(),
  isAgentProfilePersistenceOn: () => false,
}));
vi.mock('../../../../services/llm-dynamic-content.js', () => ({
  prewarmContent: vi.fn(async () => undefined),
}));
vi.mock('../user-data-prefetch.js', () => ({ prefetchUserData: vi.fn() }));
vi.mock('../../../../marketplace/registry.js', () => ({ getAgentAsync: vi.fn(async () => null) }));

const { handleTokenRoutes } = await import('../token.js');

async function demoToken(
  query: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = {
    method: 'GET',
    headers: {},
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as IncomingMessage;
  const reply: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    headersSent: false,
    writeHead: (code: number) => {
      reply.status = code;
    },
    end: (text?: string) => {
      if (text) reply.body = JSON.parse(text) as Record<string, unknown>;
    },
  } as unknown as ServerResponse;
  const url = new URL(`http://localhost/demo-token${query}`);
  await handleTokenRoutes(req, res, '/demo-token', url);
  return reply;
}

describe('/demo-token limit ignores persona_id', () => {
  beforeEach(() => {
    reserveDemoSession.mockReset();
    releaseDemoSession.mockClear();
    createDemoSession.mockClear();
    createRoomWithAgent.mockClear();
  });

  it.each(['john-bogle', 'joel-dickson', 'ferni'])(
    'answers 429 for persona_id=%s once the limit is used up',
    async (persona) => {
      reserveDemoSession.mockResolvedValue({
        allowed: false,
        reason: 'daily_limit',
        message: 'used up',
      });
      const reply = await demoToken(`?persona_id=${persona}`);
      expect(reply.status).toBe(429);
      expect(reserveDemoSession).toHaveBeenCalledTimes(1);
      expect(createDemoSession).not.toHaveBeenCalled();
      expect(createRoomWithAgent).not.toHaveBeenCalled();
    }
  );

  it('counts a branded persona demo and reports the real sessions left', async () => {
    reserveDemoSession.mockResolvedValue({ allowed: true, sessionsRemaining: 2 });
    const reply = await demoToken('?persona_id=john-bogle');
    expect(reply.status).toBe(200);
    expect(reserveDemoSession).toHaveBeenCalledTimes(1);
    expect(reply.body['sessions_remaining']).toBe(2);
  });

  it('keeps the demo when the request succeeds', async () => {
    reserveDemoSession.mockResolvedValue({ allowed: true, sessionsRemaining: 2 });
    expect((await demoToken('')).status).toBe(200);
    expect(releaseDemoSession).not.toHaveBeenCalled();
  });

  it('gives the demo back when the session cannot be created', async () => {
    reserveDemoSession.mockResolvedValue({ allowed: true, sessionsRemaining: 2 });
    createDemoSession.mockRejectedValueOnce(new Error('firestore down'));
    expect((await demoToken('')).status).toBe(500);
    expect(releaseDemoSession).toHaveBeenCalledWith('203.0.113.7');
  });

  it('gives the demo back when the room cannot be created', async () => {
    reserveDemoSession.mockResolvedValue({ allowed: true, sessionsRemaining: 2 });
    createRoomWithAgent.mockRejectedValueOnce(new Error('livekit down'));
    expect((await demoToken('')).status).toBe(500);
    expect(releaseDemoSession).toHaveBeenCalledWith('203.0.113.7');
  });
});
