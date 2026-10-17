/**
 * /token signs a join token only for a new room or one the caller owns.
 *
 * The client names the room (web: `voice-<ms>`). /token used to sign a
 * roomJoin + subscribe token for any name and dispatch into rooms that already
 * existed, so a signed-in user who knew another user's live room could listen
 * to that call. LiveKit is faked; the real route and ownership check run.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRoomWithAgent, createToken, listRooms } = vi.hoisted(() => ({
  createRoomWithAgent: vi.fn(async () => ({ roomReady: true, agentDispatched: true })),
  createToken: vi.fn(async () => 'jwt-token'),
  listRooms: vi.fn(async (_names: string[]): Promise<Array<{ metadata?: string }>> => []),
}));
vi.mock('../../../token/livekit.js', () => ({
  createToken,
  createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
  getRoomService: () => ({ listRooms }),
}));
// The atomic claim has its own test (token-room-claim.test.ts)
vi.mock('../token-room-claim.js', () => ({ claimRoom: async () => 'mine' }));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async () => ({ uid: 'uid-alice', claims: {} })),
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
  return {
    getProfileStore: async () => getDefaultStore(),
    isAgentProfilePersistenceOn: () => false,
  };
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

async function requestToken(
  room: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(`http://localhost/token?room=${room}&username=User&device_id=d1`);
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer alice-id-token' },
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

const roomOf = (owner?: string) => ({
  metadata: JSON.stringify(owner ? { firebase_uid: owner, source: 'web' } : { type: 'sip' }),
});

describe('/token room ownership', () => {
  beforeEach(() => {
    listRooms.mockReset();
    createToken.mockClear();
    createRoomWithAgent.mockClear();
  });

  it('refuses a live room that belongs to another user, signing nothing', async () => {
    listRooms.mockResolvedValue([roomOf('uid-bob')]);
    const { status } = await requestToken('voice-1760000000000');
    expect(status).toBe(403);
    expect(createToken).not.toHaveBeenCalled();
    expect(createRoomWithAgent).not.toHaveBeenCalled();
  });

  it('refuses a live room with no owner (demo, phone or outbound rooms)', async () => {
    listRooms.mockResolvedValue([roomOf()]);
    expect((await requestToken('bogle-call-_+15550001111_ab')).status).toBe(403);
    expect(createToken).not.toHaveBeenCalled();
  });

  it("issues a token for the caller's own new room", async () => {
    listRooms.mockResolvedValue([]);
    const { status, body } = await requestToken('voice-1760000000001');
    expect(status).toBe(200);
    expect(body['token']).toBe('jwt-token');
    expect(listRooms).toHaveBeenCalledWith(['voice-1760000000001']);
    expect(createRoomWithAgent).toHaveBeenCalledTimes(1);
  });

  it('lets the owner back into their own live room', async () => {
    listRooms.mockResolvedValue([roomOf('uid-alice')]);
    expect((await requestToken('voice-1760000000002')).status).toBe(200);
  });

  it('fails closed when room ownership cannot be checked', async () => {
    listRooms.mockRejectedValue(new Error('livekit unreachable'));
    expect((await requestToken('voice-1760000000003')).status).toBe(503);
    expect(createToken).not.toHaveBeenCalled();
  });
});
