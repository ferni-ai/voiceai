/**
 * Graceful Shutdown Handler
 *
 * Handles graceful shutdown by flushing all pending data before exit.
 * Also handles uncaught exceptions and unhandled rejections to prevent
 * the agent from silently "cutting out".
 *
 * Enhanced features:
 * - Preemptive restart when memory exceeds threshold (before OOM)
 * - Crash analytics with persistence
 * - Slack notifications on crash
 * - Exponential backoff detection for crash loops
 */

import { diag } from '../../services/diagnostic-logger.js';
import { removeUndefined } from '../../utils/firestore-utils.js';

// Track if we're already shutting down to prevent double-shutdown
let isShuttingDown = false;

// Track uncaught exception count - too many in short period = real problem
let uncaughtExceptionCount = 0;
const EXCEPTION_WINDOW_MS = 60_000; // 1 minute
const MAX_EXCEPTIONS_BEFORE_EXIT = 5;

// Memory thresholds for preemptive restart
const MEMORY_PREEMPTIVE_RESTART_THRESHOLD = 0.92; // 92% of heap limit - restart before OOM
const MEMORY_HEAP_LIMIT_MB = parseInt(process.env.NODE_MAX_HEAP_MB || '3072', 10);

// Crash analytics
interface CrashEvent {
  timestamp: string;
  reason: string;
  type: 'exception' | 'memory' | 'livekit' | 'signal' | 'crash_loop';
  memoryUsage?: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  uptimeSeconds: number;
  exceptionCount: number;
}

const crashHistory: CrashEvent[] = [];
const MAX_CRASH_HISTORY = 20;

// Crash loop detection
let recentRestarts: number[] = [];
const CRASH_LOOP_WINDOW_MS = 300_000; // 5 minutes
const CRASH_LOOP_THRESHOLD = 3; // 3 restarts in 5 minutes = crash loop

// ============================================================================
// CRITICAL LIVEKIT ERRORS
// ============================================================================
// These errors indicate the LiveKit worker connection is dead and won't recover.
// The container will pass health checks but can't receive room dispatches.
// Force immediate restart to prevent "zombie" state.
const CRITICAL_LIVEKIT_ERROR_PATTERNS = [
  'runner initialization timed out', // Worker process failed to initialize
  'ERR_IPC_CHANNEL_CLOSED', // IPC channel between main and worker crashed
  'LIVEKIT_CONNECTION_FAILED', // LiveKit server connection failed
  'AgentWorkerFailed', // Worker process crashed
] as const;

/**
 * Check if an error is a critical LiveKit error that requires immediate restart.
 * These errors leave the container in a "zombie" state - health checks pass
 * but the agent can't receive room dispatches from LiveKit.
 */
function isCriticalLiveKitError(error: Error): boolean {
  const errorString = `${error.name} ${error.message} ${error.stack || ''}`;
  return CRITICAL_LIVEKIT_ERROR_PATTERNS.some((pattern) =>
    errorString.toLowerCase().includes(pattern.toLowerCase())
  );
}

// ============================================================================
// CRASH ANALYTICS & NOTIFICATIONS
// ============================================================================

/**
 * Record a crash event for analytics
 */
function recordCrashEvent(reason: string, type: CrashEvent['type']): CrashEvent {
  const memUsage = process.memoryUsage();
  const event: CrashEvent = {
    timestamp: new Date().toISOString(),
    reason,
    type,
    memoryUsage: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
    uptimeSeconds: Math.round(process.uptime()),
    exceptionCount: uncaughtExceptionCount,
  };

  crashHistory.push(event);
  if (crashHistory.length > MAX_CRASH_HISTORY) {
    crashHistory.shift();
  }

  // Also track restart time for crash loop detection
  recentRestarts.push(Date.now());
  recentRestarts = recentRestarts.filter((t) => Date.now() - t < CRASH_LOOP_WINDOW_MS);

  return event;
}

/**
 * Check if we're in a crash loop (too many restarts in short window)
 */
function isInCrashLoop(): boolean {
  return recentRestarts.length >= CRASH_LOOP_THRESHOLD;
}

/**
 * Send crash notification to Slack
 */
async function notifyCrashToSlack(event: CrashEvent): Promise<void> {
  try {
    const { getSlackNotifications } = await import('../../services/slack-notifications.js');
    const slack = getSlackNotifications();

    const severityMap: Record<CrashEvent['type'], 'warning' | 'error'> = {
      exception: 'error',
      memory: 'error',
      livekit: 'error',
      signal: 'warning',
      crash_loop: 'error',
    };

    const inCrashLoop = isInCrashLoop();
    const title = inCrashLoop
      ? `🔄 CRASH LOOP DETECTED: ${event.reason}`
      : `💥 Process Crash: ${event.reason}`;

    await slack.notify({
      type: 'incident_opened',
      title,
      message: inCrashLoop
        ? `Container has restarted ${recentRestarts.length} times in ${CRASH_LOOP_WINDOW_MS / 60000} minutes. Investigating required.`
        : `Voice agent crashed after ${event.uptimeSeconds}s uptime.`,
      severity: severityMap[event.type],
      metadata: {
        crashType: event.type,
        uptimeSeconds: event.uptimeSeconds,
        heapUsedMB: event.memoryUsage?.heapUsedMB,
        heapTotalMB: event.memoryUsage?.heapTotalMB,
        exceptionCount: event.exceptionCount,
        recentRestarts: recentRestarts.length,
        instanceName: process.env.GCE_INSTANCE || 'voiceai-agent',
      },
    });

    diag.info('Crash notification sent to Slack');
  } catch (error) {
    diag.warn('Failed to send crash notification to Slack', { error: String(error) });
  }
}

/**
 * Persist crash analytics to Firestore (async, best-effort)
 */
async function persistCrashAnalytics(event: CrashEvent): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies
    const admin = await import('firebase-admin');

    // Check if already initialized
    const app = admin.apps.length > 0 ? admin.apps[0] : admin.initializeApp();
    if (!app) return;

    const firestore = admin.firestore();
    const instanceId = process.env.GCE_INSTANCE || 'voiceai-agent';
    const docRef = firestore.collection('crash_analytics').doc();

    await docRef.set(
      removeUndefined({
        ...event,
        instanceId,
        environment: process.env.NODE_ENV || 'production',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    );

    diag.info('Crash analytics persisted to Firestore');
  } catch (error) {
    // Silently fail - crash analytics is best-effort
    diag.debug('Failed to persist crash analytics (non-critical)', { error: String(error) });
  }
}

/**
 * Get crash history for diagnostics
 */
export function getCrashHistory(): CrashEvent[] {
  return [...crashHistory];
}

/**
 * Check if preemptive restart is needed due to memory pressure
 */
function shouldPreemptiveRestart(): { needed: boolean; reason?: string } {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapUsageRatio = heapUsedMB / MEMORY_HEAP_LIMIT_MB;

  if (heapUsageRatio >= MEMORY_PREEMPTIVE_RESTART_THRESHOLD) {
    return {
      needed: true,
      reason: `Heap at ${(heapUsageRatio * 100).toFixed(1)}% (${Math.round(heapUsedMB)}MB / ${MEMORY_HEAP_LIMIT_MB}MB) - preemptive restart to avoid OOM`,
    };
  }

  return { needed: false };
}

/**
 * Handle graceful shutdown - flush all pending data before exit
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    diag.warn('Shutdown already in progress, ignoring duplicate signal', { signal });
    return;
  }
  isShuttingDown = true;

  diag.info(`Received ${signal}, initiating graceful shutdown...`);

  // Determine crash type from signal
  const crashTypeMap: Record<string, CrashEvent['type']> = {
    SIGTERM: 'signal',
    SIGINT: 'signal',
    UNCAUGHT_EXCEPTION_THRESHOLD: 'exception',
    LIVEKIT_CRITICAL_ERROR: 'livekit',
    MEMORY_PREEMPTIVE_RESTART: 'memory',
    CRASH_LOOP_DETECTED: 'crash_loop',
  };

  const crashType = crashTypeMap[signal] || 'exception';
  const isNormalShutdown = signal === 'SIGTERM' || signal === 'SIGINT';

  // Record crash event (skip for normal shutdowns)
  if (!isNormalShutdown) {
    const event = recordCrashEvent(signal, crashType);

    // Send notifications in parallel (don't block shutdown)
    void Promise.all([notifyCrashToSlack(event), persistCrashAnalytics(event)]).catch((err) =>
      diag.warn('Crash notification failed', { error: String(err) })
    );
  }

  try {
    // 1. Clear all registered intervals first (prevents new work)
    try {
      const { clearAllIntervals } = await import('../../utils/interval-manager.js');
      const cleared = clearAllIntervals();
      if (cleared > 0) {
        diag.info(`Cleared ${cleared} registered intervals`);
      }
    } catch {
      // Interval manager not initialized
    }

    // 2. Shutdown memory monitor
    try {
      const { stopMemoryMonitoring } = await import('../../services/memory-monitor.js');
      stopMemoryMonitoring();
    } catch {
      // Memory monitor not initialized
    }

    // 3. Shutdown session data manager
    try {
      const { shutdownSessionDataManager } = await import('../../services/session-data-manager.js');
      await shutdownSessionDataManager();
      diag.info('Session data manager shutdown complete');
    } catch {
      // Session data manager not initialized
    }

    // 4. Shutdown services to flush all productivity data
    const { shutdownServices } = await import('../../services/index.js');
    await shutdownServices();
    diag.info('Services shutdown complete');
  } catch (error) {
    diag.error('Error during graceful shutdown', { error: String(error) });
  }

  // Give time for final logs
  setTimeout(() => process.exit(0), 500);
}

/**
 * Register process signal handlers for graceful shutdown
 *
 * IMPORTANT: This includes handlers for uncaughtException and unhandledRejection
 * to prevent the agent from silently "cutting out" when errors occur.
 */
export function registerShutdownSignalHandlers(): void {
  // Standard shutdown signals
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  // =========================================================================
  // UNCAUGHT EXCEPTION HANDLER
  // =========================================================================
  // Instead of immediately crashing, we log the error and continue.
  // Only crash if we get too many exceptions in a short period (indicates real problem).
  // This prevents a single unexpected error from killing all active voice sessions.
  //
  // EXCEPTION: Critical LiveKit errors force IMMEDIATE shutdown because they
  // leave the container in a "zombie" state where health checks pass but the
  // agent can't receive room dispatches from LiveKit Cloud.
  process.on('uncaughtException', (error: Error, origin: string) => {
    // ⚠️ KNOWN ISSUE: fluent-ffmpeg throws "Output stream closed" when WebRTC disconnects
    // This is NOT fatal - it just means the audio stream ended (user disconnected, etc.)
    // LiveKit's BackgroundAudioPlayer doesn't attach error handler to ffmpeg command
    const isFfmpegStreamError =
      error.message?.includes('Output stream closed') ||
      error.message?.includes('Output stream error') ||
      error.stack?.includes('fluent-ffmpeg');

    if (isFfmpegStreamError) {
      diag.warn('⚠️ ffmpeg stream error (non-fatal, user likely disconnected)', {
        error: error.message,
        origin,
        processUptime: process.uptime(),
      });
      // Don't count this toward exception threshold - it's expected behavior
      return;
    }

    uncaughtExceptionCount++;

    // Check for critical LiveKit errors FIRST - these require immediate restart
    // because the container will be in a zombie state (health OK, but can't receive dispatches)
    if (isCriticalLiveKitError(error)) {
      diag.error('🚨 CRITICAL LIVEKIT ERROR - forcing immediate container restart', {
        error: error.message,
        stack: error.stack,
        origin,
        reason:
          'LiveKit worker connection is dead. Container passes health checks but cannot receive room dispatches.',
        action: 'Forcing shutdown to trigger Cloud Run container restart',
        processUptime: process.uptime(),
      });

      // Write to stderr for immediate visibility in Cloud Run logs
      process.stderr.write(
        `\n[CRITICAL LIVEKIT ERROR] ${error.message}\n` +
          `Stack: ${error.stack}\n` +
          `Origin: ${origin}\n` +
          `Action: Forcing container restart to recover LiveKit connection\n\n`
      );

      // Force immediate shutdown - Cloud Run will restart the container
      void gracefulShutdown('LIVEKIT_CRITICAL_ERROR');
      return;
    }

    // Log the error with full context
    diag.error('🚨 UNCAUGHT EXCEPTION - agent may cut out', {
      error: error.message,
      stack: error.stack,
      origin,
      exceptionCount: uncaughtExceptionCount,
      processUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });

    // Also write to stderr for Cloud Run logs
    process.stderr.write(
      `[UNCAUGHT EXCEPTION] ${error.message}\n${error.stack}\nOrigin: ${origin}\n`
    );

    // If we're getting too many exceptions, something is seriously wrong - exit
    if (uncaughtExceptionCount >= MAX_EXCEPTIONS_BEFORE_EXIT) {
      diag.error('Too many uncaught exceptions, forcing shutdown', {
        count: uncaughtExceptionCount,
        threshold: MAX_EXCEPTIONS_BEFORE_EXIT,
      });
      void gracefulShutdown('UNCAUGHT_EXCEPTION_THRESHOLD');
    }

    // Reset counter after window expires
    setTimeout(() => {
      uncaughtExceptionCount = Math.max(0, uncaughtExceptionCount - 1);
    }, EXCEPTION_WINDOW_MS);
  });

  // =========================================================================
  // UNHANDLED REJECTION HANDLER
  // =========================================================================
  // Log but don't crash - unhandled rejections are often recoverable
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    diag.warn('⚠️ UNHANDLED REJECTION - may cause issues', {
      reason: String(reason),
      promise: String(promise),
      processUptime: process.uptime(),
    });

    // Write to stderr for visibility in Cloud Run logs
    process.stderr.write(`[UNHANDLED REJECTION] ${String(reason)}\n`);
  });

  // =========================================================================
  // MEMORY WARNING HANDLER (WITH PREEMPTIVE RESTART)
  // =========================================================================
  // Node.js doesn't have a built-in memory warning, but we can set up periodic checks
  // Enhanced: Will trigger preemptive restart before OOM
  const MEMORY_CHECK_INTERVAL = 30_000; // Check every 30 seconds
  const MEMORY_WARNING_THRESHOLD = 0.85; // 85% of heap limit
  const MEMORY_CRITICAL_THRESHOLD = 0.95; // 95% of heap limit

  let gcAttemptCount = 0;
  const MAX_GC_ATTEMPTS_BEFORE_RESTART = 3;

  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapLimitMB = MEMORY_HEAP_LIMIT_MB;

    const heapUsageRatio = heapUsedMB / heapLimitMB;

    // Check for preemptive restart threshold
    const preemptiveCheck = shouldPreemptiveRestart();
    if (preemptiveCheck.needed) {
      diag.error('🔄 PREEMPTIVE RESTART - memory threshold exceeded', {
        heapUsedMB: Math.round(heapUsedMB),
        heapLimitMB,
        usagePercent: Math.round(heapUsageRatio * 100),
        reason: preemptiveCheck.reason,
      });

      // Write to stderr for immediate visibility
      process.stderr.write(
        `\n[PREEMPTIVE RESTART] ${preemptiveCheck.reason}\n` +
          `Heap: ${Math.round(heapUsedMB)}MB / ${heapLimitMB}MB\n` +
          `Triggering graceful shutdown to prevent OOM kill\n\n`
      );

      void gracefulShutdown('MEMORY_PREEMPTIVE_RESTART');
      return;
    }

    if (heapUsageRatio > MEMORY_CRITICAL_THRESHOLD) {
      diag.error('🚨 CRITICAL MEMORY USAGE - attempting recovery', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        heapLimitMB,
        usagePercent: Math.round(heapUsageRatio * 100),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        gcAttempts: gcAttemptCount,
      });

      // Try to trigger garbage collection if available
      if (global.gc) {
        diag.warn('Triggering manual garbage collection');
        global.gc();
        gcAttemptCount++;

        // If GC isn't helping after several attempts, restart
        if (gcAttemptCount >= MAX_GC_ATTEMPTS_BEFORE_RESTART) {
          diag.error('GC not reducing memory pressure - triggering preemptive restart');
          void gracefulShutdown('MEMORY_PREEMPTIVE_RESTART');
          return;
        }
      }
    } else if (heapUsageRatio > MEMORY_WARNING_THRESHOLD) {
      diag.warn('⚠️ HIGH MEMORY USAGE', {
        heapUsedMB: Math.round(heapUsedMB),
        heapLimitMB,
        usagePercent: Math.round(heapUsageRatio * 100),
      });
      // Reset GC counter if memory dropped back to warning level
      gcAttemptCount = Math.max(0, gcAttemptCount - 1);
    } else {
      // Memory is healthy - reset GC counter
      gcAttemptCount = 0;
    }
  }, MEMORY_CHECK_INTERVAL);

  diag.info('Process signal handlers registered', {
    handlers: [
      'SIGTERM',
      'SIGINT',
      'uncaughtException',
      'unhandledRejection',
      'memoryMonitor',
      'preemptiveRestart',
      'crashAnalytics',
    ],
    config: {
      memoryPreemptiveThreshold: `${MEMORY_PREEMPTIVE_RESTART_THRESHOLD * 100}%`,
      heapLimitMB: MEMORY_HEAP_LIMIT_MB,
      crashLoopWindow: `${CRASH_LOOP_WINDOW_MS / 60000} minutes`,
      crashLoopThreshold: CRASH_LOOP_THRESHOLD,
    },
  });
}
