/**
 * Crash Analytics Service
 *
 * Provides comprehensive crash detection, logging, and analysis for voice agent sessions.
 * This service captures:
 * - Uncaught exceptions and unhandled rejections
 * - Session state at time of crash
 * - Connection drops and disconnects
 * - Performance degradation leading to crashes
 *
 * @module crash-analytics
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrashAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface CrashContext {
  sessionId: string;
  roomName?: string;
  userId?: string;
  personaId?: string;
  turnCount?: number;
  lastUserMessage?: string;
  lastAgentMessage?: string;
  connectionState?: string;
  uptimeMs?: number;
  memoryUsageMb?: number;
  activeTools?: string[];
  pendingPromises?: number;
}

export interface CrashEvent {
  id: string;
  timestamp: string;
  type:
    | 'uncaught_exception'
    | 'unhandled_rejection'
    | 'connection_drop'
    | 'timeout'
    | 'manual_report';
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: CrashContext;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recovered: boolean;
}

export interface SessionSnapshot {
  sessionId: string;
  timestamp: string;
  state: 'active' | 'idle' | 'processing' | 'disconnecting';
  turnCount: number;
  lastActivity: string;
  connectionQuality?: 'good' | 'degraded' | 'poor';
  memoryMb: number;
  cpuPercent?: number;
  pendingOperations: string[];
}

// ============================================================================
// STATE
// ============================================================================

const activeSessions = new Map<string, SessionSnapshot>();
const recentCrashes: CrashEvent[] = [];
const MAX_CRASH_HISTORY = 50;

let isInitialized = false;
let crashCount = 0;
let lastCrashTime: number | null = null;

// ============================================================================
// EXPECTED ERRORS (Not real crashes - filter these out)
// ============================================================================

/**
 * These error messages are expected during normal operation and should NOT
 * be logged as crashes. They typically occur during:
 * - User interruptions (generateReply superseded)
 * - Clean session transitions
 * - Network reconnections
 * - LiveKit agent task cleanup
 */
const EXPECTED_ERROR_PATTERNS = [
  // User interrupted the agent - this is normal conversation flow
  'Superseded by new generate_reply call',
  // Clean cancellation during handoffs
  'generation cancelled',
  'Generation cancelled',
  // Clean session cleanup
  'session is closing',
  'Session is closing',
  // LiveKit agent cleanup - happens when participant disconnects and tasks are cancelled
  'Task cancellation timed out',
  // Normal playout completion
  'playout completed',
] as const;

/**
 * Check if an error is expected (not a real crash)
 * Uses duck typing to handle errors from different realms/modules
 */
function isExpectedError(error: Error | unknown): boolean {
  // Duck typing: check if it has message/stack properties (handles cross-realm errors)
  const errorLike = error as { message?: string; stack?: string; name?: string };
  const message = errorLike?.message ?? '';
  const stack = errorLike?.stack ?? '';

  // Also check if the raw error string matches (handles edge cases)
  const rawString = typeof error === 'string' ? error : String(error);

  // Check all possible representations of the error
  const allText = `${message} ${stack} ${rawString}`.toLowerCase();

  return EXPECTED_ERROR_PATTERNS.some((pattern) => allText.includes(pattern.toLowerCase()));
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Register a new session for crash monitoring
 */
export function registerSession(sessionId: string, initialContext: Partial<CrashContext>): void {
  const snapshot: SessionSnapshot = {
    sessionId,
    timestamp: new Date().toISOString(),
    state: 'active',
    turnCount: 0,
    lastActivity: new Date().toISOString(),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    pendingOperations: [],
  };

  activeSessions.set(sessionId, snapshot);

  log.info(
    {
      sessionId,
      userId: initialContext.userId,
      personaId: initialContext.personaId,
      roomName: initialContext.roomName,
      activeSessions: activeSessions.size,
    },
    '📊 [CRASH-ANALYTICS] Session registered for monitoring'
  );
}

/**
 * Update session state (call this frequently during conversation)
 */
export function updateSessionState(
  sessionId: string,
  updates: Partial<SessionSnapshot & { lastUserMessage?: string; lastAgentMessage?: string }>
): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    log.warn({ sessionId }, '📊 [CRASH-ANALYTICS] Attempted to update unregistered session');
    return;
  }

  Object.assign(session, {
    ...updates,
    lastActivity: new Date().toISOString(),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });

  // Store last messages in a separate map for crash context
  if (updates.lastUserMessage || updates.lastAgentMessage) {
    sessionMessages.set(sessionId, {
      lastUserMessage: updates.lastUserMessage || sessionMessages.get(sessionId)?.lastUserMessage,
      lastAgentMessage:
        updates.lastAgentMessage || sessionMessages.get(sessionId)?.lastAgentMessage,
    });
  }
}

const sessionMessages = new Map<string, { lastUserMessage?: string; lastAgentMessage?: string }>();

/**
 * Mark operation as pending (helps identify what was happening during crash)
 */
export function markOperationPending(sessionId: string, operation: string): () => void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.pendingOperations.push(operation);
  }

  // Return cleanup function
  return () => {
    if (session) {
      const idx = session.pendingOperations.indexOf(operation);
      if (idx !== -1) {
        session.pendingOperations.splice(idx, 1);
      }
    }
  };
}

/**
 * Unregister session (call on clean disconnect)
 */
export function unregisterSession(sessionId: string, reason: string): void {
  const session = activeSessions.get(sessionId);

  if (session) {
    log.info(
      {
        sessionId,
        reason,
        turnCount: session.turnCount,
        uptimeMs: Date.now() - new Date(session.timestamp).getTime(),
        finalState: session.state,
      },
      '📊 [CRASH-ANALYTICS] Session unregistered cleanly'
    );
  }

  activeSessions.delete(sessionId);
  sessionMessages.delete(sessionId);
}

// ============================================================================
// CRASH DETECTION & LOGGING
// ============================================================================

/**
 * Record a crash event with full context
 * Returns null if the error is expected (not a real crash)
 */
export function recordCrash(
  type: CrashEvent['type'],
  error: Error | unknown,
  sessionId?: string,
  additionalContext?: Partial<CrashContext>
): CrashEvent | null {
  const errorObj =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : JSON.stringify(error));

  // Skip expected errors - these are normal operation, not crashes
  if (isExpectedError(errorObj)) {
    log.debug(
      { type, errorMessage: errorObj.message, sessionId },
      '📊 [CRASH-ANALYTICS] Ignored expected error (not a crash)'
    );
    return null;
  }

  crashCount++;
  lastCrashTime = Date.now();

  const session = sessionId ? activeSessions.get(sessionId) : undefined;
  const messages = sessionId ? sessionMessages.get(sessionId) : undefined;

  const crashEvent: CrashEvent = {
    id: `crash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    error: {
      name: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack,
    },
    context: {
      sessionId: sessionId || 'unknown',
      ...additionalContext,
      turnCount: session?.turnCount,
      lastUserMessage: messages?.lastUserMessage?.slice(0, 200), // Truncate for logging
      lastAgentMessage: messages?.lastAgentMessage?.slice(0, 200),
      connectionState: session?.state,
      uptimeMs: session ? Date.now() - new Date(session.timestamp).getTime() : undefined,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pendingPromises: session?.pendingOperations.length,
    },
    severity: determineSeverity(type, errorObj),
    recovered: false,
  };

  // Store in recent crashes
  recentCrashes.unshift(crashEvent);
  if (recentCrashes.length > MAX_CRASH_HISTORY) {
    recentCrashes.pop();
  }

  // Log with high visibility
  log.error(
    {
      crashId: crashEvent.id,
      type: crashEvent.type,
      severity: crashEvent.severity,
      errorName: crashEvent.error.name,
      errorMessage: crashEvent.error.message,
      sessionId: crashEvent.context.sessionId,
      userId: crashEvent.context.userId,
      personaId: crashEvent.context.personaId,
      roomName: crashEvent.context.roomName,
      turnCount: crashEvent.context.turnCount,
      lastUserMessage: crashEvent.context.lastUserMessage,
      pendingOperations: session?.pendingOperations,
      uptimeMs: crashEvent.context.uptimeMs,
      memoryMb: crashEvent.context.memoryUsageMb,
      stack: crashEvent.error.stack?.split('\n').slice(0, 10).join('\n'),
    },
    `🚨 [CRASH-ANALYTICS] ${type.toUpperCase()} DETECTED - ${errorObj.message}`
  );

  return crashEvent;
}

/**
 * Record a connection drop (distinct from crash)
 */
export function recordConnectionDrop(
  sessionId: string,
  reason: string,
  wasGraceful: boolean
): CrashEvent | null {
  if (wasGraceful) {
    log.info({ sessionId, reason }, '📊 [CRASH-ANALYTICS] Graceful disconnect');
    unregisterSession(sessionId, reason);
    return null;
  }

  return recordCrash('connection_drop', new Error(`Connection dropped: ${reason}`), sessionId, {
    connectionState: 'dropped',
  });
}

/**
 * Record a timeout (operation took too long)
 */
export function recordTimeout(
  sessionId: string,
  operation: string,
  timeoutMs: number
): CrashEvent | null {
  return recordCrash(
    'timeout',
    new Error(`Operation timed out: ${operation} (${timeoutMs}ms)`),
    sessionId,
    { activeTools: [operation] }
  );
}

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

/**
 * Initialize crash analytics with global error handlers
 */
export function initCrashAnalytics(): void {
  if (isInitialized) {
    log.warn('📊 [CRASH-ANALYTICS] Already initialized');
    return;
  }

  // Uncaught exceptions
  process.on('uncaughtException', (error: Error, origin: string) => {
    log.error(
      {
        errorName: error.name,
        errorMessage: error.message,
        origin,
        stack: error.stack,
      },
      '🚨 [CRASH-ANALYTICS] UNCAUGHT EXCEPTION'
    );

    // Try to find which session this relates to
    const sessionId = findActiveSessionForError(error);
    recordCrash('uncaught_exception', error, sessionId);

    // Log all active sessions at time of crash
    logAllActiveSessions('uncaught_exception');
  });

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));

    // Skip expected errors (like user interruptions, task cancellation) - these are not real crashes
    // IMPORTANT: Check this BEFORE any logging to avoid noisy logs
    if (isExpectedError(error)) {
      log.debug(
        { errorMessage: error.message },
        '📊 [CRASH-ANALYTICS] Ignored expected unhandled rejection'
      );
      return;
    }

    // Only log and record if it's a real unexpected error
    log.error(
      {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        promiseInfo: String(promise),
      },
      '🚨 [CRASH-ANALYTICS] UNHANDLED REJECTION'
    );

    const sessionId = findActiveSessionForError(error);
    recordCrash('unhandled_rejection', error, sessionId);
  });

  // Process warnings (often precursors to crashes)
  process.on('warning', (warning: Error) => {
    log.warn(
      {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      },
      '⚠️ [CRASH-ANALYTICS] Process warning (potential crash precursor)'
    );
  });

  // Before exit (capture final state)
  process.on('beforeExit', (code: number) => {
    log.info(
      {
        exitCode: code,
        activeSessions: activeSessions.size,
        totalCrashes: crashCount,
      },
      '📊 [CRASH-ANALYTICS] Process exiting'
    );
    logAllActiveSessions('before_exit');
  });

  isInitialized = true;
  log.info('📊 [CRASH-ANALYTICS] Initialized with global error handlers');
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get crash analytics summary
 */
export function getCrashSummary(): {
  totalCrashes: number;
  lastCrashTime: string | null;
  activeSessions: number;
  recentCrashes: CrashEvent[];
  crashRate: string;
} {
  const uptimeMs = process.uptime() * 1000;
  const crashRate = uptimeMs > 0 ? ((crashCount / uptimeMs) * 3600000).toFixed(2) : '0';

  return {
    totalCrashes: crashCount,
    lastCrashTime: lastCrashTime ? new Date(lastCrashTime).toISOString() : null,
    activeSessions: activeSessions.size,
    recentCrashes: recentCrashes.slice(0, 10),
    crashRate: `${crashRate} per hour`,
  };
}

/**
 * Get detailed session state for debugging
 */
export function getSessionState(sessionId: string): SessionSnapshot | null {
  return activeSessions.get(sessionId) || null;
}

/**
 * Get all active sessions (for debugging)
 */
export function getAllActiveSessions(): SessionSnapshot[] {
  return Array.from(activeSessions.values());
}

// ============================================================================
// HELPERS
// ============================================================================

function determineSeverity(type: CrashEvent['type'], error: Error): CrashEvent['severity'] {
  // Critical: Process-level crashes
  if (type === 'uncaught_exception') return 'critical';

  // High: Connection drops during active conversation
  if (type === 'connection_drop') return 'high';

  // Medium: Timeouts and unhandled rejections
  if (type === 'timeout' || type === 'unhandled_rejection') return 'medium';

  // Check error message for severity hints
  const msg = error.message.toLowerCase();
  if (msg.includes('fatal') || msg.includes('critical')) return 'critical';
  if (msg.includes('timeout') || msg.includes('connection')) return 'high';

  return 'medium';
}

function findActiveSessionForError(_error: Error): string | undefined {
  // If only one active session, it's probably that one
  if (activeSessions.size === 1) {
    return activeSessions.keys().next().value;
  }

  // Find session with most recent activity
  let mostRecent: { sessionId: string; time: number } | null = null;
  for (const [sessionId, session] of activeSessions) {
    const time = new Date(session.lastActivity).getTime();
    if (!mostRecent || time > mostRecent.time) {
      mostRecent = { sessionId, time };
    }
  }

  return mostRecent?.sessionId;
}

function logAllActiveSessions(trigger: string): void {
  if (activeSessions.size === 0) {
    log.info({ trigger }, '📊 [CRASH-ANALYTICS] No active sessions at time of event');
    return;
  }

  for (const [sessionId, session] of activeSessions) {
    const messages = sessionMessages.get(sessionId);
    log.info(
      {
        trigger,
        sessionId,
        state: session.state,
        turnCount: session.turnCount,
        uptimeMs: Date.now() - new Date(session.timestamp).getTime(),
        lastActivity: session.lastActivity,
        pendingOperations: session.pendingOperations,
        lastUserMessage: messages?.lastUserMessage?.slice(0, 100),
        memoryMb: session.memoryMb,
      },
      `📊 [CRASH-ANALYTICS] Active session state at ${trigger}`
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const crashAnalytics = {
  init: initCrashAnalytics,
  registerSession,
  updateSessionState,
  markOperationPending,
  unregisterSession,
  recordCrash,
  recordConnectionDrop,
  recordTimeout,
  getCrashSummary,
  getSessionState,
  getAllActiveSessions,
};
