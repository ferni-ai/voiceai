/**
 * Developer Webhook Integration for Voice Agent
 *
 * Integrates the developer webhook dispatcher with voice agent events.
 * Only dispatches webhooks when a publisherId is available (developer platform context).
 *
 * Usage in voice agent handlers:
 *   import { onSessionStarted, onSessionEnded } from './developer-webhook-integration.js';
 *
 *   // In session init
 *   await onSessionStarted({ sessionId, userId, personaId, publisherId });
 *
 *   // In cleanup
 *   await onSessionEnded({ sessionId, userId, personaId, publisherId, duration });
 *
 * @module agents/integrations/developer-webhook-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  dispatchSessionStarted,
  dispatchSessionEnded,
  dispatchToolCalled,
  dispatchToolCompleted,
  dispatchToolFailed,
} from '../../services/developer-webhook-dispatcher.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';

const log = getLogger().child({ module: 'developer-webhook-integration' });

// ============================================================================
// TYPES
// ============================================================================

/** Context for session events */
export interface SessionEventContext {
  sessionId: string;
  userId?: string;
  personaId?: string;
  publisherId?: string;
}

/** Context for tool events */
export interface ToolEventContext extends SessionEventContext {
  toolName: string;
  toolDomain: string;
}

// ============================================================================
// SESSION EVENTS
// ============================================================================

/**
 * Dispatch session.started webhook if publisherId is available
 *
 * Call this from session-init-handler.ts after session is initialized.
 */
export function onSessionStarted(ctx: SessionEventContext): void {
  const { sessionId, userId, personaId, publisherId } = ctx;

  // Only dispatch if publisherId is available (developer platform context)
  if (!publisherId) {
    log.debug({ sessionId }, 'No publisherId - skipping webhook dispatch');
    return;
  }

  fireAndForget(
    () =>
      dispatchSessionStarted(publisherId, sessionId, {
        personaId,
        userId,
        data: {
          startedAt: new Date().toISOString(),
        },
      }),
    'session.started webhook'
  );

  log.debug({ sessionId, publisherId }, 'Dispatched session.started webhook');
}

/**
 * Dispatch session.ended webhook if publisherId is available
 *
 * Call this from cleanup-handler.ts during session cleanup.
 */
export function onSessionEnded(
  ctx: SessionEventContext & { duration?: number }
): void {
  const { sessionId, userId, personaId, publisherId, duration } = ctx;

  if (!publisherId) {
    log.debug({ sessionId }, 'No publisherId - skipping webhook dispatch');
    return;
  }

  fireAndForget(
    () =>
      dispatchSessionEnded(publisherId, sessionId, {
        personaId,
        userId,
        duration,
        data: {
          endedAt: new Date().toISOString(),
        },
      }),
    'session.ended webhook'
  );

  log.debug({ sessionId, publisherId, duration }, 'Dispatched session.ended webhook');
}

// ============================================================================
// TOOL EVENTS
// ============================================================================

/**
 * Dispatch tool.called webhook if publisherId is available
 *
 * Call this from tool executor when a tool is invoked.
 */
export function onToolCalled(
  ctx: ToolEventContext & { args?: Record<string, unknown> }
): void {
  const { sessionId, userId, personaId, publisherId, toolName, toolDomain, args } = ctx;

  if (!publisherId) {
    return;
  }

  fireAndForget(
    () =>
      dispatchToolCalled(publisherId, {
        sessionId,
        personaId,
        userId,
        toolName,
        toolDomain,
        args,
      }),
    'tool.called webhook'
  );
}

/**
 * Dispatch tool.completed webhook if publisherId is available
 *
 * Call this from tool executor when a tool completes successfully.
 */
export function onToolCompleted(
  ctx: ToolEventContext & { result?: unknown; executionTimeMs?: number }
): void {
  const { sessionId, userId, personaId, publisherId, toolName, toolDomain, result, executionTimeMs } = ctx;

  if (!publisherId) {
    return;
  }

  fireAndForget(
    () =>
      dispatchToolCompleted(publisherId, {
        sessionId,
        personaId,
        userId,
        toolName,
        toolDomain,
        result,
        executionTimeMs,
      }),
    'tool.completed webhook'
  );
}

/**
 * Dispatch tool.failed webhook if publisherId is available
 *
 * Call this from tool executor when a tool fails.
 */
export function onToolFailed(
  ctx: ToolEventContext & { error: string }
): void {
  const { sessionId, userId, personaId, publisherId, toolName, toolDomain, error } = ctx;

  if (!publisherId) {
    return;
  }

  fireAndForget(
    () =>
      dispatchToolFailed(publisherId, {
        sessionId,
        personaId,
        userId,
        toolName,
        toolDomain,
        error,
      }),
    'tool.failed webhook'
  );
}

// ============================================================================
// CONTEXT HELPER
// ============================================================================

/**
 * Get publisherId from persona or session context
 *
 * This is a placeholder for where publisherId would come from.
 * In practice, it would be:
 * - Loaded from marketplace persona metadata
 * - Passed through from token generation
 * - Retrieved from a custom persona's configuration
 */
export function getPublisherId(
  personaId: string,
  _sessionMetadata?: Record<string, unknown>
): string | undefined {
  // TODO: Look up publisherId from:
  // 1. Marketplace persona metadata
  // 2. Custom persona configuration
  // 3. Session metadata passed from token endpoint

  // For now, built-in personas don't have publisherIds
  const builtInPersonas = ['ferni', 'maya', 'peter', 'jordan', 'alex', 'nayan'];
  if (builtInPersonas.includes(personaId)) {
    return undefined;
  }

  // For marketplace/custom personas, publisherId would be looked up here
  return undefined;
}

export default {
  onSessionStarted,
  onSessionEnded,
  onToolCalled,
  onToolCompleted,
  onToolFailed,
  getPublisherId,
};
