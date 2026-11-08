/**
 * A token's persona_id may name a custom agent only if the caller owns it;
 * otherwise the room is dispatched with Ferni. With DEMO_TOKEN_CORE_PERSONAS_ONLY
 * on, /demo-token also keeps only built-in personas.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_CANONICAL_IDS } from '../../../../personas/persona-ids.js';

const createRoomWithAgent = vi.fn();
vi.mock('../../../token/livekit.js', () => ({
  createToken: vi.fn(async () => 'jwt-token'),
  createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
  getRoomService: () => ({ listRooms: async () => [] }),
}));
// The atomic claim has its own test (token-room-claim.test.ts)
vi.mock('../token-room-claim.js', () => ({ claimRoom: async () => 'mine' }));
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
vi.mock('../../services/demo-sessions.js', () => ({
  shutdown: vi.fn(),
  createDemoSession: vi.fn(async () => ({ claimToken: 'c', expiresAt: 0 })),
}));
vi.mock('../../../token/demo-rate-limit-shared.js', () => ({
  peekDemoAllowance: vi.fn(),
  reserveDemoSession: vi.fn(async () => ({ allowed: true, sessionsRemaining: 1 })),
  releaseDemoSession: vi.fn(),
}));
// uid-123 owns agent_1_mine; agent_2_theirs belongs to someone else.
const getCustomAgent = vi.fn(async (uid: string, agentId: string) =>
  uid === 'uid-123' && agentId === 'agent_1_mine' ? { id: agentId, userId: uid } : null
);
vi.mock('../../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent,
}));
vi.mock('../../../token/demo-rate-limit.js', () => ({
  DEMO_CONFIG: { sessionDurationMinutes: 5 },
  checkDemoAllowed: vi.fn(),
  recordDemoSession: vi.fn(),
  startRateLimitCleanup: vi.fn(),
  stopRateLimitCleanup: vi.fn(),
}));

const { handleTokenRoutes } = await import('../token.js');

const PROTOTYPE_KEYS = [
  '__proto__',
  '__PROTO__',
  'constructor',
  'toString',
  'hasOwnProperty',
  'valueOf',
];

async function request(path: '/token' | '/demo-token', personaId?: string): Promise<number> {
  const url = new URL(`http://localhost${path}?room=voice-1&username=Sam&device_id=d1`);
  if (personaId !== undefined) url.searchParams.set('persona_id', personaId);
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer firebase-id-token' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  let status = 0;
  const res = {
    writeHead: (code: number) => (status = code),
    end: () => undefined,
  } as unknown as ServerResponse;
  await handleTokenRoutes(req, res, path, url);
  return status;
}

function dispatchedPersona(): unknown {
  return (createRoomWithAgent.mock.calls.at(-1)?.[1] as { persona_id?: unknown })?.persona_id;
}

describe('persona_id that names a custom agent', () => {
  beforeEach(() => {
    createRoomWithAgent.mockReset();
    createRoomWithAgent.mockResolvedValue({ roomReady: true, agentDispatched: true });
  });

  it("someone else's agent: the call is with Ferni", async () => {
    expect(await request('/token', 'agent_2_theirs')).toBe(200);
    expect(getCustomAgent).toHaveBeenCalledWith('uid-123', 'agent_2_theirs');
    expect(dispatchedPersona()).toBe('ferni');
  });

  it("the caller's own agent: the call is with it", async () => {
    await request('/token', 'agent_1_mine');
    expect(dispatchedPersona()).toBe('agent_1_mine');
  });

  it('a built-in persona passes through untouched', async () => {
    await request('/token', 'peter-john');
    expect(dispatchedPersona()).toBe('peter-john');
  });

  it('a demo (no one signed in) never gets a custom agent', async () => {
    await request('/demo-token', 'agent_1_mine');
    expect(dispatchedPersona()).toBe('ferni');
  });
});

describe('/demo-token with DEMO_TOKEN_CORE_PERSONAS_ONLY', () => {
  beforeEach(() => {
    createRoomWithAgent.mockReset();
    createRoomWithAgent.mockResolvedValue({ roomReady: true, agentDispatched: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('on: an id that is not a built-in persona is not dispatched; the demo is with Ferni', async () => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'on');
    expect(await request('/demo-token', 'test-companion')).toBe(200);
    expect(dispatchedPersona()).toBe('ferni');
  });

  it.each([...ALL_CANONICAL_IDS])(
    'on: built-in persona %s passes through unchanged',
    async (id) => {
      vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'on');
      await request('/demo-token', id);
      expect(dispatchedPersona()).toBe(id);
    }
  );

  it('on: an alias of a built-in persona is sent as its canonical id', async () => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'on');
    await request('/demo-token', 'maya');
    expect(dispatchedPersona()).toBe('maya-santos');
  });

  it.each([
    ['off', 'off'],
    ['unset', undefined],
  ])('%s: any id passes through, as on main', async (_label, state) => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', state);
    await request('/demo-token', 'test-companion');
    expect(dispatchedPersona()).toBe('test-companion');
  });

  it.each(['on', 'off'])('%s: no persona_id gives the default, Ferni', async (state) => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', state);
    await request('/demo-token');
    expect(dispatchedPersona()).toBe('ferni');
  });
  // The prompt each one then gets is pinned in token-demo-persona.test.ts.
  it.each(PROTOTYPE_KEYS)('on: %s is sent as Ferni', async (id) => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'on');
    expect(await request('/demo-token', id)).toBe(200);
    expect(dispatchedPersona()).toBe('ferni');
  });

  it.each(PROTOTYPE_KEYS)('off: %s passes through as the same string as on main', async (id) => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'off');
    expect(await request('/demo-token', id)).toBe(200);
    expect(dispatchedPersona()).toBe(id);
  });

  it('on: joel goes where main sends it, joel-dickson', async () => {
    vi.stubEnv('DEMO_TOKEN_CORE_PERSONAS_ONLY', 'on');
    await request('/demo-token', 'joel');
    expect(dispatchedPersona()).toBe('joel-dickson');
  });
});
