/**
 * Action History Service (Level 60 - Services)
 *
 * Abstraction for "did we execute this action?" used by honesty guardrail.
 * Implementation is provided by the agent layer at runtime so that
 * intelligence (context-builders) does not depend on agents/.
 *
 * Agents register the implementation when the agent module loads
 * (see agents/shared/action-history.ts).
 *
 * @module services/action-history-service
 */

export interface ActionHistoryQuery {
  actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
  contact?: string;
}

export interface WasHighImpactResult {
  executed: boolean;
  record?: unknown;
  explanation: string;
}

/**
 * Interface for action history used by honesty guardrail.
 * Implemented by agents/shared/action-history and registered at load.
 */
export interface ActionHistoryService {
  wasHighImpactActionExecuted: (
    sessionId: string,
    query: ActionHistoryQuery
  ) => WasHighImpactResult;

  getHumanReadableSummary: (sessionId: string) => string;
}

let implementation: ActionHistoryService | null = null;

/**
 * Register the action history implementation (called by agents at load).
 */
export function setActionHistoryService(impl: ActionHistoryService): void {
  implementation = impl;
}

/**
 * Get the current implementation, if any.
 */
export function getActionHistoryService(): ActionHistoryService | null {
  return implementation;
}

const DEFAULT_NOT_EXECUTED_EXPLANATION =
  "I haven't made any calls, sent any messages, or taken any high-impact actions in our conversation yet.";

const DEFAULT_SUMMARY =
  "In this conversation, I haven't taken any actions like making calls, sending messages, or scheduling events yet.";

/**
 * Check if a high-impact action was executed this session.
 * Delegates to registered implementation, or returns safe default when none.
 */
export function wasHighImpactActionExecuted(
  sessionId: string,
  query: ActionHistoryQuery
): WasHighImpactResult {
  const impl = getActionHistoryService();
  if (impl) {
    return impl.wasHighImpactActionExecuted(sessionId, query);
  }
  return {
    executed: false,
    explanation: DEFAULT_NOT_EXECUTED_EXPLANATION,
  };
}

/**
 * Get human-readable summary of actions this session.
 * Delegates to registered implementation, or returns safe default when none.
 */
export function getHumanReadableSummary(sessionId: string): string {
  const impl = getActionHistoryService();
  if (impl) {
    return impl.getHumanReadableSummary(sessionId);
  }
  return DEFAULT_SUMMARY;
}
