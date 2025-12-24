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

// ============================================================================
// GLOBAL ERROR HANDLERS (Must be first - prevents process crashes)
// ============================================================================

import { registerGlobalErrorHandlers } from '../utils/safe-fire-and-forget.js';
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

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log('ERROR: Missing LiveKit credentials');
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
  closeConnection,
  prepareForShutdown,
  stopPingKeepalive,
  stopPendingJobsCleanup,
} from './gce/index.js';

import { markLivekitDisconnected } from './shared/worker-readiness.js';

// Initialize crash analytics early for comprehensive crash detection
import { initCrashAnalytics, getCrashSummary } from './shared/crash-analytics.js';
initCrashAnalytics();
log('✅ Crash analytics initialized');

const moduleLoadTime = Date.now() - moduleLoadStart;
log('Modules loaded', { moduleLoadTimeMs: moduleLoadTime });

// Initialize LiveKit SDK logger
initializeLogger({ pretty: true, level: 'info' });

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
  await warmupResources(log);

  // Phase 4: Connect to LiveKit
  log('Phase 4: Connecting to LiveKit');
  await connectToLiveKit();

  // Diagnostic summary with crash analytics
  setInterval(() => {
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
  }, 60000);

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

  // 1. Stop watchdog
  try {
    stopWatchdog();
    log('Container watchdog stopped');
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
      setTimeout(resolve, 1000);
    });
    log('Waiting for active jobs...', { activeJobs: getJobMetrics().activeJobs });
  }

  const metrics = getJobMetrics();
  log('Shutdown complete', {
    totalJobs: metrics.totalJobs,
    completedJobs: metrics.completedJobs,
    failedJobs: metrics.failedJobs,
  });

  // 6. Give native modules time to cleanup
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 100);
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
