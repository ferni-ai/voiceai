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
 * - cached-imports.ts: Performance-optimized dynamic imports
 *
 * Usage:
 * ```ts
 * import {
 *   UserData,
 *   startHealthCheckServer,
 *   identifyUserFromMetadata,
 *   setupSessionServices,
 *   getBehavioralContextBuilder,  // Cached import
 * } from './shared/index.js';
 * ```
 */

// Types
export * from './types.js';

// Health Check Server
export { startHealthCheckServer } from './health-server.js';

// External APIs (re-exported from services layer)
export {
  getStockQuote,
  getMarketOverview,
  getWeather,
  getHistoricalEvent,
  getStockFallback,
  getMarketFallback,
  getWeatherFallback,
} from '../../services/external-apis.js';

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

// Handoff System (NEW: Coordinator-based)
export {
  // Types
  type HandoffPersona,
  type HandoffEventPayload,
  type LegacyHandoffData,
  type NewHandoffData,
  type VoiceAgentRef,
} from './handoff/types.js';

export {
  // Event handler (replaces createHandoffHandler)
  createEventHandler,
  createHandoffEventHandler, // Backward-compatible alias
  type EventHandlerConfig,
  type EventHandlerResult,
  // Coordinator adapter
  CoordinatorAdapter,
  createCoordinatorAdapter,
  getSessionAdapter,
  removeSessionAdapter,
  type CoordinatorAdapterConfig,
  type AdapterHandoffResult,
} from './handoff/index.js';

// Cached Imports (performance optimization)
// NOTE: getStartupFunctionsCached was removed - import startup directly from '../../startup.js' if needed
export {
  getBehavioralContextBuilder,
  getEasterEggChecker,
  getTaskManagerCached,
  getPersonaAsyncCached,
  getBundleFunctionsCached,
  getVoiceManagerCached,
  getMusicPlayerCached,
  getIdentifyFromMetadataCached,
  isMusicEnabledCached,
  preloadCommonModules,
  resetCachedModules,
} from '../../services/cached-imports.js';

// Early Logger (for pre-LiveKit initialization)
export { earlyLog, DEBUG_STARTUP } from './early-logger.js';

// Shutdown Handler
export { gracefulShutdown, registerShutdownSignalHandlers } from './shutdown-handler.js';

// Session Closing Tracker (prevents operations during shutdown)
export {
  markSessionClosing,
  isSessionClosing,
  clearSessionClosing,
  getClosingSessionCount,
} from './session-closing-tracker.js';

// Helpers
export { hasSsmlTags, sanitizeUserName } from './helpers.js';

// Performance Optimizations
export * from './performance/index.js';
