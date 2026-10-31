/**
 * A rate over a handful of calls is noise, not an incident: one disconnected
 * call is a 100% disconnect rate and a quality score under 70, and with no
 * minimum sample the call-quality monitor opened critical Slack incidents from
 * single calls (102 alerts in three days of prod logs, 2026-10-18).
 *
 * @module services/analytics/call-quality-sample
 */

interface SampledMetrics {
  connectionAttempts: number;
  connectionSuccessRate: number;
  naturalEndCount: number;
  disconnectCount: number;
  errorCount: number;
  disconnectRate: number;
  qualityScore: number;
  firstResponseSamples: number;
  avgFirstResponseTimeMs: number;
}

/**
 * The rates, score and response time to alert on: the measured values once the
 * window holds `minCalls` calls, healthy values below that so no alert fires.
 * Connection rate and score count attempts; disconnect rate counts ended calls;
 * response time counts calls with a first response (one slow call opened
 * "Response Time Critical" on its own, 2026-10-24).
 */
export function gateSmallSamples(
  metrics: SampledMetrics,
  minCalls: number
): Pick<
  SampledMetrics,
  'connectionSuccessRate' | 'disconnectRate' | 'qualityScore' | 'avgFirstResponseTimeMs'
> {
  const enoughAttempts = metrics.connectionAttempts >= minCalls;
  const ended = metrics.naturalEndCount + metrics.disconnectCount + metrics.errorCount;
  return {
    connectionSuccessRate: enoughAttempts ? metrics.connectionSuccessRate : 1,
    disconnectRate: ended >= minCalls ? metrics.disconnectRate : 0,
    qualityScore: enoughAttempts ? metrics.qualityScore : 100,
    avgFirstResponseTimeMs:
      metrics.firstResponseSamples >= minCalls ? metrics.avgFirstResponseTimeMs : 0,
  };
}
