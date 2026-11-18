/**
 * #4069 BTH validation routes (plan row 9), through the real route handler:
 *
 * - telemetry awaits the Firestore read and sends the real CapabilityTelemetry fields;
 *   reply rates nothing classified are null, not 0
 * - without the store it answers 503, not an empty list; a failed read is a 500, not
 *   "no events" (the service now throws instead of returning null)
 * - the benchmark route sends the report runFullBenchmark returned
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async () => ({ userId: 'admin-1' })),
}));

const store = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => store.db,
}));
// production-telemetry reads the store through the superhuman re-export
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => store.db }));

const telemetry = vi.hoisted(() => ({
  getAllCapabilityTelemetry: vi.fn(),
  getBufferStats: vi.fn(() => ({ bufferedEvents: 0, capabilityBreakdown: {}, recentTriggers: 0 })),
}));
vi.mock('../../services/better-than-human-validation/production-telemetry.js', () => telemetry);

const benchmark = vi.hoisted(() => ({
  runFullBenchmark: vi.fn(),
  formatBenchmarkReport: vi.fn(() => 'text report'),
}));
vi.mock('../../services/better-than-human-validation/capability-benchmark.js', () => benchmark);
vi.mock('../../services/better-than-human-validation/blind-evaluation.js', () => ({}));

type Json = Record<string, unknown>;

async function get(path: string): Promise<{ status: number; json: Json }> {
  const { handleBTHAnalyticsRoutes } = await import('../v1/admin/better-than-human-analytics.js');
  const req = { method: 'GET', url: path, headers: { host: 'x' } } as unknown as IncomingMessage;
  const res = {
    statusCode: 200,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    end(data?: string) {
      this.body = data ?? '';
    },
  };
  await handleBTHAnalyticsRoutes(
    req,
    res as unknown as ServerResponse,
    path,
    new URL(`http://x${path}`)
  );
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') as Json };
}

const TELEMETRY = '/api/v1/admin/bth/validation/telemetry';

const capabilityTelemetry = (overrides: Json = {}) => ({
  capability: 'commitment_detection',
  periodStart: new Date('2026-11-11T00:00:00.000Z'),
  periodEnd: new Date('2026-11-18T00:00:00.000Z'),
  totalTriggers: 41,
  uniqueUsers: 6,
  uniqueSessions: 9,
  acknowledged: 2,
  dismissed: 1,
  engaged: 1,
  acknowledgmentRate: 0.5,
  dismissalRate: 0.25,
  engagementRate: 0.25,
  averageConfidence: 0.77,
  confidenceP25: 0.6,
  confidenceP75: 0.9,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.db = {};
});

describe('GET /validation/telemetry', () => {
  it('awaits the store and sends the real telemetry fields', async () => {
    telemetry.getAllCapabilityTelemetry.mockResolvedValue([capabilityTelemetry()]);
    const { status, json } = await get(TELEMETRY);
    expect(status).toBe(200);
    expect(telemetry.getAllCapabilityTelemetry).toHaveBeenCalledWith(7);
    expect(json.periodDays).toBe(7);
    expect(json.entries).toEqual([
      {
        capability: 'commitment_detection',
        totalTriggers: 41,
        uniqueUsers: 6,
        acknowledgmentRate: 0.5,
        engagementRate: 0.25,
        averageConfidence: 0.77,
      },
    ]);
    expect(json.buffer).toEqual({ bufferedEvents: 0, capabilityBreakdown: {}, recentTriggers: 0 });
  });

  it('sends null reply rates when no reply was classified, not 0', async () => {
    telemetry.getAllCapabilityTelemetry.mockResolvedValue([
      capabilityTelemetry({
        acknowledged: 0,
        dismissed: 0,
        engaged: 0,
        acknowledgmentRate: 0,
        engagementRate: 0,
      }),
    ]);
    const { json } = await get(TELEMETRY);
    expect(json.entries).toMatchObject([
      { totalTriggers: 41, acknowledgmentRate: null, engagementRate: null },
    ]);
  });

  it('sends an empty list when the store has no events in the period', async () => {
    telemetry.getAllCapabilityTelemetry.mockResolvedValue([]);
    const { status, json } = await get(TELEMETRY);
    expect(status).toBe(200);
    expect(json.entries).toEqual([]);
  });

  it('answers 503 without the store and reads nothing', async () => {
    store.db = null;
    const { status, json } = await get(TELEMETRY);
    expect(status).toBe(503);
    expect(json).toEqual({ error: 'Telemetry store unavailable' });
    expect(telemetry.getAllCapabilityTelemetry).not.toHaveBeenCalled();
  });

  it('answers 500 when the read fails, not an empty list', async () => {
    telemetry.getAllCapabilityTelemetry.mockRejectedValue(new Error('FAILED_PRECONDITION'));
    const { status, json } = await get(TELEMETRY);
    expect(status).toBe(500);
    expect(json.entries).toBeUndefined();
  });
});

describe('getCapabilityTelemetry (the service the route reads)', () => {
  it('throws when the Firestore read fails, so the route can tell it from "no events"', async () => {
    interface Query {
      where: () => Query;
      get: () => Promise<never>;
    }
    const query: Query = {
      where: () => query,
      get: async () => Promise.reject(new Error('FAILED_PRECONDITION')),
    };
    store.db = { collection: () => query };
    const actual = await vi.importActual<
      typeof import('../../services/better-than-human-validation/production-telemetry.js')
    >('../../services/better-than-human-validation/production-telemetry.js');
    await expect(actual.getCapabilityTelemetry('commitment_detection')).rejects.toThrow(
      'FAILED_PRECONDITION'
    );
  });
});

describe('GET /validation/benchmark', () => {
  it('sends the report runFullBenchmark returned, running it once', async () => {
    const report = {
      reportId: 'bth_1',
      generatedAt: new Date('2026-11-18T09:00:00.000Z'),
      capabilities: [
        { capability: 'crisis_detection', totalTestCases: 12, f1Score: 0.8, knownGaps: [] },
      ],
      overallF1Score: 0.8,
    };
    benchmark.runFullBenchmark.mockResolvedValue(report);
    const { status, json } = await get('/api/v1/admin/bth/validation/benchmark');
    expect(status).toBe(200);
    expect(benchmark.runFullBenchmark).toHaveBeenCalledTimes(1);
    expect(json.results).toEqual({ ...report, generatedAt: '2026-11-18T09:00:00.000Z' });
  });
});
