/**
 * GCE Voice Worker
 *
 * Unified worker for Google Compute Engine deployment.
 * Uses the single-process pattern for optimal GCE performance.
 *
 * Architecture:
 * - Single process handles multiple concurrent sessions
 * - Pre-warmed resources (VAD, TTS connections, persona configs)
 * - Clean orchestrator-based session management
 * - Horizontal scaling via GCE instance group
 *
 * This file has been refactored into focused modules:
 * - gce/warmup.ts - Resource warming
 * - gce/job-executor.ts - Job execution
 * - gce/livekit-connection.ts - WebSocket connection
 *
 * Usage:
 *   node dist/agents/gce-voice-worker.js start
 *   node dist/agents/worker.js start  (backwards compatibility)
 *
 * @module agents/gce-voice-worker
 */

import 'dotenv/config';

import { GCE_WORKER_STARTUP_DELAY_MS, GCE_WORKER_READINESS_DELAY_MS } from '../config/timeouts.js';

// ============================================================================
// GLOBAL ERROR HANDLERS (Must be first - prevents process crashes)
// ============================================================================

import { registerGlobalErrorHandlers } from '../utils/safe-fire-and-forget.js';
import { registerInterval } from '../utils/interval-manager.js';
registerGlobalErrorHandlers();

// ============================================================================
// STARTUP LOGGING
// ============================================================================

const _startTime = Date.now();
const log = (msg: string, data?: Record<string, unknown>): void => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[${new Date().toISOString()}] [worker] ${msg}${dataStr}\n`);
};

log('🚀 GCE Voice Worker starting', {
  pid: process.pid,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development',
});

// ============================================================================
// CONFIGURATION
// ============================================================================

const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// ============================================================================
// CRITICAL ENV VAR CHECK (Fast-fail before any heavy initialization)
// ============================================================================

/**
 * Critical environment variables required for production operation.
 * Missing any of these will cause the worker to fail immediately with a clear error.
 */
const CRITICAL_ENV_VARS = [
  { name: 'LIVEKIT_URL', value: LIVEKIT_URL, purpose: 'Voice agent connection' },
  { name: 'LIVEKIT_API_KEY', value: LIVEKIT_API_KEY, purpose: 'LiveKit authentication' },
  { name: 'LIVEKIT_API_SECRET', value: LIVEKIT_API_SECRET, purpose: 'LiveKit authentication' },
];

// In production, also require persistence config
if (process.env.NODE_ENV === 'production') {
  CRITICAL_ENV_VARS.push({
    name: 'GOOGLE_CLOUD_PROJECT',
    value: process.env.GOOGLE_CLOUD_PROJECT || '',
    purpose: 'Firestore persistence (required in production)',
  });
}

const missingVars = CRITICAL_ENV_VARS.filter((v) => !v.value);

if (missingVars.length > 0) {
  log('🚨 CRITICAL: Missing required environment variables!');
  log('================================================================================');
  for (const v of missingVars) {
    log(`  ❌ ${v.name} - ${v.purpose}`);
  }
  log('================================================================================');
  log('The worker cannot start without these variables.');
  log('');
  log('To fix: Redeploy with `ferni deploy gce` which sets all required env vars.');
  log('');
  process.exit(1);
}

// ============================================================================
// PHASE 1: HEALTH SERVER (Immediate)
// ============================================================================

log('Phase 1: Starting health server');

import { startHealthCheckServer } from './shared/health-server.js';
startHealthCheckServer(AGENT_NAME);

// ============================================================================
// PHASE 1.5: START CONTAINER WATCHDOG (Self-monitoring + Auto-cleanup)
// ============================================================================

log('Phase 1.5: Starting container watchdog');

import { startWatchdog, stopWatchdog } from '../services/deployment/container-watchdog.js';
startWatchdog({
  diskWarningPercent: 70,
  diskCriticalPercent: 85,
  diskEmergencyPercent: 95,
  autoCleanupEnabled: true,
  diskCheckIntervalMs: 60_000,
  memoryCheckIntervalMs: 30_000,
  healthReportIntervalMs: 3600_000,
});

log('✅ Container watchdog started');

// Start Ops Orchestrator (unified monitoring & alerting)
import { startOpsOrchestrator } from '../services/ops-orchestrator.js';
startOpsOrchestrator({
  costHourlyWarning: 5,
  costDailyWarning: 50,
  costDailyCritical: 100,
  latencyP99Warning: 2000,
  latencyP99Critical: 5000,
  errorRateWarning: 0.05,
  errorRateCritical: 0.1,
});

log('✅ Ops orchestrator started');

// Start Call Quality Monitor (disconnect patterns, connection success rates)
import { startCallQualityMonitor } from '../services/analytics/call-quality-monitor.js';
startCallQualityMonitor({
  connectionSuccessRateWarning: 0.95,
  connectionSuccessRateCritical: 0.9,
  firstResponseTimeWarningMs: 3000,
  firstResponseTimeCriticalMs: 5000,
  disconnectRateWarning: 0.05,
  disconnectRateCritical: 0.1,
  qualityCheckIntervalMs: 60_000,
  alertCooldownMs: 300_000,
  enableSlack: true,
});

log('✅ Call quality monitor started');

// ============================================================================
// PHASE 2: LOAD MODULES
// ============================================================================

log('Phase 2: Loading modules');
const moduleLoadStart = Date.now();

import { initializeLogger } from '@livekit/agents';

// Import extracted GCE modules
import {
  warmupResources,
  getJobMetrics,
  initLiveKitConnection,
  connectToLiveKit,
  cleanupStaleWorkers,
  closeConnection,
  prepareForShutdown,
  stopPingKeepalive,
  stopPendingJobsCleanup,
} from './gce/index.js';

import { markLivekitDisconnected, signalPrewarmComplete } from './shared/worker-readiness.js';

// Initialize crash analytics early for comprehensive crash detection
import { initCrashAnalytics, getCrashSummary } from './shared/crash-analytics.js';
initCrashAnalytics();
log('✅ Crash analytics initialized');

// ============================================================================
// PHASE 2.5: START ASYNC BACKGROUND WORKERS
// ============================================================================

log('Phase 2.5: Starting async background workers');

// Configure AsyncEvents dependency injection BEFORE starting workers that need it.
// Previously this was only done in Phase 3 (global-services.ts), which meant the
// deep extraction worker would start without event listeners.
import { configureAsyncEvents } from '../memory/dynamic/async-events-config.js';
import { AsyncEvents } from '../services/async-events/index.js';
try {
  configureAsyncEvents({
    emit: (event, data) => AsyncEvents.emit(event as never, data as Record<string, unknown>),
    on: (event, handler) => AsyncEvents.on(event as never, handler),
  });
  log('✅ AsyncEvents configured for memory workers');
} catch (diError) {
  log('⚠️ AsyncEvents DI setup failed (deep extraction will be disabled)', {
    error: String(diError),
  });
}

// Start Deep Extraction Worker for LLM-powered memory extraction
// This processes memory jobs queued by fastCapture() in background
import {
  configureSyncService,
  startDeepExtractionWorker,
  startSyncService,
} from '../memory/dynamic/index.js';
startDeepExtractionWorker();
log('✅ Deep extraction worker started');

// Knowledge capture must be ready before first turns — avoids captureTurn no-ops
import { initializeKnowledgeCapture } from '../memory/knowledge-graph/index.js';
void initializeKnowledgeCapture()
  .then(() => log('✅ Knowledge capture initialized'))
  .catch((err) =>
    log('⚠️ Knowledge capture init failed (entity persistence may be delayed)', {
      error: String(err),
    })
  );

// Spanner Graph (L3) is opt-in — idle instances cost ~$65/mo with no data.
// Set SPANNER_ENABLED=true only when a ferni-memory instance is provisioned.
import { initializeSpanner } from '../memory/spanner-graph/client.js';
const spannerEnabled = process.env.SPANNER_ENABLED === 'true';
if (spannerEnabled) {
  initializeSpanner()
    .then((ready) => {
      if (ready) {
        log('✅ Spanner Graph (L3) initialized - long-term memory active');
      } else {
        log('⚠️ Spanner Graph not available - L3 memory disabled (L2 Firestore still works)');
      }
    })
    .catch((err) => {
      log('⚠️ Spanner initialization failed (non-blocking)', { error: String(err) });
    });

  startSyncService();
  log('✅ Firestore → Spanner sync service started');
} else {
  configureSyncService({ enabled: false });
  log('ℹ️ Spanner L3 disabled (SPANNER_ENABLED!=true) — Firestore L2 only');
}

// Start OpenAI health monitor orphan cleanup
// This cleans up stale sessions that exited without calling stopHealthMonitoring()
// Runs every 10 minutes to prevent unbounded Map growth
import { startOrphanCleanup, stopOrphanCleanup } from './shared/openai-health-monitor.js';
startOrphanCleanup();
log('✅ OpenAI health monitor orphan cleanup started');

// Start session cleanup registry orphan cleanup
// This cleans up stale session registries (sessions that crashed without proper cleanup)
// Runs every 15 minutes with 2-hour TTL to prevent unbounded Map growth
import { startRegistryOrphanCleanup, stopRegistryOrphanCleanup } from './session/index.js';
startRegistryOrphanCleanup();
log('✅ Session cleanup registry orphan cleanup started');

// Start session closing tracker orphan cleanup
// This cleans up sessions stuck in "closing" state (crashed before cleanup completed)
// Runs every 2 minutes with 5-minute TTL to prevent unbounded Map growth
import {
  startClosingTrackerCleanup,
  stopClosingTrackerCleanup,
} from './shared/session-closing-tracker.js';
startClosingTrackerCleanup();
log('✅ Session closing tracker orphan cleanup started');

const moduleLoadTime = Date.now() - moduleLoadStart;
log('Modules loaded', { moduleLoadTimeMs: moduleLoadTime });

// Initialize LiveKit SDK logger
// Set to 'debug' for verbose turn monitoring and startup logging
const logLevel = process.env.LOG_LEVEL || 'info';
initializeLogger({ pretty: true, level: logLevel as 'debug' | 'info' | 'warn' | 'error' });

// Initialize LiveKit connection module
initLiveKitConnection(
  {
    url: LIVEKIT_URL,
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    agentName: AGENT_NAME,
  },
  log
);

// ============================================================================
// MAIN STARTUP
// ============================================================================

async function main(): Promise<void> {
  // Phase 3: Warmup resources
  log('Phase 3: Warming resources');
  const warmupResult = await warmupResources(log);
  if (warmupResult.durationMs > 15000) {
    log('⚠️ Warmup verification: warmup took >15s - check for broken or slow modules', {
      durationMs: warmupResult.durationMs,
    });
  }

  // Phase 4: Clean up stale workers from previous crashes, then connect
  log('Phase 4: Cleaning up stale workers and connecting to LiveKit');
  await cleanupStaleWorkers();
  await connectToLiveKit();

  // Signal that prewarm is complete and worker is ready
  signalPrewarmComplete();
  log('✅ Startup complete - worker ready for jobs');

  // Diagnostic summary with crash analytics
  registerInterval(
    'gce-worker-diagnostics',
    () => {
      const metrics = getJobMetrics();
      const crashSummary = getCrashSummary();
      log('Diagnostic summary', {
        uptimeMs: Date.now() - _startTime,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        ...metrics,
        crashes: crashSummary.totalCrashes,
        activeSessions: crashSummary.activeSessions,
        crashRate: crashSummary.crashRate,
      });
    },
    60000
  );

  const totalStartupTime = Date.now() - _startTime;
  log('✅ GCE Voice Worker ready', {
    totalStartupMs: totalStartupTime,
    moduleLoadMs: moduleLoadTime,
    mode: 'SINGLE_PROCESS',
  });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    log('Shutdown already in progress, ignoring duplicate signal');
    return;
  }
  isShuttingDown = true;

  const { activeJobs } = getJobMetrics();
  log(`Received ${signal}, shutting down...`, { activeJobs });

  // 1. Stop watchdog and health monitor
  try {
    stopWatchdog();
    log('Container watchdog stopped');
  } catch {
    // Ignore
  }

  try {
    stopOrphanCleanup();
    log('OpenAI health monitor cleanup stopped');
  } catch {
    // Ignore
  }

  try {
    stopRegistryOrphanCleanup();
    log('Session cleanup registry stopped');
  } catch {
    // Ignore
  }

  try {
    stopClosingTrackerCleanup();
    log('Session closing tracker cleanup stopped');
  } catch {
    // Ignore
  }

  // 2. Mark LiveKit as disconnected and stop keepalive
  markLivekitDisconnected();
  stopPingKeepalive();
  stopPendingJobsCleanup();

  // 3. CRITICAL: Prepare for shutdown BEFORE closing connection
  // This prevents the reconnect race condition that causes native mutex crash
  prepareForShutdown();

  // 4. Close WebSocket (safe now that reconnect is disabled)
  closeConnection();

  // 5. Wait for active jobs to complete (max 30s)
  const shutdownStart = Date.now();
  while (getJobMetrics().activeJobs > 0 && Date.now() - shutdownStart < 30000) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, GCE_WORKER_STARTUP_DELAY_MS);
    });
    log('Waiting for active jobs...', { activeJobs: getJobMetrics().activeJobs });
  }

  const metrics = getJobMetrics();
  log('Shutdown complete', {
    totalJobs: metrics.totalJobs,
    completedJobs: metrics.completedJobs,
    failedJobs: metrics.failedJobs,
  });

  await new Promise<void>((resolve) => {
    setTimeout(resolve, GCE_WORKER_READINESS_DELAY_MS);
  });

  // 7. Exit cleanly
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch((error) => {
  log('❌ Worker startup failed', { error: String(error) });
  process.exit(1);
});
