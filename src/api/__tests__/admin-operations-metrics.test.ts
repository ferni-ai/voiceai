/**
 * #4069 W11: /api/v1/admin/operations sends request metrics read from Cloud Monitoring,
 * or null with the reason it has none. It used to send p50 x1.5 and x2 as p95 and p99,
 * error rates of 0.01 / 0.005 / 0.1 by health status, and gcloud CLI counts that read 0
 * or 1 (the UI image has no gcloud). The voice agent runs on LiveKit Cloud, so nothing
 * here measures it.
 *
 * Only the I/O is mocked: the Monitoring client, the health-check fetch, and auth.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async () => ({ userId: 'admin-1' })),
}));

type Series = Record<string, unknown>;
type Request = { filter: string; aggregation: { crossSeriesReducer?: string } };
const monitoring = vi.hoisted(() => ({
  /** What each metric's read answers: its series (or a function of the request), an error, or no end */
  answers: {} as Record<string, Series[] | ((r: Request) => Series[]) | Error | 'hang'>,
  requests: [] as Request[],
}));
vi.mock('@google-cloud/monitoring', () => ({
  MetricServiceClient: class {
    async listTimeSeries(request: Request) {
      monitoring.requests.push(request);
      const metric = /run\.googleapis\.com\/([\w/]+)"/.exec(request.filter)?.[1] ?? '';
      const answer = monitoring.answers[metric] ?? [];
      if (answer === 'hang') return new Promise(() => {});
      if (answer instanceof Error) throw answer;
      return [typeof answer === 'function' ? answer(request) : answer, null, null];
    }
  },
}));

/** Monitoring's own percentile of the merged latency distribution, by the reducer asked for */
const PERCENTILES: Record<string, number> = {
  REDUCE_PERCENTILE_50: 32,
  REDUCE_PERCENTILE_95: 128,
  REDUCE_PERCENTILE_99: 460.8,
};
const LATENCY = (request: Request): Series[] => {
  const ms = PERCENTILES[request.aggregation.crossSeriesReducer ?? ''];
  return ms === undefined ? [] : [{ points: [{ value: { doubleValue: ms } }] }];
};
const REQUESTS: Series[] = [
  { metric: { labels: { response_code_class: '2xx' } }, points: [{ value: { int64Value: '90' } }] },
  { metric: { labels: { response_code_class: '5xx' } }, points: [{ value: { int64Value: '10' } }] },
];
const INSTANCES: Series[] = [
  {
    points: [
      { interval: { endTime: { seconds: 200 } }, value: { int64Value: '3' } },
      { interval: { endTime: { seconds: 100 } }, value: { int64Value: '7' } },
    ],
  },
];

const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));

async function get(path: string) {
  const { handleAdminOperationsRoutes } = await import('../v1/admin/operations.js');
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
  const url = new URL(`http://x${path}`);
  await handleAdminOperationsRoutes(req, res as unknown as ServerResponse, url.pathname, url);
  return JSON.parse(res.body) as Record<string, unknown>;
}
/** The UI server's metrics from /metrics (the metrics object itself) */
const uiServer = (json: Record<string, unknown>) => json.uiServer as Record<string, unknown>;

beforeEach(() => {
  vi.resetModules();
  monitoring.answers = {
    request_latencies: LATENCY,
    request_count: REQUESTS,
    'container/instance_count': INSTANCES,
  };
  monitoring.requests = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('UI server metrics from Cloud Monitoring', () => {
  it('sends the measured percentiles, 5xx share, requests and newest instance count', async () => {
    const json = await get('/api/v1/admin/operations/metrics');
    expect(uiServer(json)).toEqual({
      latencyMs: { p50: 32, p95: 128, p99: 460.8 },
      errorRate: 0.1,
      requestCount: 100,
      instances: 3,
      missing: {},
    });
    const latencyReads = monitoring.requests.filter((r) => r.filter.includes('request_latencies'));
    expect(latencyReads.map((r) => r.aggregation)).toEqual(
      [50, 95, 99].map((p) =>
        expect.objectContaining({
          perSeriesAligner: 'ALIGN_DELTA',
          crossSeriesReducer: `REDUCE_PERCENTILE_${p}`,
        })
      )
    );
    expect(monitoring.requests.map((r) => r.filter)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('resource.labels.service_name="john-bogle-ui"'),
      ])
    );
  });

  it('sends null with a reason, not 0, when Monitoring has no data', async () => {
    monitoring.answers = {};
    const json = await get('/api/v1/admin/operations/metrics');
    const reason = 'no data: no requests in the last 60 minutes';
    expect(uiServer(json)).toEqual({
      latencyMs: { p50: null, p95: null, p99: null },
      errorRate: null,
      requestCount: null,
      instances: null,
      missing: {
        latencyMs: reason,
        errorRate: reason,
        requestCount: reason,
        instances: 'no data: no instance count in the last 5 minutes',
      },
    });
  });

  it('keeps a real 0 requests as 0, but has no error rate to give for it', async () => {
    monitoring.answers.request_count = [
      {
        metric: { labels: { response_code_class: '2xx' } },
        points: [{ value: { int64Value: '0' } }],
      },
    ];
    const metrics = uiServer(await get('/api/v1/admin/operations/metrics'));
    expect(metrics.requestCount).toBe(0);
    expect(metrics.errorRate).toBeNull();
  });

  it('says the service account needs monitoring.viewer when permission is denied', async () => {
    monitoring.answers = {
      request_latencies: Object.assign(new Error('7 PERMISSION_DENIED: Permission denied'), {
        code: 7,
      }),
      request_count: REQUESTS,
      'container/instance_count': INSTANCES,
    };
    const metrics = uiServer(await get('/api/v1/admin/operations/metrics'));
    expect(metrics.latencyMs).toEqual({ p50: null, p95: null, p99: null });
    expect((metrics.missing as Record<string, string>).latencyMs).toBe(
      'unavailable: the UI service account cannot read Cloud Monitoring (needs roles/monitoring.viewer)'
    );
    // Each metric fails alone: the others are still read
    expect(metrics.requestCount).toBe(100);
  });

  it('says there are no credentials when ADC finds none', async () => {
    monitoring.answers = {
      request_count: new Error('Could not load the default credentials. Browse to ...'),
    };
    const metrics = uiServer(await get('/api/v1/admin/operations/metrics'));
    expect(metrics.requestCount).toBeNull();
    expect(metrics.errorRate).toBeNull();
    expect((metrics.missing as Record<string, string>).requestCount).toBe(
      'unavailable: no Google Cloud credentials on this server'
    );
  });

  it('gives up after 8s with null and a timeout reason', async () => {
    vi.useFakeTimers();
    monitoring.answers = {
      request_latencies: 'hang',
      request_count: 'hang',
      'container/instance_count': 'hang',
    };
    const pending = get('/api/v1/admin/operations/metrics');
    await vi.advanceTimersByTimeAsync(8_000);
    const metrics = uiServer(await pending);
    expect(metrics).toMatchObject({ errorRate: null, requestCount: null, instances: null });
    expect((metrics.missing as Record<string, string>).instances).toBe(
      'unavailable: Cloud Monitoring did not answer within 8s'
    );
  });

  it('names any other gRPC failure by its code', async () => {
    monitoring.answers['container/instance_count'] = Object.assign(new Error('unavailable'), {
      code: 14,
    });
    const metrics = uiServer(await get('/api/v1/admin/operations/metrics'));
    expect(metrics.instances).toBeNull();
    expect((metrics.missing as Record<string, string>).instances).toBe(
      'unavailable: Cloud Monitoring error (code 14)'
    );
  });
});

describe('voice agent and the Refresh read', () => {
  it('measures nothing for the voice agent and checks no dead Cloud Run health URL', async () => {
    vi.stubEnv('VOICE_AGENT_HEALTH_URL', '');
    const json = await get('/api/v1/admin/operations');
    const voice = (json.metrics as Record<string, Record<string, unknown>>).voiceAgent;
    expect(voice).toMatchObject({ errorRate: null, requestCount: null, instances: null });
    expect((voice.missing as Record<string, string>).latencyMs).toBe(
      'not measured: the voice agent runs on LiveKit Cloud'
    );
    const services = json.services as Array<Record<string, unknown>>;
    expect(services.find((s) => s.id === 'voice-agent')).toMatchObject({
      status: 'not-measured',
      responseTime: null,
    });
    const fetched = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(fetched.some((url) => url.includes('voiceai-agent'))).toBe(false);
  });

  it('serves the cached read for 5 minutes, and reads again with ?fresh=1', async () => {
    await get('/api/v1/admin/operations/metrics');
    const reads = monitoring.requests.length;
    expect(reads).toBe(5);
    await get('/api/v1/admin/operations/metrics');
    expect(monitoring.requests).toHaveLength(reads);
    await get('/api/v1/admin/operations/metrics?fresh=1');
    expect(monitoring.requests).toHaveLength(reads * 2);
  });
});
