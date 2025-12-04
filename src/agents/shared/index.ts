/**
 * Shared Agent Utilities
 *
 * Reusable utilities for ALL voice AI agents regardless of persona.
 *
 * Contents:
 * - types.ts: Session types (UserData, DayContext, etc.)
 * - health-server.ts: HTTP health check for Cloud Run
 * - external-apis.ts: Stock quotes, weather, historical events
 * - session-setup.ts: Session initialization helpers
 *
 * Usage:
 * ```ts
 * import {
 *   UserData,
 *   startHealthCheckServer,
 *   identifyUserFromMetadata,
 *   setupSessionServices,
 * } from './shared/index.js';
 * ```
 */

// Types
export * from './types.js';

// Health Check Server
export { startHealthCheckServer } from './health-server.js';

// External APIs
export {
  getStockQuote,
  getMarketOverview,
  getWeather,
  getHistoricalEvent,
  getStockFallback,
  getMarketFallback,
  getWeatherFallback,
} from './external-apis.js';

// Session Setup Helpers
export {
  isRealName,
  identifyUserFromMetadata,
  setupSessionServices,
  initializeUserData,
  resetSessionState,
  configureMusicPlayback,
  type IdentificationResult,
  type SessionSetupResult,
} from './session-setup.js';

// Context Building Helpers
export {
  checkEasterEggs,
  getResponseLengthGuidance,
  getTopicTransition,
  getEmotionalArcSummary,
  getActiveTaskCount,
  resetAllConversationSystems,
  duckBackgroundMusic,
  unduckBackgroundMusic,
  type EasterEggResult,
  type LengthGuidance,
  type EmotionalArcSummary,
} from './context-helpers.js';

// Handoff Handler
export {
  createHandoffHandler,
  type HandoffPersona,
  type HandoffEventPayload,
  type LegacyHandoffData,
  type NewHandoffData,
  type VoiceAgentRef,
  type HandoffHandlerConfig,
} from './handoff-handler.js';
