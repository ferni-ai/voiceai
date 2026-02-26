/**
 * Session Bounded Context
 *
 * Consolidated session lifecycle management for voice agent sessions.
 * All session-related code lives under this directory.
 *
 * @module services/session
 */

// ============================================================================
// SESSION MANAGER (Primary API)
// ============================================================================

export {
  createSessionServices,
  startSessionCleanup,
  stopSessionCleanup,
  getSessionServices,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
} from './session-manager.js';

// ============================================================================
// ACCESS (Additional lookup helpers)
// ============================================================================

export { initializeAccess, hasSession } from './access.js';

// ============================================================================
// CLEANUP (Additional cleanup helpers)
// ============================================================================

export { initializeCleanup, cleanupOrphanedSessions, isCleanupRunning } from './cleanup.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export * from './constants.js';

// ============================================================================
// UTILS
// ============================================================================

export * from './utils.js';

// ============================================================================
// VALIDATION
// ============================================================================

export * from './validation.js';

// ============================================================================
// TTS REGISTRY
// ============================================================================

export * from './tts-registry.js';

// ============================================================================
// SESSION LIFECYCLE HOOKS (Redis pub/sub, outreach, affinity)
// ============================================================================

export * from './session-lifecycle-hooks.js';

// ============================================================================
// COGNITIVE SESSION HOOKS
// ============================================================================

export {
  onCognitiveSessionStart,
  onCognitiveSessionEnd,
  syncCognitiveDataToProfile,
  getCognitiveSessionInfo,
  type CognitiveSessionStartOptions,
  type CognitiveSessionEndOptions,
} from './cognitive-session-hooks.js';

// ============================================================================
// ENGINE FACTORY
// ============================================================================

export * from './engine-factory.js';

// ============================================================================
// SESSION PRIMER
// ============================================================================

export * from './session-primer.js';

// ============================================================================
// PRE-SESSION BRIEFING
// ============================================================================

export {
  generatePreSessionBriefing,
  getTimeAwareGreetingHint,
  createInstantPreSessionBriefing,
  type PreSessionBriefing,
  type TemporalContext,
  type CulturalContext,
  type UserContext,
  type MusicContext,
  type WeatherContext,
} from './pre-session-briefing.js';

// ============================================================================
// SESSION WARMUP
// ============================================================================

export {
  warmSessionCaches,
  warmHandoffCaches,
  clearSessionWarmupCaches,
  setupWarmupOnConnect,
  type WarmupResult,
  type WarmupConfig,
} from './session-warmup.js';

// ============================================================================
// SESSION SUMMARY (Voice ↔ App sync)
// ============================================================================

export * from './session-summary.js';

// ============================================================================
// SESSION DATA MANAGER
// ============================================================================

export {
  getSessionDataManager,
  initializeSessionDataManager,
  shutdownSessionDataManager,
  createSessionCache,
  type SessionDataService,
  type ManagerConfig,
  type TrackedSession,
} from './session-data-manager.js';

// ============================================================================
// SESSION VARIETY TRACKER
// ============================================================================

export {
  SessionVarietyTracker,
  getSessionVarietyTracker,
  resetSessionVarietyTracker,
  type ThemeCategory,
  type PersonalityExpression,
  type SelectionOptions,
} from './session-variety-tracker.js';

// ============================================================================
// HUMANIZING STATE
// ============================================================================

export * from './humanizing-state.js';

// ============================================================================
// END SESSION
// ============================================================================

export * from './end-session.js';

// ============================================================================
// SESSION END CLEANUP
// ============================================================================

export * from './session-end-cleanup.js';

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

export * from './state-persistence.js';

// ============================================================================
// SUMMARIZATION
// ============================================================================

export * from './summarization.js';
