/**
 * Health Check Server
 *
 * Simple HTTP server for Cloud Run health checks, cognitive API, and metrics.
 * Starts immediately so health checks pass while LiveKit agent initializes.
 *
 * Used by ALL agents regardless of persona.
 *
 * Endpoints:
 * - GET /health - Liveness check (always returns 200 if server is up)
 * - GET /health/ready - Readiness check (200 only when workers can accept calls)
 * - GET /health/crash-analytics - Crash analytics summary
 * - GET /api/cognitive - Current cognitive state (for dashboard)
 * - GET /api/cognitive/history - Recent cognitive events
 * - GET /api/metrics - Full persistence metrics snapshot
 * - GET /api/metrics/summary - Concise metrics summary
 * - GET /api/metrics/sessions - Active sessions only
 * - GET /api/crash-analytics - Crash analytics summary (alias)
 * - GET /api/crash-analytics/history - Full crash event history
 * - GET /api/diagnostics - Latency summary and bottleneck analysis
 * - GET /api/diagnostics/pipeline - Pipeline stage breakdown with targets
 * - GET /api/diagnostics/session?sessionId=<id> - Per-session diagnostics
 *
 * Deploy Script Integration:
 * The deploy script checks /health/ready before shifting traffic.
 * This ensures zero-downtime deployments - traffic only shifts when workers are ready.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getReadinessState,
  markHealthServerReady,
  type ReadinessState,
} from './worker-readiness.js';

// Debug flag for startup logging
const DEBUG_STARTUP =
  process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

// Safe logger that works during early startup
const log = createLogger({ module: 'health-server' });

// Lazy imports to avoid circular dependencies
let cognitiveBroadcast:
  | typeof import('../../services/cognitive-broadcast.js').cognitiveBroadcast
  | null = null;
let persistenceMetrics:
  | typeof import('../../services/analytics/persistence-metrics.js').persistenceMetrics
  | null = null;
let cognitiveWebSocket: typeof import('../../services/cognitive-websocket.js') | null = null;
let sessionDataManager: ReturnType<
  typeof import('../../services/session-data-manager.js').getSessionDataManager
> | null = null;

async function getCognitiveBroadcast() {
  if (!cognitiveBroadcast) {
    try {
      const module = await import('../../services/cognitive-broadcast.js');
      cognitiveBroadcast = module.cognitiveBroadcast;
    } catch {
      return null;
    }
  }
  return cognitiveBroadcast;
}

async function getPersistenceMetrics() {
  if (!persistenceMetrics) {
    try {
      const module = await import('../../services/analytics/persistence-metrics.js');
      persistenceMetrics = module.persistenceMetrics;
    } catch {
      return null;
    }
  }
  return persistenceMetrics;
}

async function getSessionDataManager() {
  if (!sessionDataManager) {
    try {
      const module = await import('../../services/session-data-manager.js');
      sessionDataManager = module.getSessionDataManager();
    } catch {
      return null;
    }
  }
  return sessionDataManager;
}

async function initWebSocketServer(httpServer: Server) {
  if (!cognitiveWebSocket) {
    try {
      const module = await import('../../services/cognitive-websocket.js');
      cognitiveWebSocket = module;
      module.initCognitiveWebSocket(httpServer);
      if (DEBUG_STARTUP) {
        log.info('Cognitive WebSocket server initialized');
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'Could not initialize WebSocket server');
    }
  }
}

/**
 * Handle cognitive API requests
 */
async function handleCognitiveAPI(url: string, res: ServerResponse): Promise<void> {
  const broadcast = await getCognitiveBroadcast();

  // CORS headers for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!broadcast) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cognitive service not available' }));
    return;
  }

  if (url === '/api/cognitive' || url === '/api/cognitive/state') {
    // Return current cognitive state
    const state = broadcast.getCurrentState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: state,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (url === '/api/cognitive/history') {
    // Return recent event history
    const history = broadcast.getHistory(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: history,
        count: history.length,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Unknown cognitive endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown cognitive endpoint' }));
}

/**
 * Handle cache stats API requests (SessionDataManager)
 */
async function handleCacheAPI(url: string, res: ServerResponse): Promise<void> {
  const sdm = await getSessionDataManager();

  // CORS headers for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!sdm) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SessionDataManager not available' }));
    return;
  }

  if (url === '/api/cache' || url === '/api/cache/stats') {
    // Return cache statistics
    const stats = sdm.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Unknown cache endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown cache endpoint' }));
}

/**
 * Handle memory monitoring API requests
 */
async function handleMemoryAPI(url: string, res: ServerResponse): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { getMemoryMonitor } = await import('../../services/memory/memory-monitor.js');
    const monitor = getMemoryMonitor();

    if (url === '/api/memory' || url === '/api/memory/metrics') {
      // Current memory metrics
      const metrics = await monitor.getMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ success: true, data: metrics, timestamp: new Date().toISOString() })
      );
      return;
    }

    if (url === '/api/memory/history') {
      // Memory metrics history
      const history = monitor.getHistory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ success: true, data: history, timestamp: new Date().toISOString() })
      );
      return;
    }

    if (url === '/api/memory/alerts') {
      // Alert history
      const alerts = monitor.getAlerts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: alerts, timestamp: new Date().toISOString() }));
      return;
    }

    if (url === '/api/memory/cleanup') {
      // Force cleanup
      const result = await monitor.forceCleanup();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: result,
          message: `Cleaned ${result.cleaned} items, freed ~${result.freedMB.toFixed(2)}MB`,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Unknown endpoint
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown memory endpoint' }));
  } catch (error) {
    log.error({ error: String(error), url }, 'Memory API error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Memory monitor not available' }));
  }
}

/**
 * Handle watchdog API requests (container self-monitoring)
 */
async function handleWatchdogAPI(res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { getHealthData } = await import('../../services/deployment/container-watchdog.js');
    const data = getHealthData();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Watchdog API error');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Watchdog not available' }));
  }
}

/**
 * Handle crash analytics API requests
 */
async function handleCrashAnalyticsAPI(url: string, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { getCrashHistory } = await import('./shutdown-handler.js');
    const crashHistory = getCrashHistory();

    // Also get session-level crash analytics if available
    let sessionCrashSummary = null;
    try {
      const { getCrashSummary, getAllActiveSessions } = await import('./crash-analytics.js');
      sessionCrashSummary = {
        ...getCrashSummary(),
        activeSessions: getAllActiveSessions(),
      };
    } catch {
      // Crash analytics not initialized
    }

    if (url === '/health/crash-analytics' || url === '/api/crash-analytics') {
      // Return crash analytics summary
      const memUsage = process.memoryUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            currentUptime: Math.round(process.uptime()),
            crashHistory,
            totalCrashes: crashHistory.length,
            lastCrash: crashHistory.length > 0 ? crashHistory[crashHistory.length - 1] : null,
            // New: Session-level crash analytics
            sessionCrashes: sessionCrashSummary,
            currentMemory: {
              heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
              heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
              rssMB: Math.round(memUsage.rss / 1024 / 1024),
            },
            processInfo: {
              pid: process.pid,
              nodeVersion: process.version,
              platform: process.platform,
              instanceName: process.env.GCE_INSTANCE || 'voiceai-agent',
            },
          },
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (url === '/api/crash-analytics/history') {
      // Return full crash history
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: crashHistory,
          count: crashHistory.length,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Unknown endpoint
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown crash analytics endpoint' }));
  } catch (error) {
    log.warn({ error: String(error) }, 'Crash analytics API error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crash analytics not available', details: String(error) }));
  }
}

/**
 * Handle session metrics API requests
 */
async function handleSessionMetricsAPI(url: string, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { getSessionMetricsSummary, getRawSessionMetrics } = await import('./session-metrics.js');

    if (url === '/api/session-metrics' || url === '/api/session-metrics/summary') {
      const summary = getSessionMetricsSummary();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary, null, 2));
      return;
    }

    if (url === '/api/session-metrics/raw') {
      const raw = getRawSessionMetrics(20);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(raw, null, 2));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown session metrics endpoint' }));
  } catch (error) {
    log.error({ error: String(error) }, 'Session metrics API error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session metrics unavailable' }));
  }
}

/**
 * Handle diagnostics API request - full pipeline breakdown
 */
async function handleDiagnosticsAPI(url: string, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Import performance modules
    const [
      { getGlobalPerformanceSummary, getSessionPerformanceSummary },
      { getQualityStats, getRecentAlerts },
      { getSpeechMetricsSnapshot },
    ] = await Promise.all([
      import('./performance/turn-profiler.js'),
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
                slowTurnPercentage: turnPerf.slowTurnPercentage.toFixed(1) + '%',
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
                  errorRate: (qualityStats.gemini.errorRate * 100).toFixed(1) + '%',
                  samples: qualityStats.gemini.sampleCount,
                },
                cartesia: {
                  avgLatencyMs: Math.round(qualityStats.cartesia.avgLatencyMs),
                  errorRate: (qualityStats.cartesia.errorRate * 100).toFixed(1) + '%',
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

/**
 * Handle warmup API request - keeps worker hot for faster connections
 */
async function handleWarmupAPI(res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { warmupWorker } = await import('./session-metrics.js');
    const result = await warmupWorker();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: result.warmedUp ? 'warmed_up' : 'already_warm',
        ...result,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Warmup API error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Warmup failed', details: String(error) }));
  }
}

/**
 * Handle Prometheus metrics export
 */
async function handlePrometheusMetrics(res: ServerResponse): Promise<void> {
  try {
    const { exportPrometheusMetrics } = await import('../../services/memory/memory-monitor.js');
    const metrics = await exportPrometheusMetrics();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(metrics);
  } catch (error) {
    log.error({ error: String(error) }, 'Prometheus metrics export failed');
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('# Error exporting metrics');
  }
}

/**
 * Handle persistence metrics API requests
 */
async function handleMetricsAPI(url: string, res: ServerResponse): Promise<void> {
  const metrics = await getPersistenceMetrics();

  // CORS headers for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!metrics) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Metrics service not available' }));
    return;
  }

  if (url === '/api/metrics' || url === '/api/metrics/snapshot') {
    // Return full metrics snapshot
    const snapshot = metrics.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: snapshot,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (url === '/api/metrics/summary') {
    // Return summary report (more concise)
    const summary = metrics.getSummaryReport();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (url === '/api/metrics/sessions') {
    // Return only active sessions
    const snapshot = metrics.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: {
          activeSessions: snapshot.activeSessions,
          sessions: snapshot.currentSessions,
        },
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Unknown metrics endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown metrics endpoint' }));
}

/**
 * Start a simple HTTP health check server for Cloud Run
 * This starts immediately so Cloud Run health checks pass while LiveKit agent initializes
 *
 * @param serviceName - Name of the service (e.g., 'voice-agent', 'jack-bogle-agent')
 */
export function startHealthCheckServer(serviceName = 'voice-agent'): void {
  const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 8080;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url || '/';

      // Liveness check - Cloud Run uses this to know the process is alive
      // Always returns 200 if the server is running
      if (url === '/' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: serviceName,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Readiness check - Deploy script uses this before shifting traffic
      // Returns 200 only when workers can actually accept connections
      if (url === '/health/ready') {
        const readiness: ReadinessState = getReadinessState();

        // Return 200 if ready, 503 if not
        const statusCode = readiness.ready ? 200 : 503;

        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: readiness.ready ? 'ready' : 'not_ready',
            service: serviceName,
            ...readiness,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Native Rust module health check - Monitor native vs JS fallback ratio
      // Shows which Rust accelerated functions are being used and performance gains
      if (url === '/health/native') {
        try {
          // Import native module metrics
          const [perfModule, fftModule] = await Promise.all([
            import('../../memory/rust-accelerator.js').catch(() => null),
            import('../../speech/fft-analyzer/native-fft.js').catch(() => null),
          ]);

          // Collect metrics from both modules
          const nativeStatus: Record<string, unknown> = {
            service: serviceName,
            status: 'ok',
            modules: {},
          };

          // @ferni/perf metrics
          if (perfModule) {
            // Check all available native functions from rust-accelerator
            const batchToolScoring = perfModule.isBatchToolScoringNativeAvailable?.() ?? false;
            const injectionDedup = perfModule.isInjectionDeduplicationNativeAvailable?.() ?? false;
            const messageAnalysis = perfModule.isMessageAnalysisNativeAvailable?.() ?? false;
            const emotionalState = perfModule.isEmotionalStateNativeAvailable?.() ?? false;
            const conversationDynamics = perfModule.isConversationDynamicsNativeAvailable?.() ?? false;

            // Consider native available if ANY function is available
            const isPerfNative = batchToolScoring || injectionDedup || messageAnalysis || emotionalState || conversationDynamics;

            nativeStatus.modules = {
              ...nativeStatus.modules as object,
              'rust-perf': {
                available: isPerfNative,
                functions: {
                  batchToolScoring,
                  injectionDeduplication: injectionDedup,
                  messageAnalysis,
                  emotionalState,
                  conversationDynamics,
                },
              },
            };
          }

          // @ferni/audio (FFT) metrics
          if (fftModule) {
            const fftInfo = fftModule.getNativeFftInfo?.();
            const fftMetrics = fftModule.getFftMetrics?.();

            nativeStatus.modules = {
              ...nativeStatus.modules as object,
              'rust-audio': {
                available: fftModule.isNativeFftAvailable?.() ?? false,
                loadError: fftModule.getNativeFftLoadError?.() ?? null,
                libraryInfo: fftInfo ?? null,
                metrics: fftMetrics ? {
                  calls: fftMetrics.calls,
                  totalSamples: fftMetrics.totalSamples,
                  totalTimeMs: fftMetrics.totalTimeMs?.toFixed(3),
                  avgTimeMs: fftMetrics.avgTimeMs?.toFixed(3),
                } : null,
              },
            };
          }

          // Calculate overall status
          const modules = nativeStatus.modules as Record<string, { available: boolean }>;
          const perfAvailable = modules['rust-perf']?.available ?? false;
          const audioAvailable = modules['rust-audio']?.available ?? false;

          if (perfAvailable && audioAvailable) {
            nativeStatus.status = 'fully_native';
          } else if (perfAvailable || audioAvailable) {
            nativeStatus.status = 'partially_native';
          } else {
            nativeStatus.status = 'js_fallback';
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ...nativeStatus,
            timestamp: new Date().toISOString(),
          }, null, 2));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'error',
            error: 'Could not get native module metrics',
            message: String(err),
            timestamp: new Date().toISOString(),
          }));
        }
        return;
      }

      // Gemini health check - Monitor LLM reliability and leakage rates
      // Use this to monitor Gemini function calling health and decide if
      // you need to switch to OpenAI Realtime
      if (url === '/health/gemini') {
        try {
          const { getGeminiHealthMetrics } = await import('./function-call-telemetry.js');
          const metrics = getGeminiHealthMetrics();

          // Return 200 for healthy/degraded, 503 for unhealthy
          const statusCode = metrics.status === 'unhealthy' ? 503 : 200;

          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ...metrics,
              service: serviceName,
              endpoint: '/health/gemini',
              timestamp: new Date().toISOString(),
            })
          );
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Could not get Gemini health metrics',
              message: String(err),
            })
          );
        }
        return;
      }

      // Cognitive API endpoints
      if (url.startsWith('/api/cognitive')) {
        await handleCognitiveAPI(url, res);
        return;
      }

      // Persistence metrics API endpoints
      if (url.startsWith('/api/metrics')) {
        await handleMetricsAPI(url, res);
        return;
      }

      // Cache stats API endpoints (SessionDataManager)
      if (url.startsWith('/api/cache')) {
        await handleCacheAPI(url, res);
        return;
      }

      // Memory monitoring API endpoints
      if (url.startsWith('/api/memory')) {
        await handleMemoryAPI(url, res);
        return;
      }

      // Watchdog API endpoint (container health monitoring)
      if (url === '/api/watchdog' || url === '/api/watchdog/status') {
        await handleWatchdogAPI(res);
        return;
      }

      // Prometheus metrics endpoint
      if (url === '/metrics') {
        await handlePrometheusMetrics(res);
        return;
      }

      // Crash analytics API endpoints
      if (url.startsWith('/health/crash-analytics') || url.startsWith('/api/crash-analytics')) {
        await handleCrashAnalyticsAPI(url, res);
        return;
      }

      // Session metrics API endpoints
      if (url.startsWith('/api/session-metrics')) {
        await handleSessionMetricsAPI(url, res);
        return;
      }

      // Warmup endpoint - keeps worker hot for faster connections
      if (url === '/health/warmup' || url === '/api/warmup') {
        await handleWarmupAPI(res);
        return;
      }

      // Diagnostics endpoint - full pipeline breakdown
      if (url.startsWith('/api/diagnostics')) {
        await handleDiagnosticsAPI(url, res);
        return;
      }

      // 404 for other routes (LiveKit agent will handle /worker)
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    })();
  });

  server.listen(port, '0.0.0.0', () => {
    if (DEBUG_STARTUP) {
      log.info({ serviceName, port }, 'Health check server listening');
    }

    // Mark health server as ready for readiness checks
    markHealthServerReady();

    // Initialize WebSocket server for real-time cognitive updates
    void initWebSocketServer(server);
  });

  server.on('error', (err: Error) => {
    // If port is already in use, LiveKit's server is running - that's fine
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      log.error({ serviceName, error: String(err) }, 'Health check server error');
    }
  });
}
