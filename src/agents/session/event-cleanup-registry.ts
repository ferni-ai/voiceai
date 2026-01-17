/**
 * Event Handler Cleanup Registry
 *
 * Tracks event handlers registered during a session and ensures they're
 * properly cleaned up when the session ends. Prevents memory leaks from
 * orphaned event handlers.
 *
 * @module agents/session/event-cleanup-registry
 */

import { diag } from '../../services/diagnostic-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Registered cleanup handler
 */
interface CleanupHandler {
  id: string;
  type: 'event' | 'timer' | 'subscription' | 'resource';
  description: string;
  cleanup: () => void | Promise<void>;
  registeredAt: number;
}

/**
 * Session cleanup registry state
 */
interface SessionCleanupState {
  handlers: Map<string, CleanupHandler>;
  isCleaningUp: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

// ============================================================================
// REGISTRY STATE
// ============================================================================

const sessionRegistries = new Map<string, SessionCleanupState>();
let handlerIdCounter = 0;

// TTL for orphaned sessions (2 hours) - sessions not accessed within this time are cleaned up
const SESSION_REGISTRY_TTL_MS = 2 * 60 * 60 * 1000;

// Periodic cleanup interval (15 minutes)
const ORPHAN_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Track cleanup interval for shutdown
let orphanCleanupInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get or create cleanup registry for a session
 */
function getRegistry(sessionId: string): SessionCleanupState {
  let registry = sessionRegistries.get(sessionId);
  const now = Date.now();
  if (!registry) {
    registry = {
      handlers: new Map(),
      isCleaningUp: false,
      createdAt: now,
      lastAccessedAt: now,
    };
    sessionRegistries.set(sessionId, registry);
  } else {
    // Update last accessed time
    registry.lastAccessedAt = now;
  }
  return registry;
}

/**
 * Register a cleanup handler for a session.
 * Returns a deregistration function.
 */
export function registerCleanup(
  sessionId: string,
  type: CleanupHandler['type'],
  description: string,
  cleanup: () => void | Promise<void>
): () => void {
  const registry = getRegistry(sessionId);
  const id = `${type}-${++handlerIdCounter}`;

  registry.handlers.set(id, {
    id,
    type,
    description,
    cleanup,
    registeredAt: Date.now(),
  });

  diag.debug(`[cleanup-registry] Registered: ${id} (${description})`);

  // Return deregistration function
  return () => {
    registry.handlers.delete(id);
    diag.debug(`[cleanup-registry] Deregistered: ${id}`);
  };
}

/**
 * Register an event handler with automatic cleanup tracking.
 * Convenience wrapper for event emitter patterns.
 */
export function registerEventHandler<
  T extends {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
  },
>(
  sessionId: string,
  emitter: T,
  event: string,
  handler: (...args: unknown[]) => void,
  description?: string
): () => void {
  // Add the handler
  emitter.on(event, handler);

  // Register cleanup
  return registerCleanup(sessionId, 'event', description || `${event} handler`, () => {
    emitter.off(event, handler);
  });
}

/**
 * Register a timer with automatic cleanup tracking.
 */
export function registerTimer(
  sessionId: string,
  timerId: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>,
  type: 'timeout' | 'interval',
  description?: string
): () => void {
  return registerCleanup(sessionId, 'timer', description || `${type}`, () => {
    if (type === 'timeout') {
      clearTimeout(timerId);
    } else {
      clearInterval(timerId);
    }
  });
}

/**
 * Run all cleanup handlers for a session.
 */
export async function runSessionCleanup(sessionId: string): Promise<{
  cleaned: number;
  errors: number;
  totalDurationMs: number;
}> {
  const registry = sessionRegistries.get(sessionId);
  if (!registry) {
    return { cleaned: 0, errors: 0, totalDurationMs: 0 };
  }

  if (registry.isCleaningUp) {
    diag.warn(`[cleanup-registry] Already cleaning up session ${sessionId}`);
    return { cleaned: 0, errors: 0, totalDurationMs: 0 };
  }

  registry.isCleaningUp = true;
  const startTime = Date.now();
  let cleaned = 0;
  let errors = 0;

  diag.session(`[cleanup-registry] Running cleanup for ${registry.handlers.size} handlers`);

  // Group handlers by type for potential parallelization
  const handlersByType = new Map<string, CleanupHandler[]>();
  for (const handler of registry.handlers.values()) {
    const existing = handlersByType.get(handler.type) || [];
    existing.push(handler);
    handlersByType.set(handler.type, existing);
  }

  // Run cleanup by type (events first, then timers, then others)
  const order: Array<CleanupHandler['type']> = ['event', 'timer', 'subscription', 'resource'];

  for (const type of order) {
    const handlers = handlersByType.get(type) || [];

    // Run handlers of same type in parallel
    const results = await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler.cleanup();
          cleaned++;
        } catch (err) {
          errors++;
          diag.warn(`[cleanup-registry] Cleanup failed: ${handler.id}`, {
            error: String(err),
            description: handler.description,
          });
        }
      })
    );
  }

  // Clear the registry
  sessionRegistries.delete(sessionId);

  const totalDurationMs = Date.now() - startTime;

  diag.session(`[cleanup-registry] Session cleanup complete`, {
    sessionId,
    cleaned,
    errors,
    totalDurationMs,
  });

  return { cleaned, errors, totalDurationMs };
}

/**
 * Get stats about registered handlers for a session.
 */
export function getRegistryStats(sessionId: string): {
  total: number;
  byType: Record<string, number>;
  oldestMs: number | null;
} {
  const registry = sessionRegistries.get(sessionId);
  if (!registry) {
    return { total: 0, byType: {}, oldestMs: null };
  }

  const byType: Record<string, number> = {};
  let oldest: number | null = null;

  for (const handler of registry.handlers.values()) {
    byType[handler.type] = (byType[handler.type] || 0) + 1;
    if (oldest === null || handler.registeredAt < oldest) {
      oldest = handler.registeredAt;
    }
  }

  return {
    total: registry.handlers.size,
    byType,
    oldestMs: oldest ? Date.now() - oldest : null,
  };
}

/**
 * Clear all registries (for testing or shutdown).
 */
export function clearAllRegistries(): void {
  // Stop orphan cleanup interval
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
  }

  const sessionCount = sessionRegistries.size;
  sessionRegistries.clear();
  handlerIdCounter = 0;
  diag.debug(`[cleanup-registry] Cleared all registries (${sessionCount} sessions)`);
}

/**
 * Clean up orphaned session registries that haven't been accessed within TTL.
 * This prevents unbounded memory growth from sessions that don't call runSessionCleanup.
 */
export async function cleanupOrphanedSessions(): Promise<{
  cleaned: number;
  remaining: number;
}> {
  const now = Date.now();
  const orphanedSessions: string[] = [];

  for (const [sessionId, registry] of sessionRegistries.entries()) {
    // Skip sessions currently being cleaned up
    if (registry.isCleaningUp) continue;

    const age = now - registry.lastAccessedAt;
    if (age > SESSION_REGISTRY_TTL_MS) {
      orphanedSessions.push(sessionId);
    }
  }

  if (orphanedSessions.length > 0) {
    diag.warn(`[cleanup-registry] Found ${orphanedSessions.length} orphaned sessions, cleaning up`);
  }

  let cleaned = 0;
  for (const sessionId of orphanedSessions) {
    try {
      await runSessionCleanup(sessionId);
      cleaned++;
    } catch (err) {
      diag.warn(`[cleanup-registry] Failed to cleanup orphaned session ${sessionId}`, {
        error: String(err),
      });
    }
  }

  return { cleaned, remaining: sessionRegistries.size };
}

/**
 * Start periodic orphan cleanup (call once at startup).
 */
export function startOrphanCleanup(): void {
  if (orphanCleanupInterval) {
    diag.debug('[cleanup-registry] Orphan cleanup already running');
    return;
  }

  orphanCleanupInterval = setInterval(() => {
    void cleanupOrphanedSessions().catch((err) => {
      diag.warn('[cleanup-registry] Orphan cleanup failed', { error: String(err) });
    });
  }, ORPHAN_CLEANUP_INTERVAL_MS);

  diag.debug('[cleanup-registry] Started orphan cleanup interval');
}

/**
 * Stop periodic orphan cleanup.
 */
export function stopOrphanCleanup(): void {
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
    diag.debug('[cleanup-registry] Stopped orphan cleanup interval');
  }
}

/**
 * Check if a session is currently in cleanup phase.
 * Use this to prevent race conditions when accessing singletons during cleanup.
 */
export function isSessionCleaningUp(sessionId: string): boolean {
  const registry = sessionRegistries.get(sessionId);
  return registry?.isCleaningUp ?? false;
}

/**
 * Create a session-scoped cleanup tracker.
 * Provides a convenient API for tracking cleanups within a session.
 */
export function createSessionCleanupTracker(sessionId: string) {
  return {
    registerEvent: <
      T extends {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
        off: (event: string, handler: (...args: unknown[]) => void) => void;
      },
    >(
      emitter: T,
      event: string,
      handler: (...args: unknown[]) => void,
      description?: string
    ) => registerEventHandler(sessionId, emitter, event, handler, description),

    registerTimer: (
      timerId: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>,
      type: 'timeout' | 'interval',
      description?: string
    ) => registerTimer(sessionId, timerId, type, description),

    register: (
      type: CleanupHandler['type'],
      description: string,
      cleanup: () => void | Promise<void>
    ) => registerCleanup(sessionId, type, description, cleanup),

    runCleanup: async () => runSessionCleanup(sessionId),

    getStats: () => getRegistryStats(sessionId),
  };
}
