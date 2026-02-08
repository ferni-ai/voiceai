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
} from '../../services/integrations/developer-webhook-dispatcher.js';
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
export function onSessionEnded(ctx: SessionEventContext & { duration?: number }): void {
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
export function onToolCalled(ctx: ToolEventContext & { args?: Record<string, unknown> }): void {
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
  const {
    sessionId,
    userId,
    personaId,
    publisherId,
    toolName,
    toolDomain,
    result,
    executionTimeMs,
  } = ctx;

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
export function onToolFailed(ctx: ToolEventContext & { error: string }): void {
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

// Built-in personas that don't have publishers
const BUILT_IN_PERSONAS = new Set(['ferni', 'maya', 'peter', 'jordan', 'alex', 'nayan']);

/**
 * Get publisherId from session metadata or persona configuration.
 *
 * Priority order:
 * 1. Session metadata (passed from token generation) - synchronous, fast
 * 2. Marketplace persona lookup - async, requires API call
 *
 * Most calls should use the sync version with session metadata since
 * the token server already resolves publisherId and passes it via room metadata.
 */
export function getPublisherId(
  personaId: string,
  sessionMetadata?: Record<string, unknown>
): string | undefined {
  // Built-in personas never have publishers
  if (BUILT_IN_PERSONAS.has(personaId)) {
    return undefined;
  }

  // Check session metadata first (fastest path)
  if (sessionMetadata?.publisher_id) {
    return sessionMetadata.publisher_id as string;
  }

  // For marketplace/custom personas without session metadata,
  // caller should use getPublisherIdAsync() for dynamic lookup
  return undefined;
}

/**
 * Async version that looks up publisherId from the marketplace registry.
 * Use this when session metadata isn't available.
 */
export async function getPublisherIdAsync(personaId: string): Promise<string | undefined> {
  // Built-in personas never have publishers
  if (BUILT_IN_PERSONAS.has(personaId)) {
    return undefined;
  }

  try {
    // Lazy import to avoid circular dependencies
    const { getAgentAsync } = await import('../../marketplace/registry.js');
    const agent = await getAgentAsync(personaId);
    if (agent?.publisher?.id) {
      log.debug({ personaId, publisherId: agent.publisher.id }, '🔗 Publisher ID resolved');
      return agent.publisher.id;
    }
    return undefined;
  } catch (err) {
    // Non-fatal - fall back to no publisher
    log.debug({ personaId, error: String(err) }, 'Publisher lookup failed (non-fatal)');
    return undefined;
  }
}

export default {
  onSessionStarted,
  onSessionEnded,
  onToolCalled,
  onToolCompleted,
  onToolFailed,
  getPublisherId,
  getPublisherIdAsync,
};
