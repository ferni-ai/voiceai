/**
 * /token builds the agent's identity from the verified Firebase token, never
 * from the query string. `user_email` used to be copied from the query into the
 * dispatch, and the LiveKit participant identity was the client's `username`
 * (often "User", shared by everyone). The email now comes from the verified
 * token (only when Firebase verified it), and the identity is the verified uid,
 * with the username kept as the display name.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRoomWithAgent = vi.fn(async () => ({ roomReady: true, agentDispatched: true }));
const createToken = vi.fn(async () => 'jwt-token');
vi.mock('../../../token/livekit.js', () => ({
  createToken,
  createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
  getRoomService: () => ({ listRooms: async () => [] }),
}));
// The atomic claim has its own test (token-room-claim.test.ts)
vi.mock('../token-room-claim.js', () => ({ claimRoom: async () => 'mine' }));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
const verifyFirebaseToken = vi.fn();
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken,
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

async function requestToken(query: string): Promise<number> {
  const url = new URL(`http://localhost/token?room=voice-1&${query}`);
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer firebase-id-token' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  let status = 0;
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: () => undefined,
  } as unknown as ServerResponse;
  await handleTokenRoutes(req, res, '/token', url);
  return status;
}

const dispatched = (): Record<string, unknown> =>
  (createRoomWithAgent.mock.calls.at(-1) as unknown as [string, Record<string, unknown>])[1];

describe('/token identity comes from the verified token', () => {
  beforeEach(() => {
    createRoomWithAgent.mockClear();
    createToken.mockClear();
    verifyFirebaseToken.mockResolvedValue({
      uid: 'uid-123',
      email: 'sam@example.com',
      emailVerified: true,
      claims: {},
    });
  });

  it("dispatches the token's verified email, never one from the query string", async () => {
    expect(await requestToken('username=Sam&user_email=victim%40example.com')).toBe(200);
    expect(dispatched().user_email).toBe('sam@example.com');
  });

  it('dispatches no email when Firebase has not verified it', async () => {
    verifyFirebaseToken.mockResolvedValue({
      uid: 'uid-123',
      email: 'unverified@example.com',
      emailVerified: false,
      claims: {},
    });
    await requestToken('username=Sam&user_email=victim%40example.com');
    expect(dispatched().user_email).toBeUndefined();
  });

  it('marks a signed-in Firebase account as one (firebase_account), for verified-caller.ts', async () => {
    verifyFirebaseToken.mockResolvedValue({
      uid: 'uid-123',
      emailVerified: false,
      signInProvider: 'google.com',
      isAnonymous: false,
      claims: {},
    });
    await requestToken('username=Sam');
    expect(dispatched().firebase_account).toBe(true);
  });

  it.each([
    ['an anonymous Firebase user', { signInProvider: 'anonymous', isAnonymous: true }],
    ['a token with no sign-in provider', {}],
  ])('never marks %s', async (_name, provider) => {
    verifyFirebaseToken.mockResolvedValue({
      uid: 'uid-123',
      emailVerified: false,
      claims: {},
      ...provider,
    });
    await requestToken('username=Sam');
    expect(dispatched().firebase_account).toBeUndefined();
  });

  it('makes the participant identity the verified uid, keeping the username as the display name', async () => {
    await requestToken('username=phone_spoof');
    expect(createToken).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'uid-123', participantName: 'phone_spoof' })
    );
  });
});
