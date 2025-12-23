/**
 * Frontend Crash Reporter Service
 *
 * Captures and reports crashes, errors, and connection issues to the backend
 * for centralized crash analytics.
 *
 * @module services/crash-reporter
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('CrashReporter');

// ============================================================================
// TYPES
// ============================================================================

interface CrashContext {
  sessionId?: string;
  roomName?: string;
  userId?: string;
  personaId?: string;
  connectionState?: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  turnCount?: number;
  lastUserMessage?: string;
  customData?: Record<string, unknown>;
  sessionStartTime?: number;
}

interface CrashReport {
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  sessionId?: string;
  roomName?: string;
  userId?: string;
  personaId?: string;
  connectionState?: string;
  lastActivity?: string;
  turnCount?: number;
  lastUserMessage?: string;
  userAgent?: string;
  url?: string;
  timestamp?: string;
  connectionType?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  customData?: Record<string, unknown>;
}

// ============================================================================
// STATE
// ============================================================================

let currentContext: CrashContext = {};
let isInitialized = false;
let lastActivity = new Date().toISOString();
let turnCount = 0;
let lastUserMessage = '';

// Queue for offline crashes
const crashQueue: CrashReport[] = [];
const MAX_QUEUE_SIZE = 10;

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * Update the current context for crash reports
 */
export function updateCrashContext(context: Partial<CrashContext>): void {
  currentContext = { ...currentContext, ...context };
  lastActivity = new Date().toISOString();
}

/**
 * Record a user message (for crash context)
 */
export function recordUserMessage(message: string): void {
  lastUserMessage = message.slice(0, 200); // Truncate for privacy
  turnCount++;
  lastActivity = new Date().toISOString();
}

/**
 * Reset context (on session end)
 */
export function resetCrashContext(): void {
  currentContext = {};
  turnCount = 0;
  lastUserMessage = '';
}

// ============================================================================
// NETWORK INFO
// ============================================================================

function getNetworkInfo(): { connectionType?: string; effectiveType?: string; downlink?: number; rtt?: number } {
  const nav = navigator as Navigator & {
    connection?: {
      type?: string;
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  };

  if (nav.connection) {
    return {
      connectionType: nav.connection.type,
      effectiveType: nav.connection.effectiveType,
      downlink: nav.connection.downlink,
      rtt: nav.connection.rtt,
    };
  }

  return {};
}

// ============================================================================
// CRASH REPORTING
// ============================================================================

/**
 * Report a crash to the backend
 */
export async function reportCrash(
  error: Error | string,
  additionalContext?: Partial<CrashContext>
): Promise<void> {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  const report: CrashReport = {
    errorName: errorObj.name,
    errorMessage: errorObj.message,
    errorStack: errorObj.stack,
    ...currentContext,
    ...additionalContext,
    lastActivity,
    turnCount,
    lastUserMessage,
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    ...getNetworkInfo(),
  };

  // Log locally
  log.error(
    {
      errorName: report.errorName,
      errorMessage: report.errorMessage,
      sessionId: report.sessionId,
      connectionState: report.connectionState,
      turnCount: report.turnCount,
    },
    `🚨 Crash detected: ${report.errorMessage}`
  );

  // Try to send to backend
  try {
    const response = await fetch('/api/crash-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });

    if (response.ok) {
      const result = await response.json();
      log.info({ crashId: result.crashId }, 'Crash report sent successfully');

      // Flush any queued crashes
      await flushCrashQueue();
    } else {
      // Queue for later
      queueCrash(report);
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to send crash report - queuing');
    queueCrash(report);
  }
}

/**
 * Report a connection drop
 */
export function reportConnectionDrop(
  reason: string,
  wasGraceful: boolean,
  additionalContext?: Record<string, unknown>
): void {
  // Always log for debugging - even graceful disconnects help diagnose issues
  const sessionDurationMs = currentContext.sessionStartTime
    ? Date.now() - currentContext.sessionStartTime
    : undefined;

  const disconnectInfo = {
    reason,
    wasGraceful,
    sessionDurationMs,
    turnCount: currentContext.turnCount,
    lastUserMessage: currentContext.lastUserMessage,
    connectionState: currentContext.connectionState,
    ...additionalContext,
  };

  if (wasGraceful) {
    log.info(disconnectInfo, '🔌 Connection ended gracefully');
    return;
  }

  // Log unexpected disconnect with full context
  log.error(disconnectInfo, '🚨 UNEXPECTED DISCONNECT - reporting to crash analytics');

  void reportCrash(new Error(`Connection dropped: ${reason}`), {
    connectionState: 'disconnected',
    customData: {
      disconnectReason: reason,
      wasGraceful,
      sessionDurationMs,
      turnCount: currentContext.turnCount,
      lastUserMessage: currentContext.lastUserMessage,
      ...additionalContext,
    },
  });
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

function queueCrash(report: CrashReport): void {
  crashQueue.push(report);
  if (crashQueue.length > MAX_QUEUE_SIZE) {
    crashQueue.shift(); // Remove oldest
  }

  // Save to localStorage for persistence across refreshes
  try {
    localStorage.setItem('ferni_crash_queue', JSON.stringify(crashQueue));
  } catch {
    // localStorage might be full or unavailable
  }
}

async function flushCrashQueue(): Promise<void> {
  const queue = [...crashQueue];
  crashQueue.length = 0;

  for (const report of queue) {
    try {
      await fetch('/api/crash-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, fromQueue: true }),
      });
    } catch {
      // Re-queue if still failing
      queueCrash(report);
      break; // Stop trying if we're still offline
    }
  }

  // Clear localStorage
  try {
    localStorage.removeItem('ferni_crash_queue');
  } catch {
    // Ignore
  }
}

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

/**
 * Initialize global error handlers for crash detection
 */
export function initCrashReporter(): void {
  if (isInitialized) {
    log.warn('Crash reporter already initialized');
    return;
  }

  // Global error handler
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    void reportCrash(error, {
      customData: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    void reportCrash(error, {
      customData: { type: 'unhandledrejection' },
    });
  });

  // Connection state changes (offline/online)
  window.addEventListener('offline', () => {
    log.warn('Network offline');
    updateCrashContext({ connectionState: 'disconnected' });
  });

  window.addEventListener('online', () => {
    log.info('Network online');
    void flushCrashQueue();
  });

  // Load any queued crashes from localStorage
  try {
    const stored = localStorage.getItem('ferni_crash_queue');
    if (stored) {
      const queue = JSON.parse(stored) as CrashReport[];
      crashQueue.push(...queue);
    }
  } catch {
    // Ignore
  }

  // Try to flush queue on init
  void flushCrashQueue();

  isInitialized = true;
  log.info('Crash reporter initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const crashReporter = {
  init: initCrashReporter,
  report: reportCrash,
  reportConnectionDrop,
  updateContext: updateCrashContext,
  recordMessage: recordUserMessage,
  resetContext: resetCrashContext,
};

