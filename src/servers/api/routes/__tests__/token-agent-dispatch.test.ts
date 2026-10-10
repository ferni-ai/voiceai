/**
 * /token must tell the client whether the voice agent was dispatched, instead of
 * returning a plain 200 that leaves the caller waiting on silence.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRoomWithAgent = vi.fn();
vi.mock('../../../token/livekit.js', () => ({
  createToken: vi.fn(async () => 'jwt-token'),
  createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
}));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async () => ({ uid: 'uid-123', claims: {} })),
  isVerifiedToken: () => true,
}));
vi.mock('../../../../services/identity/geo-detection.js', () => ({
  detectGeoFromRequest: vi.fn(async () => ({
    primaryLanguage: 'en-US',
    languages: ['en-US'],
    accent: 'american',
    source: 'test',
  })),
}));
vi.mock('../../../../memory/index.js', () => ({
  getDefaultStore: () => ({ getProfile: async () => null }),
}));
// The migrated callers reach the store through getProfileStore (flag off: the default store).
vi.mock('../../../../memory/profile-store.js', async () => {
  const { getDefaultStore } = await import('../../../../memory/index.js');
  return { getProfileStore: async () => getDefaultStore(), isAgentProfilePersistenceOn: () => false };
});
vi.mock('../../../../services/llm-dynamic-content.js', () => ({
  prewarmContent: vi.fn(async () => undefined),
}));
vi.mock('../user-data-prefetch.js', () => ({ prefetchUserData: vi.fn() }));
vi.mock('../../../../marketplace/registry.js', () => ({ getAgentAsync: vi.fn(async () => null) }));
vi.mock('../../services/demo-sessions.js', () => ({ shutdown: vi.fn() }));
vi.mock('../../../token/demo-rate-limit.js', () => ({
  DEMO_CONFIG: { sessionDurationMinutes: 5 },
  checkDemoAllowed: vi.fn(),
  recordDemoSession: vi.fn(),
  startRateLimitCleanup: vi.fn(),
  stopRateLimitCleanup: vi.fn(),
}));

const { handleTokenRoutes } = await import('../token.js');

async function requestToken(): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL('http://localhost/token?room=voice-1&username=Sam&device_id=d1');
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer firebase-id-token' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  let status = 0;
  let raw = '';
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: (chunk: string) => {
      raw = chunk;
    },
  } as unknown as ServerResponse;

  await handleTokenRoutes(req, res, '/token', url);
  return { status, body: JSON.parse(raw) as Record<string, unknown> };
}

describe('/token agent dispatch reporting', () => {
  beforeEach(() => createRoomWithAgent.mockReset());

  it('returns agent_dispatched=false when the agent could not be dispatched', async () => {
    createRoomWithAgent.mockResolvedValue({ roomReady: true, agentDispatched: false });

    const { status, body } = await requestToken();

    expect(status).toBe(200);
    expect(body['token']).toBe('jwt-token');
    expect(body['agent_dispatched']).toBe(false);
  });

  it('returns agent_dispatched=true when the agent was dispatched', async () => {
    createRoomWithAgent.mockResolvedValue({ roomReady: true, agentDispatched: true });

    const { body } = await requestToken();

    expect(body['agent_dispatched']).toBe(true);
  });
});
