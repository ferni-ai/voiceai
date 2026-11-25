/**
 * Cloud Run request metrics, read from Cloud Monitoring with the server's own
 * credentials (ADC). Every value is a measurement or null with the reason it is
 * missing: no credentials, no permission, a timeout, or no data. Never a 0 or a
 * constant standing in for one (#4069).
 *
 * Reads, for one Cloud Run service:
 * - request latency p50/p95/p99 over the window, from run.googleapis.com/request_latencies
 *   (ALIGN_DELTA, then REDUCE_PERCENTILE_n over every series' distribution together;
 *   a per-series percentile aligner would leave one percentile per response code);
 * - requests and the 5xx share over the window, from run.googleapis.com/request_count
 *   grouped by response_code_class;
 * - instances in the newest minute, from run.googleapis.com/container/instance_count.
 *
 * @module CloudRunMetrics
 */

import type { MetricServiceClient, protos } from '@google-cloud/monitoring';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CloudRunMetrics' });

type TimeSeries = protos.google.monitoring.v3.ITimeSeries;
type ListRequest = protos.google.monitoring.v3.IListTimeSeriesRequest;
type Int64 = number | string | { toString: () => string } | null | undefined;

/** One Cloud Run service's request metrics; `missing` says why each null is null. */
export interface ServiceMetrics {
  latencyMs: { p50: number | null; p95: number | null; p99: number | null };
  /** 5xx responses over all responses in the window, 0 to 1 */
  errorRate: number | null;
  requestCount: number | null;
  instances: number | null;
  missing: Partial<Record<'latencyMs' | 'errorRate' | 'requestCount' | 'instances', string>>;
}

/** Every metric null, each for the same reason (a service nothing here measures). */
export function unmeasuredService(reason: string): ServiceMetrics {
  return {
    latencyMs: { p50: null, p95: null, p99: null },
    errorRate: null,
    requestCount: null,
    instances: null,
    missing: { latencyMs: reason, errorRate: reason, requestCount: reason, instances: reason },
  };
}

let reader: Promise<MetricServiceClient> | undefined;

/**
 * The client, initialized. initialize() is awaited here so a missing credential rejects
 * this promise, where the read catches it: left to the client's first call, the gapic
 * code rethrows it as an uncaught exception, which takes the whole server down.
 */
async function getReader(): Promise<MetricServiceClient> {
  if (reader) return reader;
  // Loaded on first read: the gRPC client is heavy and most requests never need it
  const created = import('@google-cloud/monitoring').then(async ({ MetricServiceClient }) => {
    const client = new MetricServiceClient();
    await client.initialize();
    return client;
  });
  reader = created;
  // The read that waits on it reports the failure; the next read (a Refresh) tries again
  created.catch(() => {
    if (reader === created) reader = undefined;
  });
  return created;
}

class ReadTimeout extends Error {}

/** The reason a Monitoring read failed, in words an admin can act on. */
function failureReason(error: unknown, timeoutMs: number, projectId: string): string {
  if (error instanceof ReadTimeout) {
    return `unavailable: Cloud Monitoring did not answer within ${timeoutMs / 1000}s`;
  }
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === 7) {
    return `unavailable: these credentials can't read Cloud Monitoring for ${projectId} (in prod the UI service account needs roles/monitoring.viewer)`;
  }
  if (code === 16 || /default credentials|credential file/i.test(String(message))) {
    return 'unavailable: no Google Cloud credentials on this server';
  }
  return `unavailable: Cloud Monitoring error (${typeof code === 'number' ? `code ${code}` : String(message).slice(0, 80)})`;
}

const toNumber = (value: Int64): number => Number(String(value ?? 0));

/** The newest point's value over all series, or null when there is none. */
function newestValue(series: TimeSeries[]): number | null {
  const points = series.flatMap((s) => s.points ?? []);
  const end = (p: (typeof points)[number]): number => toNumber(p.interval?.endTime?.seconds);
  const value = points.sort((a, b) => end(b) - end(a))[0]?.value;
  if (!value) return null;
  return value.doubleValue ?? toNumber(value.int64Value);
}

interface Target {
  projectId: string;
  service: string;
  endSeconds: number;
  timeoutMs: number;
}

/** One metric's series for the service, aggregated by Monitoring, bounded by the timeout. */
async function listSeries(
  target: Target,
  metric: string,
  minutes: number,
  aggregation: ListRequest['aggregation']
): Promise<TimeSeries[]> {
  const { projectId, service, endSeconds, timeoutMs } = target;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReadTimeout()), timeoutMs);
  });
  const request: ListRequest = {
    name: `projects/${projectId}`,
    filter: `metric.type="run.googleapis.com/${metric}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="${service}"`,
    interval: {
      startTime: { seconds: endSeconds - minutes * 60 },
      endTime: { seconds: endSeconds },
    },
    aggregation,
    view: 'FULL',
  };
  try {
    const client = await Promise.race([getReader(), timeout]);
    const [series] = await Promise.race([
      client.listTimeSeries(request, { timeout: timeoutMs }),
      timeout,
    ]);
    return series;
  } finally {
    clearTimeout(timer);
  }
}

/** Read one service's request metrics. Each metric is read separately, so each fails alone. */
export async function readCloudRunMetrics(options: {
  projectId: string;
  service: string;
  windowMinutes?: number;
  timeoutMs?: number;
}): Promise<ServiceMetrics> {
  const { windowMinutes = 60, timeoutMs = 8000 } = options;
  const target: Target = { ...options, timeoutMs, endSeconds: Math.floor(Date.now() / 1000) };
  const window = {
    alignmentPeriod: { seconds: windowMinutes * 60 },
    perSeriesAligner: 'ALIGN_DELTA' as const,
  };
  const percentile = async (p: 50 | 95 | 99): Promise<TimeSeries[]> =>
    listSeries(target, 'request_latencies', windowMinutes, {
      ...window,
      crossSeriesReducer: `REDUCE_PERCENTILE_${p}`,
    });
  const [p50, p95, p99, requests, instances] = await Promise.allSettled([
    percentile(50),
    percentile(95),
    percentile(99),
    listSeries(target, 'request_count', windowMinutes, {
      ...window,
      crossSeriesReducer: 'REDUCE_SUM',
      groupByFields: ['metric.label.response_code_class'],
    }),
    listSeries(target, 'container/instance_count', 5, {
      alignmentPeriod: { seconds: 60 },
      perSeriesAligner: 'ALIGN_MAX',
      crossSeriesReducer: 'REDUCE_SUM',
    }),
  ]);
  const failed = (read: PromiseSettledResult<TimeSeries[]>): string | undefined => {
    if (read.status === 'fulfilled') return undefined;
    const reason = failureReason(read.reason, timeoutMs, options.projectId);
    log.warn({ service: options.service, reason }, 'Cloud Monitoring read failed');
    return reason;
  };
  const seriesOf = (read: PromiseSettledResult<TimeSeries[]>): TimeSeries[] =>
    read.status === 'fulfilled' ? read.value : [];

  const result = unmeasuredService(`no data: no requests in the last ${windowMinutes} minutes`);
  const latencyFailed = failed(p50) ?? failed(p95) ?? failed(p99);
  const [low, mid, high] = [p50, p95, p99].map((read) => newestValue(seriesOf(read)));
  if (latencyFailed) result.missing.latencyMs = latencyFailed;
  else if (low !== null) {
    result.latencyMs = { p50: low, p95: mid, p99: high };
    // A percentile Monitoring sent nothing for keeps a reason the section shows beside it
    if (mid === null || high === null) {
      result.missing.latencyMs = 'no data: Cloud Monitoring sent no p95 or p99 for this window';
    } else delete result.missing.latencyMs;
  }

  const requestsFailed = failed(requests);
  const byClass = seriesOf(requests);
  const sum = (list: TimeSeries[]): number =>
    list.flatMap((s) => s.points ?? []).reduce((n, p) => n + toNumber(p.value?.int64Value), 0);
  if (requestsFailed) result.missing.requestCount = result.missing.errorRate = requestsFailed;
  else if (byClass.length > 0) {
    const total = sum(byClass);
    result.requestCount = total;
    delete result.missing.requestCount;
    if (total > 0) {
      result.errorRate =
        sum(byClass.filter((s) => s.metric?.labels?.response_code_class === '5xx')) / total;
      delete result.missing.errorRate;
    }
  }

  const instancesFailed = failed(instances);
  const count = newestValue(seriesOf(instances));
  if (instancesFailed) result.missing.instances = instancesFailed;
  else if (count === null)
    result.missing.instances = 'no data: no instance count in the last 5 minutes';
  else {
    result.instances = Math.round(count);
    delete result.missing.instances;
  }
  return result;
}
