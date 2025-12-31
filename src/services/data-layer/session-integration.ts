/**
 * Session Lifecycle Integration
 *
 * Integrates the unified data layer with session start/end.
 * Handles warming caches, flushing changes, and cleanup.
 *
 * @module services/data-layer/session-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { flushPendingChanges, getIndexingMetrics, resetMetrics } from './store-hooks.js';
import { getUnifiedContext, warmCache, invalidateCache } from './index.js';
import type { UnifiedUserContext } from './types.js';

const log = createLogger({ module: 'session-data-layer' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionDataState {
  userId: string;
  startTime: Date;
  contextLoaded: boolean;
  initialContext?: UnifiedUserContext;
}

const activeSessions = new Map<string, SessionDataState>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Called when a user session starts.
 * Warms caches and loads initial context.
 */
export async function onSessionStart(
  userId: string,
  sessionId: string
): Promise<UnifiedUserContext | null> {
  log.info({ userId, sessionId }, '🚀 Data layer session start');

  const state: SessionDataState = {
    userId,
    startTime: new Date(),
    contextLoaded: false,
  };

  activeSessions.set(sessionId, state);

  try {
    // Warm the cache
    await warmCache(userId);

    // Load initial context
    const context = await getUnifiedContext(userId);
    state.initialContext = context;
    state.contextLoaded = true;

    log.debug(
      {
        userId,
        sessionId,
        summary: context.summary,
      },
      '📊 Session context loaded'
    );

    return context;
  } catch (error) {
    log.warn({ error: String(error), userId, sessionId }, 'Failed to load session context');
    return null;
  }
}

/**
 * Called when a user session ends.
 * Flushes pending changes and cleans up.
 */
export async function onSessionEnd(sessionId: string): Promise<{
  flushed: number;
  errors: number;
  duration: number;
}> {
  const state = activeSessions.get(sessionId);

  if (!state) {
    log.warn({ sessionId }, 'Session end called for unknown session');
    return { flushed: 0, errors: 0, duration: 0 };
  }

  const duration = Date.now() - state.startTime.getTime();

  log.info({ sessionId, userId: state.userId, durationMs: duration }, '👋 Data layer session end');

  try {
    // Flush any pending changes
    const flushResult = await flushPendingChanges();

    // Invalidate cache to free memory
    invalidateCache(state.userId);

    // Remove session state
    activeSessions.delete(sessionId);

    log.info(
      {
        sessionId,
        userId: state.userId,
        flushed: flushResult.flushed,
        errors: flushResult.errors,
        durationMs: duration,
      },
      '✅ Session data layer closed'
    );

    return {
      flushed: flushResult.flushed,
      errors: flushResult.errors,
      duration,
    };
  } catch (error) {
    log.error({ error: String(error), sessionId }, 'Error during session end');
    activeSessions.delete(sessionId);
    return { flushed: 0, errors: 1, duration };
  }
}

/**
 * Get current session state
 */
export function getSessionState(sessionId: string): SessionDataState | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get all active sessions for a user
 */
export function getUserSessions(userId: string): string[] {
  const sessions: string[] = [];
  for (const [sessionId, state] of activeSessions.entries()) {
    if (state.userId === userId) {
      sessions.push(sessionId);
    }
  }
  return sessions;
}

/**
 * Get session metrics
 */
export function getSessionMetrics(): {
  activeSessions: number;
  indexingMetrics: ReturnType<typeof getIndexingMetrics>;
} {
  return {
    activeSessions: activeSessions.size,
    indexingMetrics: getIndexingMetrics(),
  };
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Flush all sessions (call during graceful shutdown)
 */
export async function flushAllSessions(): Promise<{
  sessionsFlushed: number;
  totalChanges: number;
  errors: number;
}> {
  log.info({ count: activeSessions.size }, '🔄 Flushing all sessions');

  let totalChanges = 0;
  let errors = 0;

  const sessionIds = Array.from(activeSessions.keys());

  for (const sessionId of sessionIds) {
    try {
      const result = await onSessionEnd(sessionId);
      totalChanges += result.flushed;
      errors += result.errors;
    } catch (error) {
      log.error({ error: String(error), sessionId }, 'Error flushing session');
      errors++;
    }
  }

  // Also flush any orphaned pending changes
  const orphanFlush = await flushPendingChanges();
  totalChanges += orphanFlush.flushed;
  errors += orphanFlush.errors;

  log.info(
    {
      sessionsFlushed: sessionIds.length,
      totalChanges,
      errors,
    },
    '✅ All sessions flushed'
  );

  return {
    sessionsFlushed: sessionIds.length,
    totalChanges,
    errors,
  };
}

/**
 * Register shutdown handler
 */
export function registerShutdownHandler(): void {
  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    log.info('🛑 Shutdown signal received, flushing data layer...');
    await flushAllSessions();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  log.debug('📡 Data layer shutdown handler registered');
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Clear all session state (for testing)
 */
export function clearAllSessions(): void {
  activeSessions.clear();
  resetMetrics();
}
