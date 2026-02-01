/**
 * Tool Gateway Module
 *
 * Centralized interface for all tool access in the system.
 *
 * @example
 * ```typescript
 * import { getToolGateway } from './gateway/index.js';
 *
 * // At process start
 * const gateway = getToolGateway();
 * await gateway.warmup();
 *
 * // At session start
 * await gateway.startSession(userId, sessionId, userProfile);
 *
 * // Get tools for agent
 * const tools = gateway.getSessionTools();
 *
 * // On each turn
 * const update = await gateway.onTurnStart(transcript);
 * ```
 */

export {
  getToolGateway,
  resetToolGateway,
  ToolGateway,
  TIER_0_DOMAINS,
  TIER_1_DOMAINS,
  SESSION_START_DOMAINS,
  LOAD_TIME_TARGETS,
  type ToolPrediction,
  type ToolGatewayMetrics,
  type ToolUpdateResult,
  type UserProfile,
  type PredictiveRule,
} from './tool-gateway.js';
