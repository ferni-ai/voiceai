/**
 * Session Module
 *
 * Provides session-level orchestration of core modules:
 * - Memory (retrieval, emotional memory)
 * - Intelligence (analysis, context building)
 * - Personality (moments, callbacks, timing)
 * - Conversation (humanization)
 *
 * @module session
 */

export {
  SessionCoordinator,
  clearAllSessionCoordinators,
  getSessionCoordinator,
  removeSessionCoordinator,
  type PostTurnContext,
  type PreTurnContext,
  type SessionCoordinatorConfig,
} from './session-coordinator.js';
