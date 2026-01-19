/**
 * Agent Error Handler
 *
 * Centralized error handling for voice agent sessions including:
 * - Crash recording
 * - AI diagnosis
 * - User notification
 * - Graceful recovery
 *
 * @module agents/agent-error-handler
 */

import { coordinatedSay } from '../speech/coordination/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type SessionPhase =
  | 'deps'
  | 'persona'
  | 'connect'
  | 'session'
  | 'services'
  | 'handlers'
  | 'greeting'
  | 'running';

export interface ErrorContext {
  jobId: string;
  roomName: string;
  sessionId: string;
  phase: SessionPhase;
  startTime: number;
}

export interface SessionErrorHandler {
  session: { turnCount?: number } | null;
  // Room interface is kept minimal to avoid tight coupling with LiveKit Room type
  room: {
    isConnected: boolean;
    // Use unknown for connect since Room.connect requires parameters we may not have
    on: (event: string, cb: () => void) => void;
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handles session errors with full diagnostics and recovery.
 */
export async function handleSessionError(
  error: unknown,
  context: ErrorContext,
  sessionHandler: SessionErrorHandler,
  cleanupHandlers: Array<() => void | Promise<void>>
): Promise<void> {
  const errObj = error instanceof Error ? error : new Error(String(error));

  // Import E2E diagnostics
  const e2eDiagnostics = await import('./shared/e2e-diagnostics.js');
  const { e2e } = e2eDiagnostics;

  e2e.captureError('SESSION', errObj, {
    jobId: context.jobId,
    roomName: context.roomName,
    phase: context.phase,
  });

  process.stderr.write(`[agent-error-handler] ERROR in phase ${context.phase}: ${error}\n`);

  // Record crash in crash analytics
  await recordCrashAnalytics(errObj, context);

  // Try AI diagnosis
  await tryAIDiagnosis(errObj, context, sessionHandler);

  // Run cleanup handlers even on error
  await runCleanupHandlers(cleanupHandlers);

  // Run event cleanup registry
  await runEventCleanup(context.sessionId);

  // Keep room connected if possible
  await keepRoomConnected(sessionHandler);
}

/**
 * Records crash in crash analytics.
 */
async function recordCrashAnalytics(error: Error, context: ErrorContext): Promise<void> {
  try {
    const { recordCrash } = await import('./shared/crash-analytics.js');
    recordCrash('uncaught_exception', error, context.sessionId, {
      roomName: context.roomName,
      connectionState: context.phase,
    });
  } catch {
    // Crash analytics may not be available
  }
}

/**
 * Attempts AI diagnosis of the error.
 */
async function tryAIDiagnosis(
  error: Error,
  context: ErrorContext,
  sessionHandler: SessionErrorHandler
): Promise<void> {
  try {
    const e2eDiagnostics = await import('./shared/e2e-diagnostics.js');
    const { e2e } = e2eDiagnostics;

    const lightweightResilience = await import('./shared/lightweight-resilience.js');
    const { humanizeError } = lightweightResilience;

    const selfHealing = await import('../services/self-healing/index.js');
    const diagnosis = await selfHealing.analyzeFailure([error.message, error.stack || ''], {
      jobId: context.jobId,
      stage: context.phase === 'deps' || context.phase === 'persona' ? 'entry' : 'session',
      timing: { totalMs: Date.now() - context.startTime },
      errorType: error.name,
      errorMessage: error.message,
    });

    e2e.custom('DIAGNOSIS', `AI analysis for session ${context.jobId}`, {
      phase: context.phase,
      rootCause: diagnosis.rootCause,
      confidence: diagnosis.confidence,
      autoFixable: diagnosis.autoFixable,
    });

    if (sessionHandler.session && sessionHandler.room.isConnected && diagnosis.humanExplanation) {
      const humanized = humanizeError(error);
      if (humanized.shouldNotifyUser) {
        try {
          coordinatedSay(context.sessionId, humanized.userMessage, { allowInterruptions: true });
        } catch {
          /* can't speak */
        }
      }
    }
  } catch {
    /* diagnosis is best-effort */
  }
}

/**
 * Runs all cleanup handlers.
 */
async function runCleanupHandlers(
  cleanupHandlers: Array<() => void | Promise<void>>
): Promise<void> {
  for (const cleanup of cleanupHandlers) {
    try {
      await cleanup();
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/**
 * Runs event cleanup registry.
 */
async function runEventCleanup(sessionId: string): Promise<void> {
  try {
    const { runSessionCleanup } = await import('./session/event-cleanup-registry.js');
    const registryResult = await runSessionCleanup(sessionId);
    process.stderr.write(
      `[agent-error-handler] 🧹 Registry cleanup on error: ${registryResult.cleaned} cleaned\n`
    );
  } catch {
    /* ignore registry cleanup errors */
  }
}

/**
 * Waits for room disconnection for graceful shutdown.
 */
async function keepRoomConnected(sessionHandler: SessionErrorHandler): Promise<void> {
  try {
    // Just wait for disconnect event - don't try to reconnect
    await new Promise<void>((resolve) => {
      sessionHandler.room.on('disconnected', () => resolve());
    });
  } catch {
    /* ignore */
  }
}

// ============================================================================
// DISCONNECT HANDLING
// ============================================================================

export interface DisconnectContext {
  sessionId: string;
  roomName: string;
  userId: string | null | undefined;
  personaId?: string;
  startTime: number;
  session: { turnCount?: number } | null;
  room: { remoteParticipants?: { size: number } };
}

/**
 * Handles session disconnect with full diagnostics.
 */
export async function handleDisconnect(reason: unknown, context: DisconnectContext): Promise<void> {
  const disconnectReason = String(reason || 'unknown');
  const sessionDurationMs = Date.now() - context.startTime;

  try {
    const { logDisconnect, analyzeDisconnect } = await import('./shared/disconnect-diagnostics.js');
    const { recordConnectionDrop } = await import('./shared/crash-analytics.js');

    const participantCount = context.room.remoteParticipants?.size ?? 0;

    logDisconnect({
      sessionId: context.sessionId,
      roomName: context.roomName,
      reason: disconnectReason,
      durationMs: sessionDurationMs,
      turnCount: context.session?.turnCount,
      participantCount: participantCount + 1,
      wasActive: sessionDurationMs > 30000,
      userId: context.userId ?? undefined,
      personaId: context.personaId,
    });

    const analysis = analyzeDisconnect({
      sessionId: context.sessionId,
      roomName: context.roomName,
      reason: disconnectReason,
      durationMs: sessionDurationMs,
    });
    recordConnectionDrop(context.sessionId, disconnectReason, analysis.wasGraceful);
  } catch (e) {
    process.stderr.write(
      `[agent-error-handler] 🔌 Disconnected (reason: ${disconnectReason}, duration: ${sessionDurationMs}ms)\n`
    );
    process.stderr.write(`[agent-error-handler] Failed to capture disconnect diagnostics: ${e}\n`);
  }
}

// ============================================================================
// CRASH ANALYTICS SESSION MANAGEMENT
// ============================================================================

export interface CrashAnalyticsSession {
  sessionId: string;
  roomName: string;
  userId?: string;
  personaId?: string;
}

/**
 * Registers a session with crash analytics.
 */
export async function registerCrashAnalyticsSession(config: CrashAnalyticsSession): Promise<void> {
  try {
    const { registerSession } = await import('./shared/crash-analytics.js');
    registerSession(config.sessionId, {
      sessionId: config.sessionId,
      roomName: config.roomName,
      userId: config.userId,
      personaId: config.personaId,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Updates crash analytics session state.
 */
export async function updateCrashAnalyticsState(
  sessionId: string,
  state: 'active' | 'processing' | 'idle' | 'disconnecting'
): Promise<void> {
  try {
    const { updateSessionState } = await import('./shared/crash-analytics.js');
    updateSessionState(sessionId, { state });
  } catch {
    // Non-critical
  }
}

/**
 * Unregisters session from crash analytics.
 */
export async function unregisterCrashAnalyticsSession(
  sessionId: string,
  exitReason: string
): Promise<void> {
  try {
    const { unregisterSession } = await import('./shared/crash-analytics.js');
    unregisterSession(sessionId, exitReason);
  } catch {
    // Non-critical
  }
}
