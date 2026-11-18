/**
 * Trust analytics and speech metrics are pipeline-wide numbers for the admin portal: these
 * drive the REAL requireAuth (only Firebase's token check and the security-event store are
 * mocked) and pin 401 signed out, 403 for a signed-in non-admin, and an answer for an admin.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyFirebaseToken = vi.fn();
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: (...args: unknown[]) => verifyFirebaseToken(...args),
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/security-events.js', () => ({
  detectAnomalies: vi.fn(() => []),
  isLockedOut: vi.fn(() => ({ locked: false })),
  recordSecurityEvent: vi.fn(async () => undefined),
  recordSuccessfulAuth: vi.fn(async () => undefined),
  trackFailedAuth: vi.fn(async () => undefined),
}));
vi.mock('../trust-dashboard-routes.js', () => ({
  handleTrustDashboardRoute: vi.fn(async () => false),
}));
vi.mock('../../services/trust-systems/index.js', () => ({
  getAggregateMetrics: vi.fn(() => ({ totalEvents: 3 })),
  getHealthCheck: vi.fn(() => ({ healthy: true })),
  getTrustAggregates: vi.fn(() => ({
    totalProfiles: 2,
    avgTrustScore: 0.5,
    activeRelationships: 1,
  })),
}));

const { handleTrustSystemsRoutes } = await import('../trust-systems-routes.js');
const { handleSpeechMetricsRoutes, parseThresholdUpdate } =
  await import('../speech-metrics-routes.js');
const { getQualityThresholds } =
  await import('../../agents/integrations/speech-metrics-integration.js');

type Who = 'signed-out' | 'user' | 'admin';
let ip = 0;

function request(method: string, url: string, who: Who, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  ip += 1; // a fresh client per request, so the route's rate limits never interfere
  req.headers = {
    'x-forwarded-for': `203.0.113.${ip % 250}`,
    ...(who === 'signed-out' ? {} : { authorization: `Bearer token-${who}` }),
  };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: `198.51.100.${ip % 250}`,
  };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  }, 0);
  return req;
}

interface Captured {
  status: number;
  body: unknown;
}
function response(): ServerResponse & { captured: Captured } {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    captured,
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(status: number) {
      captured.status = status;
      this.headersSent = true;
      return this;
    },
    end(chunk?: string) {
      captured.body = chunk ? (JSON.parse(chunk) as unknown) : undefined;
    },
  };
  return res as unknown as ServerResponse & { captured: Captured };
}

async function trust(path: string, who: Who): Promise<Captured> {
  const req = request('GET', path, who);
  const res = response();
  await handleTrustSystemsRoutes(req, res, path, new URL(`http://x${path}`));
  return res.captured;
}
async function speech(method: string, path: string, who: Who, body?: unknown): Promise<Captured> {
  const req = request(method, path, who, body);
  const res = response();
  await handleSpeechMetricsRoutes(req, res, path);
  return res.captured;
}

beforeEach(() => {
  verifyFirebaseToken.mockImplementation(async (token: string) => ({
    uid: token === 'token-admin' ? 'uid-admin' : 'uid-user',
    email: undefined,
    emailVerified: true,
    isAnonymous: false,
    claims: token === 'token-admin' ? { admin: true } : {},
  }));
});

describe('trust analytics are admins only', () => {
  it('answers 401 signed out', async () => {
    expect((await trust('/api/trust/analytics/metrics', 'signed-out')).status).toBe(401);
  });
  it('answers 403 to a signed-in user who is not an admin', async () => {
    expect((await trust('/api/trust/analytics/metrics', 'user')).status).toBe(403);
  });
  it('answers an admin with the aggregates', async () => {
    const got = await trust('/api/trust/analytics/metrics', 'admin');
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ totalProfiles: 2, milestonesReached: 3 });
  });
});

describe('speech metrics are admins only', () => {
  it('answers 401 signed out and 403 to a non-admin, on reads and on threshold writes', async () => {
    expect((await speech('GET', '/api/speech-metrics/dashboard', 'signed-out')).status).toBe(401);
    expect((await speech('GET', '/api/speech-metrics/dashboard', 'user')).status).toBe(403);
    const before = getQualityThresholds();
    const write = await speech('POST', '/api/speech-metrics/thresholds', 'user', {
      responseLatencyMs: 9,
    });
    expect(write.status).toBe(403);
    expect(getQualityThresholds()).toEqual(before);
  });

  it('lets an admin read and change a threshold', async () => {
    expect((await speech('GET', '/api/speech-metrics/thresholds', 'admin')).status).toBe(200);
    const write = await speech('POST', '/api/speech-metrics/thresholds', 'admin', {
      responseLatencyMs: 350,
    });
    expect(write.status).toBe(200);
    expect(getQualityThresholds().responseLatencyMs).toBe(350);
  });

  it('refuses an admin threshold write that is unknown, not a number or out of range', async () => {
    const before = getQualityThresholds();
    for (const body of [{ isAdmin: true }, { p99LatencyMs: '500' }, { emotionConfidence: 7 }, {}]) {
      expect((await speech('POST', '/api/speech-metrics/thresholds', 'admin', body)).status).toBe(
        400
      );
    }
    expect(getQualityThresholds()).toEqual(before);
  });
});

describe('parseThresholdUpdate', () => {
  it('keeps known thresholds in range and names what it refuses', () => {
    expect(parseThresholdUpdate({ turnPredictionAccuracy: 0.8, p99LatencyMs: 600 })).toEqual({
      turnPredictionAccuracy: 0.8,
      p99LatencyMs: 600,
    });
    expect(parseThresholdUpdate({ backchannelAccuracy: 1.5 })).toBe(
      'backchannelAccuracy must be a number from 0 to 1'
    );
    expect(parseThresholdUpdate({ responseLatencyMs: Number.NaN })).toMatch(/responseLatencyMs/);
    expect(parseThresholdUpdate(JSON.parse('{"__proto__": 1}') as Record<string, unknown>)).toMatch(
      /Unknown/
    );
  });
});
