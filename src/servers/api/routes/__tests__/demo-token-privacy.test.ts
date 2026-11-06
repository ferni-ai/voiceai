/**
 * A try-first visitor taps "Talk to Ferni" with no account and is told nothing is kept.
 * Through the REAL /demo-token route, the REAL demo-sessions service and the REAL
 * safe-logger (the global setup mocks it; this unmocks it), with only the store and the
 * outside services faked:
 * - the demo_sessions doc written for the call holds no IP address and no User-Agent;
 * - no log line the route writes holds the visitor's IP or city;
 * - the device id it mints is the one the agent stores nothing for (isAnonymousDemoUser).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../../../../utils/safe-logger.js');

// Fictional visitor: a documentation-range IP, a made-up browser and town.
const IP = '203.0.113.47';
const UA = 'Mozilla/5.0 (Zqx Testbrowser 9.1)';
const CITY = 'Quillhaven';

const m = vi.hoisted(() => ({
  written: [] as Array<{ id: string; data: unknown }>,
  createRoomWithAgent: vi.fn(async () => ({ roomReady: true, agentDispatched: true })),
}));
vi.mock('../../../../services/persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: async () => null,
    set: (id: string, data: unknown) => void m.written.push({ id, data }),
    setImmediate: async (id: string, data: unknown) => void m.written.push({ id, data }),
    delete: async () => undefined,
    flush: async () => undefined,
    shutdown: async () => undefined,
  }),
  shutdownPersistence: async () => undefined,
}));
vi.mock('../../../token/demo-rate-limit-shared.js', () => ({
  reserveDemoSession: vi.fn(async () => ({ allowed: true, sessionsRemaining: 2 })),
  releaseDemoSession: vi.fn(async () => undefined),
  peekDemoAllowance: vi.fn(),
}));
vi.mock('../../../token/demo-rate-limit.js', () => ({
  DEMO_CONFIG: { maxSessionsPerDay: 3, sessionDurationMinutes: 3, cooldownMinutes: 5 },
  startRateLimitCleanup: vi.fn(),
  stopRateLimitCleanup: vi.fn(),
}));
vi.mock('../../../token/livekit.js', () => ({
  createToken: vi.fn(async () => 'jwt-token'),
  createRoomWithAgent: m.createRoomWithAgent,
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
}));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../services/identity/geo-detection.js', () => ({
  detectGeoFromRequest: vi.fn(async () => ({
    primaryLanguage: 'en-US',
    accent: 'american',
    city: CITY,
    regionCode: 'ZZ',
    countryCode: 'US',
  })),
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
const { isAnonymousDemoUser } = await import('../../../../utils/synthetic-user.js');

let out: string[];
beforeEach(() => {
  out = [];
  m.written.length = 0;
  const keep = (chunk: string | Uint8Array): boolean => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(keep);
  vi.spyOn(process.stderr, 'write').mockImplementation(keep);
});
afterEach(() => vi.restoreAllMocks());

async function demoToken(): Promise<number> {
  const req = {
    method: 'GET',
    headers: { 'user-agent': UA, 'x-forwarded-for': IP },
    socket: { remoteAddress: IP },
  } as unknown as IncomingMessage;
  let status = 0;
  const res = {
    headersSent: false,
    writeHead: (code: number) => {
      status = code;
    },
    end: () => undefined,
  } as unknown as ServerResponse;
  await handleTokenRoutes(req, res, '/demo-token', new URL('http://localhost/demo-token'));
  return status;
}

describe('/demo-token keeps nothing that places the visitor', () => {
  it('the demo_sessions doc holds no IP and no User-Agent', async () => {
    expect(await demoToken()).toBe(200);
    expect(m.written).toHaveLength(1);
    const doc = JSON.stringify(m.written[0]?.data);
    expect(doc).toContain('"claimToken"'); // the doc was written
    expect(doc).not.toContain(IP);
    expect(doc).not.toContain('Testbrowser');
    expect(doc).not.toContain('metadata');
  });

  it("the route's log lines hold neither the IP nor the city; the lines ran", async () => {
    await demoToken();
    const written = out.join('');
    expect(written).toContain('Demo: location detected'); // the city line ran
    expect(written).toContain('Dispatching agent');
    expect(written).not.toContain(CITY);
    expect(written).not.toContain(IP);
  });

  it('the device id it mints is the one the agent stores nothing for', async () => {
    await demoToken();
    const metadata = (m.createRoomWithAgent.mock.calls.at(-1) as unknown[] | undefined)?.[1] as {
      device_id: string;
    };
    expect(isAnonymousDemoUser(`device:${metadata.device_id}`)).toBe(true);
  });
});
