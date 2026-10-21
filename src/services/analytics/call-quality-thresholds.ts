/**
 * The call-quality threshold alerts that page today: connection rate, first
 * response time, disconnect rate and the quality score, each with a warning and
 * a critical line. Rates and the score wait for a minimum sample (#2086,
 * call-quality-sample.ts). This is the default rule while CALL_QUALITY_ALERTS is
 * off or shadow; `on` swaps it for the windowed SLOs (call-quality-slo.ts).
 *
 * @module services/analytics/call-quality-thresholds
 */

import { createLogger } from '../../utils/safe-logger.js';
import { gateSmallSamples } from './call-quality-sample.js';
import type { CallQualityConfig, CallQualityMetrics } from './call-quality-monitor.js';

const log = createLogger({ module: 'CallQualityMonitor' });

export type SendQualityAlert = (
  severity: 'warning' | 'critical',
  title: string,
  message: string,
  metrics: Record<string, unknown>
) => Promise<void>;

/** Page on each threshold the window crosses; `send` applies the cooldown. */
export async function checkThresholdAlerts(
  metrics: CallQualityMetrics,
  limits: CallQualityConfig,
  send: SendQualityAlert
): Promise<void> {
  const gated = gateSmallSamples(metrics, limits.minCallsForRateAlerts);

  // Connection success rate
  if (gated.connectionSuccessRate < limits.connectionSuccessRateCritical) {
    await send(
      'critical',
      'Connection Success Rate Critical',
      `Only ${(metrics.connectionSuccessRate * 100).toFixed(1)}% of calls connecting successfully`,
      {
        connectionSuccessRate: metrics.connectionSuccessRate,
        connectionAttempts: metrics.connectionAttempts,
      }
    );
  } else if (gated.connectionSuccessRate < limits.connectionSuccessRateWarning) {
    await send(
      'warning',
      'Connection Success Rate Degraded',
      `${(metrics.connectionSuccessRate * 100).toFixed(1)}% connection rate is below normal`,
      { connectionSuccessRate: metrics.connectionSuccessRate }
    );
  }

  // First response time
  if (metrics.avgFirstResponseTimeMs > limits.firstResponseTimeCriticalMs) {
    await send(
      'critical',
      'Response Time Critical',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s exceeds ${limits.firstResponseTimeCriticalMs / 1000}s threshold`,
      {
        avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs,
        p95FirstResponseTimeMs: metrics.p95FirstResponseTimeMs,
      }
    );
  } else if (metrics.avgFirstResponseTimeMs > limits.firstResponseTimeWarningMs) {
    await send(
      'warning',
      'Response Time Elevated',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s is slow`,
      { avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs }
    );
  }

  // Disconnect rate
  if (gated.disconnectRate > limits.disconnectRateCritical) {
    await send(
      'critical',
      'Disconnect Rate Critical',
      `${(metrics.disconnectRate * 100).toFixed(1)}% of calls ending in disconnection`,
      { disconnectRate: metrics.disconnectRate, disconnectCount: metrics.disconnectCount }
    );
  } else if (gated.disconnectRate > limits.disconnectRateWarning) {
    await send(
      'warning',
      'Disconnect Rate Elevated',
      `${(metrics.disconnectRate * 100).toFixed(1)}% disconnect rate is above normal`,
      { disconnectRate: metrics.disconnectRate }
    );
  }

  // Quality score alert
  if (gated.qualityScore < 70) {
    await send(
      'critical',
      'Call Quality Score Low',
      `Overall quality score is ${metrics.qualityScore}/100`,
      { ...metrics }
    );
  } else if (gated.qualityScore < 85) {
    await send(
      'warning',
      'Call Quality Score Degraded',
      `Quality score ${metrics.qualityScore}/100 is below optimal`,
      { qualityScore: metrics.qualityScore }
    );
  }

  log.debug(
    {
      qualityScore: metrics.qualityScore,
      totalCalls: metrics.totalCalls,
      connectionRate: (metrics.connectionSuccessRate * 100).toFixed(1),
      disconnectRate: (metrics.disconnectRate * 100).toFixed(1),
    },
    'Quality check complete'
  );
}
