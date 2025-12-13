/**
 * Configuration Module
 *
 * Central configuration management for the Voice AI application.
 *
 * ## Feature Flag Systems
 *
 * Ferni has three feature flag systems serving different purposes:
 *
 * 1. **Application Flags** (`feature-flags.ts`)
 *    - Static, env-var driven
 *    - Used for: debug toggles, experimental features, life coach domains
 *
 * 2. **Trust System Flags** (`../services/feature-flags.ts`)
 *    - Dynamic, Firestore-backed, user-specific
 *    - Used for: gradual rollout of trust features with kill switches
 *
 * 3. **Voice Humanization Flags** (`voice-humanization-flags.ts`)
 *    - Session-scoped, percentage rollout
 *    - Used for: audio intelligence features (prosody, laughter, rhythm)
 *
 * For a unified API, use:
 *   import { flags } from '../config/unified-flags.js';
 *
 * @module @ferni/config
 */

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

export {
  detectEnvironment,
  getConfig,
  getFirestoreDatabase,
  getGCPProjectId,
  isGoogleCloud,
  isMusicEnabled,
  loadConfig,
  printConfigSummary,
  resetConfig,
  validateConfig,
  type AppConfig,
  type Environment,
} from './environment.js';

// ============================================================================
// UNIFIED FLAGS FACADE (Recommended)
// ============================================================================

export { flags, getFlagsSummary, isAnyDebugEnabled, logFlagState } from './unified-flags.js';

// ============================================================================
// APPLICATION FEATURE FLAGS
// ============================================================================

export {
  emergencyDisableLifeCoachDomain,
  emergencyDisablePersonalJourney,
  getEnabledDebugCategories,
  getEnabledLifeCoachDomains,
  getEvalOpsSampleRate,
  getFeatureFlags,
  getPersonalJourneyRolloutPercent,
  isDebugEnabled,
  isEvalOpsEnabled,
  isEvalOpsFeatureEnabled,
  isExperimentalEnabled,
  isFeatureEnabled,
  isHumanizationEnabled,
  isLifeCoachAnalyticsEnabled,
  isLifeCoachDomainEnabled,
  isPersonalJourneyEnabled,
  isPersonalJourneyFeatureEnabled,
  isUserInPersonalJourneyRollout,
  reloadFeatureFlags,
  resetFeatureFlags,
  setFeatureFlagsForTesting,
  type FeatureFlags,
  type LifeCoachDomain,
  type PersonalJourneyFeature,
} from './feature-flags.js';

// ============================================================================
// VOICE HUMANIZATION FLAGS
// ============================================================================

export {
  DEFAULT_FLAGS as DEFAULT_VOICE_HUMANIZATION_FLAGS,
  DEVELOPMENT_FLAGS as DEVELOPMENT_VOICE_HUMANIZATION_FLAGS,
  getFlags as getVoiceHumanizationFlags,
  getSessionFlags as getVoiceHumanizationSessionFlags,
  initializeFlags as initializeVoiceHumanizationFlags,
  isEnabledForSession as isVoiceHumanizationEnabledForSession,
  isFeatureEnabled as isVoiceHumanizationFeatureEnabled,
  resetFlags as resetVoiceHumanizationFlags,
  STAGING_FLAGS as STAGING_VOICE_HUMANIZATION_FLAGS,
  updateFlags as updateVoiceHumanizationFlags,
  voiceHumanizationFlags,
  type VoiceHumanizationFlags,
} from './voice-humanization-flags.js';

// ============================================================================
// VOICE ACCENT CONFIGURATION (International)
// ============================================================================

export {
  ACCENT_DESCRIPTIONS,
  ACCENT_DISPLAY_NAMES,
  ACCENT_TO_DIALECT,
  createDefaultVoicePreference,
  DEFAULT_ACCENT,
  detectAccentFromLocale,
  detectAccentFromLocales,
  getDialectCode,
  isValidAccent,
  logAccentSelection,
  mergeVoicePreference,
  requiresLocalization,
  SUPPORTED_ACCENTS,
  type CartesiaDialect,
  type EnglishAccent,
  type LocaleDetectionResult,
  type VoicePreference,
} from './voice-accents.js';

// ============================================================================
// VOICE IDS
// ============================================================================

export {
  getVoiceIdForPersona,
  getVoiceIdFromManifest,
  isValidVoiceId,
  logVoiceIdAssignments,
  VOICE_IDS,
} from './voice-ids.js';

// ============================================================================
// HANDOFF TIMING
// ============================================================================

export {
  getPostSoundPause,
  getRateLimitCooldown,
  getTransitionDelay,
  HANDOFF_TIMING,
  isHandoffAllowed,
  TRANSITION_MULTIPLIERS,
  type TransitionStyle,
} from './handoff-timing.js';

// ============================================================================
// INTELLIGENCE CONSTANTS
// ============================================================================

export {
  CACHE,
  COMMUNITY,
  CONVERSATION,
  EMOTION,
  EVOLUTION,
  INTELLIGENCE_CONSTANTS,
  LEARNING,
  PERSISTENCE,
  PROACTIVE,
  THREADING,
} from './intelligence-constants.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { default } from './environment.js';
