/**
 * Two /token requests for one fresh room name: exactly one gets it.
 *
 * Checking ownership and then creating the room left a gap in which an
 * attacker racing the owner's first request could also see the name free.
 * The claim is now a Firestore create() (first writer wins). Firestore is
 * faked with a yield before every operation, so check-then-set code would
 * interleave the way it can in production.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, firestore } = vi.hoisted(() => {
  const docs = new Map<string, { data: Record<string, unknown>; version: number }>();
  let version = 0;
  const tick = (): Promise<void> => Promise.resolve().then(() => undefined);
  const fail = (code: number) => Object.assign(new Error(`firestore ${code}`), { code });
  const state = { broken: false };
  const doc = (id: string) => ({
    create: async (data: Record<string, unknown>) => {
      await tick();
      if (state.broken) throw fail(14);
      if (docs.has(id)) throw fail(6);
      docs.set(id, { data, version: ++version });
    },
    get: async () => {
      await tick();
      if (state.broken) throw fail(14);
      const d = docs.get(id);
      return { exists: d !== undefined, data: () => d?.data, updateTime: d?.version };
    },
    set: async (data: Record<string, unknown>) => {
      await tick();
      docs.set(id, { data, version: ++version });
    },
    update: async (data: Record<string, unknown>, pre?: { lastUpdateTime?: number }) => {
      await tick();
      const d = docs.get(id);
      if (
        d === undefined ||
        (pre?.lastUpdateTime !== undefined && pre.lastUpdateTime !== d.version)
      )
        throw fail(9);
      docs.set(id, { data: { ...d.data, ...data }, version: ++version });
    },
  });
  return { docs, firestore: { state, db: { collection: () => ({ doc }) } } };
});
vi.mock('../../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => firestore.db,
}));

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
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  // "Bearer tok-<name>" verifies as uid-<name>
  verifyFirebaseToken: vi.fn(async (t: string) => ({ uid: `uid-${t.slice(4)}`, claims: {} })),
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
const { claimRoom, ROOM_CLAIM_TTL_MS } = await import('../token-room-claim.js');
const { refuseUnownedRoom } = await import('../token-room-owner.js');

/** The status /token answers for this caller: 200 when the gate lets it through. */
async function gate(room: string, uid: string): Promise<number> {
  let status = 200;
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: () => {},
  } as unknown as ServerResponse;
  await refuseUnownedRoom(room, uid, res);
  return status;
}

async function requestToken(room: string, who: string): Promise<number> {
  const url = new URL(`http://localhost/token?room=${room}&username=User&device_id=d1`);
  const req = {
    method: 'GET',
    headers: { authorization: `Bearer tok-${who}` },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  let status = 0;
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: () => {},
  } as unknown as ServerResponse;
  await handleTokenRoutes(req, res, '/token', url);
  return status;
}

describe('atomic room claim', () => {
  beforeEach(() => {
    docs.clear();
    firestore.state.broken = false;
    listRooms.mockReset();
    listRooms.mockResolvedValue([]);
    createToken.mockClear();
  });

  // At the gate /token calls: concurrent requests through handleTokenRoutes trip a
  // vitest quirk (its lazy firebase-auth import resolves to the real module).
  it('gives a fresh room to exactly one of two concurrent callers', async () => {
    const statuses = await Promise.all([
      gate('voice-1760000000100', 'uid-alice'),
      gate('voice-1760000000100', 'uid-mallory'),
    ]);
    expect([...statuses].sort()).toEqual([200, 403]);
  });

  it('lets the claimant back in and keeps everyone else out', async () => {
    expect(await requestToken('voice-1760000000101', 'alice')).toBe(200);
    expect(await requestToken('voice-1760000000101', 'mallory')).toBe(403);
    expect(await requestToken('voice-1760000000101', 'alice')).toBe(200);
  });

  it('fails closed with 503 when the claim store errors, signing nothing', async () => {
    firestore.state.broken = true;
    expect(await requestToken('voice-1760000000102', 'alice')).toBe(503);
    expect(createToken).not.toHaveBeenCalled();
  });

  it('keeps a claim for longer than any call', () => {
    expect(ROOM_CLAIM_TTL_MS).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000);
  });

  it('stores expireAt as a Date (a Firestore Timestamp) so the TTL policy deletes old claims', async () => {
    const now = 1_760_000_000_000;
    expect(await claimRoom('voice-ttl', 'uid-alice', now)).toBe('mine');
    const [stored] = [...docs.values()].map((d) => d.data);
    expect(stored?.expireAt).toBeInstanceOf(Date);
    expect((stored?.expireAt as Date).getTime()).toBe(now + ROOM_CLAIM_TTL_MS);
  });

  it('refuses a stranger while the claim is live, even with no LiveKit room yet', async () => {
    const now = Date.now();
    expect(await claimRoom('voice-x', 'uid-alice', now)).toBe('mine');
    expect(await claimRoom('voice-x', 'uid-mallory', now + ROOM_CLAIM_TTL_MS - 1)).toBe('theirs');
  });

  it('hands an expired claim to exactly one of two concurrent callers', async () => {
    const now = Date.now();
    await claimRoom('voice-y', 'uid-alice', now);
    const later = now + ROOM_CLAIM_TTL_MS + 1;
    const results = await Promise.all([
      claimRoom('voice-y', 'uid-bob', later),
      claimRoom('voice-y', 'uid-carol', later),
    ]);
    expect([...results].sort()).toEqual(['mine', 'theirs']);
  });
});
