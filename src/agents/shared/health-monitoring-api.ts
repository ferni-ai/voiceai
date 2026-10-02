/**
 * Health server - monitoring API helpers
 *
 * Permissive CORS for internal monitoring endpoints and the diagnostics API
 * (latency summary, pipeline breakdown, per-session diagnostics).
 * Routed from health-server.ts.
 *
 * @module agents/shared/health-monitoring-api
 */

import type { ServerResponse } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'health-server' });

/**
 * Set CORS headers for internal monitoring API endpoints.
 *
 * NOTE: For user-facing APIs, use src/servers/shared/cors.ts which has
 * proper origin validation and security checks.
 *
 * These endpoints (metrics, diagnostics, cache stats) use permissive CORS because:
 * 1. Protected by network-level access (GCE firewall)
 * 2. Used by internal dashboards and CLI tools from various origins
 * 3. All data is read-only metrics (no mutations)
 */
export function setMonitoringCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Handle diagnostics API request - full pipeline breakdown
 */
export async function handleDiagnosticsAPI(url: string, res: ServerResponse): Promise<void> {
  setMonitoringCorsHeaders(res);

  try {
    // Import performance modules
    const [
      { getGlobalPerformanceSummary, getSessionPerformanceSummary },
      { getQualityStats, getRecentAlerts },
      { getSpeechMetricsSnapshot },
    ] = await Promise.all([
      import('../../services/performance/turn-profiler.js'),
      import('../voice-agent/quality-degradation-monitor.js'),
      import('../../speech/metrics/index.js'),
    ]);

    // Get session ID from query string if provided
    const urlObj = new URL(url, 'http://localhost');
    const sessionId = urlObj.searchParams.get('sessionId');

    if (url === '/api/diagnostics' || url === '/api/diagnostics/summary') {
      // Global summary
      const turnPerf = getGlobalPerformanceSummary();
      const speechMetrics = getSpeechMetricsSnapshot();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            success: true,
            data: {
              overview: {
                totalTurns: turnPerf.totalTurns,
                avgTurnMs: Math.round(turnPerf.avgTurnMs),
                avgTimeToFirstAudioMs: Math.round(turnPerf.avgTtfaMs),
                slowTurnPercentage: `${turnPerf.slowTurnPercentage.toFixed(1)}%`,
              },
              topBottlenecks: turnPerf.topBottlenecks,
              latency: {
                avgAnalysisMs: speechMetrics.metrics.latency.avgAnalysisLatencyMs,
                p99Ms: speechMetrics.metrics.latency.p99LatencyMs,
                samples: speechMetrics.metrics.latency.sampleCount,
              },
              thresholds: {
                excellent: '<300ms',
                good: '<500ms',
                acceptable: '<800ms',
                slow: '<1500ms',
                critical: '≥1500ms',
              },
              help: {
                sessionDiagnostics: '/api/diagnostics/session?sessionId=<id>',
                pipelineBreakdown: '/api/diagnostics/pipeline',
              },
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
      return;
    }

    if (url.startsWith('/api/diagnostics/session') && sessionId) {
      // Per-session diagnostics
      const sessionSummary = getSessionPerformanceSummary(sessionId);
      const qualityStats = getQualityStats(sessionId);
      const alerts = getRecentAlerts(sessionId, 10);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            success: true,
            sessionId,
            data: {
              performance: sessionSummary || { message: 'No performance data for this session' },
              quality: {
                gemini: {
                  avgLatencyMs: Math.round(qualityStats.gemini.avgLatencyMs),
                  errorRate: `${(qualityStats.gemini.errorRate * 100).toFixed(1)}%`,
                  samples: qualityStats.gemini.sampleCount,
                },
                cartesia: {
                  avgLatencyMs: Math.round(qualityStats.cartesia.avgLatencyMs),
                  errorRate: `${(qualityStats.cartesia.errorRate * 100).toFixed(1)}%`,
                  samples: qualityStats.cartesia.sampleCount,
                },
                response: qualityStats.response,
              },
              recentAlerts: alerts.map((a) => ({
                category: a.category,
                severity: a.severity,
                message: a.message,
                time: new Date(a.timestamp).toISOString(),
              })),
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
      return;
    }

    if (url === '/api/diagnostics/pipeline') {
      // Pipeline stage breakdown with targets
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            success: true,
            data: {
              pipeline: [
                {
                  stage: 'STT (Speech-to-Text)',
                  target: '<50ms',
                  description: 'Transcribes user speech',
                },
                {
                  stage: 'Message Analysis',
                  target: '<50ms',
                  description: 'Intent, emotion, safety checks',
                },
                {
                  stage: 'Context Building',
                  target: '<100ms',
                  description: 'Memory, persona, tools context',
                },
                {
                  stage: 'LLM (Gemini)',
                  target: '<200ms TTFT',
                  description: 'Generates response (biggest variable)',
                },
                {
                  stage: 'TTS (Cartesia)',
                  target: '<150ms TTFB',
                  description: 'Text to speech synthesis',
                },
                {
                  stage: 'Audio Playback',
                  target: 'Immediate',
                  description: 'WebRTC audio delivery',
                },
              ],
              totalTarget: '<400ms to first audio',
              commonIssues: [
                {
                  issue: 'Cold start',
                  symptom: 'First response slow',
                  fix: 'Instance warming up, wait for second turn',
                },
                {
                  issue: 'Complex query',
                  symptom: 'Variable delay',
                  fix: 'LLM needs more tokens for nuanced response',
                },
                {
                  issue: 'Tool execution',
                  symptom: 'Pause before response',
                  fix: 'Ferni checking calendar/habits/memories',
                },
                {
                  issue: 'Network latency',
                  symptom: 'Consistent delay',
                  fix: 'Check your internet connection',
                },
              ],
              debugTips: [
                'Enable frontend logging: window.ferniLatency.enable()',
                'View session summary: window.ferniLatency.summary()',
                'View turn history: window.ferniLatency.history()',
              ],
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
      return;
    }

    // Unknown diagnostics endpoint
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown diagnostics endpoint' }));
  } catch (error) {
    log.error({ error: String(error), url }, 'Diagnostics API error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Diagnostics unavailable', details: String(error) }));
  }
}
