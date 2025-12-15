/**
 * Graceful Shutdown Handler
 *
 * Handles graceful shutdown by flushing all pending data before exit.
 * Also handles uncaught exceptions and unhandled rejections to prevent
 * the agent from silently "cutting out".
 */

import { diag } from '../../services/diagnostic-logger.js';

// Track if we're already shutting down to prevent double-shutdown
let isShuttingDown = false;

// Track uncaught exception count - too many in short period = real problem
let uncaughtExceptionCount = 0;
const EXCEPTION_WINDOW_MS = 60_000; // 1 minute
const MAX_EXCEPTIONS_BEFORE_EXIT = 5;

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
  // MEMORY WARNING HANDLER
  // =========================================================================
  // Node.js doesn't have a built-in memory warning, but we can set up periodic checks
  const MEMORY_CHECK_INTERVAL = 30_000; // Check every 30 seconds
  const MEMORY_WARNING_THRESHOLD = 0.85; // 85% of heap limit
  const MEMORY_CRITICAL_THRESHOLD = 0.95; // 95% of heap limit

  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapLimitMB = 3072; // From NODE_OPTIONS --max-old-space-size

    const heapUsageRatio = heapUsedMB / heapLimitMB;

    if (heapUsageRatio > MEMORY_CRITICAL_THRESHOLD) {
      diag.error('🚨 CRITICAL MEMORY USAGE - agent may crash soon', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        heapLimitMB,
        usagePercent: Math.round(heapUsageRatio * 100),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      });

      // Try to trigger garbage collection if available
      if (global.gc) {
        diag.warn('Triggering manual garbage collection');
        global.gc();
      }
    } else if (heapUsageRatio > MEMORY_WARNING_THRESHOLD) {
      diag.warn('⚠️ HIGH MEMORY USAGE', {
        heapUsedMB: Math.round(heapUsedMB),
        heapLimitMB,
        usagePercent: Math.round(heapUsageRatio * 100),
      });
    }
  }, MEMORY_CHECK_INTERVAL);

  diag.info('Process signal handlers registered', {
    handlers: ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection', 'memoryMonitor'],
  });
}
