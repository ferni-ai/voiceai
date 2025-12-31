/**
 * Centralized Feature Flag System
 *
 * Provides a single source of truth for all feature toggles in the application.
 * Replaces scattered process.env.DEBUG_* checks with a typed, centralized system.
 *
 * Usage:
 *   import { getFeatureFlags, isFeatureEnabled } from '../config/feature-flags.js';
 *
 *   // Check if a feature is enabled
 *   if (isFeatureEnabled('humanization.disfluencies')) {
 *     // Apply disfluencies
 *   }
 *
 *   // Get full config
 *   const flags = getFeatureFlags();
 *   if (flags.debug.agent) {
 *     // Debug logging
 *   }
 *
 * @module config/feature-flags
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete feature flags configuration
 */
export interface FeatureFlags {
  /**
   * Humanization features - controls how "human" the agent sounds
   */
  humanization: {
    /** Master switch for all humanization */
    enabled: boolean;
    /** Add disfluencies (um, uh, well...) */
    disfluencies: boolean;
    /** Generate backchannels (mm-hmm, I see...) */
    backchannels: boolean;
    /** Match emotion in voice prosody */
    emotionMatching: boolean;
    /** Active listening behaviors */
    activeListening: boolean;
    /** Memory callbacks (referring to earlier topics) */
    memoryCallbacks: boolean;
    /** Follow-up questions */
    followUpQuestions: boolean;
    /** Speech naturalization (hedges, thinking phrases) */
    speechNaturalization: boolean;
  };

  /**
   * Debug flags - extra logging and diagnostics
   */
  debug: {
    /** General agent debug logging */
    agent: boolean;
    /** Humanization pipeline debug logging */
    humanizing: boolean;
    /** Memory system debug logging */
    memory: boolean;
    /** Tool execution debug logging */
    tools: boolean;
    /** Handoff debug logging */
    handoff: boolean;
    /** Audio/prosody debug logging */
    audio: boolean;
    /** Music player debug logging */
    music: boolean;
    /** iTunes API debug logging */
    itunes: boolean;
  };

  /**
   * Experimental features - may be unstable
   */
  experimental: {
    /** New session context architecture */
    sessionContext: boolean;
    /** A/B testing framework */
    abTesting: boolean;
    /** Voice emotion detection */
    voiceEmotionDetection: boolean;
    /** Gemini multimodal emotion analysis (deeper semantic analysis) */
    geminiEmotionAnalysis: boolean;
    /** Cross-session threading */
    crossSessionThreading: boolean;
    /** Proactive insights */
    proactiveInsights: boolean;
    /** Native Rust audio processing (zero-allocation, lower GC pressure) */
    nativeAudioProcessing: boolean;
    /** Native Rust embedding operations (SIMD-accelerated cosine similarity) */
    nativeEmbeddings: boolean;
    /** Pre-warm context builders at session start for faster first turn */
    contextBuilderPrewarm: boolean;
    /** Use worker threads for embedding operations */
    embeddingWorkerIntegration: boolean;
    /** Batch summarization in SummarizationWorker */
    batchedSummarization: boolean;
    /** Pre-STT audio processing (Rust: AGC, noise suppression, bandwidth extension) */
    preSTTAudioProcessing: boolean;
  };

  /**
   * Personal Journey Awareness - "Better Than Human" memory features
   * Tracks rhythms, milestones, seasonal memories, life chapters
   */
  personalJourney: {
    /** Master switch for personal journey awareness */
    enabled: boolean;
    /** Rhythm tracking (streaks, milestones, consistency) */
    rhythmAwareness: boolean;
    /** Seasonal memory ("this time last year...") */
    seasonalMemory: boolean;
    /** Life chapter detection (career transitions, etc.) */
    chapterDetection: boolean;
    /** Community wisdom ("others on this journey...") */
    communityWisdom: boolean;
    /** Journey-enhanced greetings */
    greetingEnhancement: boolean;
    /** Rollout percentage (0-100) */
    rolloutPercent: number;
  };

  /**
   * Audio/Music features
   */
  audio: {
    /** Music playback */
    musicEnabled: boolean;
    /** Ambient sounds */
    ambientSounds: boolean;
    /** Voice ducking during music */
    voiceDucking: boolean;
  };

  /**
   * Integration features
   */
  integrations: {
    /** Spotify integration */
    spotify: boolean;
    /** Google Calendar */
    googleCalendar: boolean;
    /** Email integrations */
    email: boolean;
    /** Push notifications */
    pushNotifications: boolean;
  };

  /**
   * EvalOps - Quality evaluation features
   */
  evalops: {
    /** Master switch for EvalOps */
    enabled: boolean;
    /** Automatic sampling of conversations */
    autoSampling: boolean;
    /** Voice consistency checks (cheap, heuristic) */
    voiceChecks: boolean;
    /** Full LLM-as-judge evaluation */
    llmEvaluation: boolean;
    /** Scheduled test suite runs */
    scheduledSuites: boolean;
    /** Alert on flagged responses */
    alerting: boolean;
    /** Sample rate percentage (0-100) */
    sampleRate: number;
  };

  /**
   * Life Coach Domain features - new coaching tool domains
   */
  lifeCoachDomains: {
    /** Master switch for all life coach domains */
    enabled: boolean;
    /** Crisis & Safety tools (ALWAYS enabled for safety) */
    crisis: boolean;
    /** Wearable integration tools */
    health: boolean;
    /** Career & Professional tools */
    career: boolean;
    /** Decision Support tools */
    decisions: boolean;
    /** Family & Parenting tools */
    family: boolean;
    /** Home & Living tools */
    home: boolean;
    /** Education & Learning tools */
    learning: boolean;
    /** Creativity & Hobbies tools */
    creativity: boolean;
    /** Community & Impact tools */
    community: boolean;
    /** Legal & Administrative tools */
    legalAdmin: boolean;
    /** Track tool usage analytics */
    analytics: boolean;
  };

  /**
   * Outreach system - proactive user engagement (SMS, email, push, calls)
   * Currently disabled due to architecture issues - being extracted to separate workers
   * See: docs/architecture/OUTREACH-WORKER-ARCHITECTURE.md
   */
  outreach: {
    /** Master switch for outreach system */
    enabled: boolean;
    /** Create triggers from session analysis */
    triggerCreation: boolean;
    /** Initialize outreach engine on startup */
    systemInitialization: boolean;
    /** Process and evaluate triggers */
    triggerProcessing: boolean;
    /** Actually deliver outreach messages */
    delivery: boolean;
  };

  /**
   * Easter eggs and special moments
   */
  easterEggs: {
    /** Master switch for all easter eggs */
    enabled: boolean;
    /** Holiday greetings (Christmas, New Year, etc.) */
    holidayGreetings: boolean;
    /** Seasonal messages */
    seasonalMessages: boolean;
    /** Achievement celebrations */
    achievements: boolean;
    /** Random fun moments */
    randomMoments: boolean;
  };
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_FLAGS: FeatureFlags = {
  humanization: {
    enabled: true,
    disfluencies: true,
    backchannels: true,
    emotionMatching: true,
    activeListening: true,
    memoryCallbacks: true,
    followUpQuestions: true,
    speechNaturalization: true,
  },
  debug: {
    agent: false,
    humanizing: false,
    memory: false,
    tools: false,
    handoff: false,
    audio: false,
    music: false,
    itunes: false,
  },
  experimental: {
    sessionContext: false,
    abTesting: false,
    voiceEmotionDetection: true,
    geminiEmotionAnalysis: false, // Disabled by default - enable with ENABLE_GEMINI_EMOTION=true
    crossSessionThreading: true,
    proactiveInsights: true,
    nativeAudioProcessing: process.env.USE_NATIVE_AUDIO !== 'false', // Enabled by default, disable with USE_NATIVE_AUDIO=false
    nativeEmbeddings: process.env.USE_NATIVE_EMBEDDINGS !== 'false', // Enabled by default, disable with USE_NATIVE_EMBEDDINGS=false
    /** Pre-warm context builders at session start for faster first turn */
    contextBuilderPrewarm: process.env.DISABLE_CONTEXT_PREWARM !== 'true', // Enabled by default
    /** Use worker threads for embedding operations */
    embeddingWorkerIntegration: process.env.DISABLE_EMBEDDING_WORKER !== 'true', // Enabled by default
    /** Batch summarization in SummarizationWorker */
    batchedSummarization: process.env.DISABLE_BATCHED_SUMMARIZATION !== 'true', // Enabled by default
    /** Pre-STT audio processing (Rust: AGC, noise suppression, bandwidth extension) */
    preSTTAudioProcessing: process.env.USE_PRE_STT_PROCESSING !== 'false', // Enabled by default
  },
  personalJourney: {
    enabled: true,
    rhythmAwareness: true,
    seasonalMemory: true,
    chapterDetection: true,
    communityWisdom: true,
    greetingEnhancement: true,
    rolloutPercent: 100, // Full rollout - use feature flag to disable if needed
  },
  audio: {
    musicEnabled: true,
    ambientSounds: false,
    voiceDucking: true,
  },
  integrations: {
    spotify: true,
    googleCalendar: true,
    email: true,
    pushNotifications: true,
  },
  evalops: {
    enabled: true,
    autoSampling: true,
    voiceChecks: true,
    llmEvaluation: false, // Start with heuristic-only
    scheduledSuites: false,
    alerting: true,
    sampleRate: 5, // 5% sampling by default
  },
  lifeCoachDomains: {
    enabled: true,
    crisis: true, // ALWAYS enabled for safety
    health: true,
    career: true,
    decisions: true,
    family: true,
    home: true,
    learning: true,
    creativity: true,
    community: true,
    legalAdmin: true,
    analytics: true,
  },
  outreach: {
    enabled: true, // Enabled for user-initiated calls ("call me", "have Maya call me")
    triggerCreation: false, // Disabled - no AI-initiated triggers
    systemInitialization: true, // Initialize outreach engine
    triggerProcessing: false, // Disabled - no automatic trigger processing
    delivery: true, // Enabled - actually make calls when user requests
  },
  easterEggs: {
    enabled: true, // Master switch for easter eggs
    holidayGreetings: false, // DISABLED - Holiday greetings are too aggressive right now
    seasonalMessages: true, // Seasonal awareness
    achievements: true, // Milestone celebrations
    randomMoments: true, // Fun random moments
  },
};

// ============================================================================
// ENVIRONMENT VARIABLE MAPPING
// ============================================================================

/**
 * Map environment variables to feature flag paths
 */
const ENV_MAPPINGS: Record<string, string> = {
  // Debug flags
  DEBUG_AGENT: 'debug.agent',
  DEBUG_HUMANIZING: 'debug.humanizing',
  DEBUG_MEMORY: 'debug.memory',
  DEBUG_TOOLS: 'debug.tools',
  DEBUG_HANDOFF: 'debug.handoff',
  DEBUG_AUDIO: 'debug.audio',
  DEBUG_MUSIC: 'debug.music',
  DEBUG_ITUNES: 'debug.itunes',

  // Humanization
  HUMANIZATION_ENABLED: 'humanization.enabled',
  ENABLE_DISFLUENCIES: 'humanization.disfluencies',
  ENABLE_BACKCHANNELS: 'humanization.backchannels',
  ENABLE_EMOTION_MATCHING: 'humanization.emotionMatching',

  // Experimental
  EXPERIMENTAL_SESSION_CONTEXT: 'experimental.sessionContext',
  ENABLE_AB_TESTING: 'experimental.abTesting',
  ENABLE_VOICE_EMOTION: 'experimental.voiceEmotionDetection',
  ENABLE_GEMINI_EMOTION: 'experimental.geminiEmotionAnalysis',
  USE_PRE_STT_PROCESSING: 'experimental.preSTTAudioProcessing',

  // Audio
  ENABLE_MUSIC: 'audio.musicEnabled',
  ENABLE_AMBIENT: 'audio.ambientSounds',

  // Integrations
  ENABLE_SPOTIFY: 'integrations.spotify',
  ENABLE_GOOGLE_CALENDAR: 'integrations.googleCalendar',
  ENABLE_EMAIL: 'integrations.email',
  ENABLE_PUSH_NOTIFICATIONS: 'integrations.pushNotifications',

  // EvalOps
  EVALOPS_ENABLED: 'evalops.enabled',
  EVALOPS_AUTO_SAMPLING: 'evalops.autoSampling',
  EVALOPS_VOICE_CHECKS: 'evalops.voiceChecks',
  EVALOPS_LLM_EVALUATION: 'evalops.llmEvaluation',
  EVALOPS_SCHEDULED_SUITES: 'evalops.scheduledSuites',
  EVALOPS_ALERTING: 'evalops.alerting',
  EVALOPS_SAMPLE_RATE: 'evalops.sampleRate',

  // Personal Journey Awareness
  PERSONAL_JOURNEY_ENABLED: 'personalJourney.enabled',
  PERSONAL_JOURNEY_RHYTHM: 'personalJourney.rhythmAwareness',
  PERSONAL_JOURNEY_SEASONAL: 'personalJourney.seasonalMemory',
  PERSONAL_JOURNEY_CHAPTERS: 'personalJourney.chapterDetection',
  PERSONAL_JOURNEY_WISDOM: 'personalJourney.communityWisdom',
  PERSONAL_JOURNEY_GREETINGS: 'personalJourney.greetingEnhancement',
  PERSONAL_JOURNEY_ROLLOUT: 'personalJourney.rolloutPercent',

  // Life Coach Domains
  LIFE_COACH_DOMAINS_ENABLED: 'lifeCoachDomains.enabled',
  LIFE_COACH_CRISIS: 'lifeCoachDomains.crisis',
  LIFE_COACH_HEALTH: 'lifeCoachDomains.health',
  LIFE_COACH_CAREER: 'lifeCoachDomains.career',
  LIFE_COACH_DECISIONS: 'lifeCoachDomains.decisions',
  LIFE_COACH_FAMILY: 'lifeCoachDomains.family',
  LIFE_COACH_HOME: 'lifeCoachDomains.home',
  LIFE_COACH_LEARNING: 'lifeCoachDomains.learning',
  LIFE_COACH_CREATIVITY: 'lifeCoachDomains.creativity',
  LIFE_COACH_COMMUNITY: 'lifeCoachDomains.community',
  LIFE_COACH_LEGAL_ADMIN: 'lifeCoachDomains.legalAdmin',
  LIFE_COACH_ANALYTICS: 'lifeCoachDomains.analytics',

  // Outreach
  OUTREACH_ENABLED: 'outreach.enabled',
  OUTREACH_TRIGGER_CREATION: 'outreach.triggerCreation',
  OUTREACH_SYSTEM_INIT: 'outreach.systemInitialization',
  OUTREACH_TRIGGER_PROCESSING: 'outreach.triggerProcessing',
  OUTREACH_DELIVERY: 'outreach.delivery',

  // Easter Eggs
  EASTER_EGGS_ENABLED: 'easterEggs.enabled',
  EASTER_EGGS_HOLIDAYS: 'easterEggs.holidayGreetings',
  EASTER_EGGS_SEASONAL: 'easterEggs.seasonalMessages',
  EASTER_EGGS_ACHIEVEMENTS: 'easterEggs.achievements',
  EASTER_EGGS_RANDOM: 'easterEggs.randomMoments',
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

let cachedFlags: FeatureFlags | null = null;

/**
 * Parse a string value to boolean
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return undefined;
}

/**
 * Set a nested value in an object using dot notation path
 */
function setNestedValue(obj: Record<string, any>, path: string, value: boolean): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) continue; // Guard for noUncheckedIndexedAccess
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart) {
    current[lastPart] = value;
  }
}

/**
 * Get a nested value from an object using dot notation path
 */
function getNestedValue(obj: Record<string, any>, path: string): boolean | undefined {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return typeof current === 'boolean' ? current : undefined;
}

/**
 * Load feature flags from defaults and environment
 */
function loadFeatureFlags(): FeatureFlags {
  // Start with defaults
  const flags: FeatureFlags = structuredClone(DEFAULT_FLAGS);

  // Override from environment variables
  let overrideCount = 0;
  for (const [envVar, path] of Object.entries(ENV_MAPPINGS)) {
    const envValue = process.env[envVar];
    const boolValue = parseBoolean(envValue);

    if (boolValue !== undefined) {
      setNestedValue(flags as Record<string, any>, path, boolValue);
      overrideCount++;
    }
  }

  if (overrideCount > 0) {
    getLogger().debug({ overrideCount }, 'Feature flags loaded with environment overrides');
  }

  return flags;
}

/**
 * Get the current feature flags configuration
 *
 * @returns The feature flags object
 */
export function getFeatureFlags(): FeatureFlags {
  if (!cachedFlags) {
    cachedFlags = loadFeatureFlags();
  }
  return cachedFlags;
}

/**
 * Check if a specific feature is enabled using dot notation
 *
 * @param path - Dot notation path to the feature (e.g., 'humanization.disfluencies')
 * @returns Whether the feature is enabled
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled('humanization.emotionMatching')) {
 *   // Apply emotion matching
 * }
 * ```
 */
export function isFeatureEnabled(path: string): boolean {
  const flags = getFeatureFlags();
  const value = getNestedValue(flags as Record<string, any>, path);
  return value === true;
}

/**
 * Check if debug logging is enabled for a specific category
 *
 * @param category - Debug category (agent, humanizing, memory, tools, handoff, audio)
 * @returns Whether debug is enabled
 */
export function isDebugEnabled(category: keyof FeatureFlags['debug']): boolean {
  const flags = getFeatureFlags();
  return flags.debug[category] === true;
}

/**
 * Check if an experimental feature is enabled
 *
 * @param feature - Experimental feature name
 * @returns Whether the experimental feature is enabled
 */
export function isExperimentalEnabled(feature: keyof FeatureFlags['experimental']): boolean {
  const flags = getFeatureFlags();
  return flags.experimental[feature] === true;
}

/**
 * Force reload feature flags from environment
 * Useful for testing or when environment changes
 */
export function reloadFeatureFlags(): FeatureFlags {
  cachedFlags = null;
  return getFeatureFlags();
}

/**
 * Override feature flags for testing
 * Use sparingly - only in test environments
 */
export function setFeatureFlagsForTesting(overrides: Partial<FeatureFlags>): void {
  const flags = getFeatureFlags();

  // Deep merge overrides
  const merge = (target: Record<string, any>, source: Record<string, any>) => {
    for (const key of Object.keys(source)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        merge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  };

  merge(flags as Record<string, any>, overrides as Record<string, any>);
  cachedFlags = flags;
}

/**
 * Reset feature flags to defaults (for testing)
 */
export function resetFeatureFlags(): void {
  cachedFlags = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Check if all humanization features are enabled
 */
export function isHumanizationEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.humanization.enabled;
}

/**
 * Get all enabled debug categories
 */
export function getEnabledDebugCategories(): Array<keyof FeatureFlags['debug']> {
  const flags = getFeatureFlags();
  return (Object.keys(flags.debug) as Array<keyof FeatureFlags['debug']>).filter(
    (key) => flags.debug[key]
  );
}

// ============================================================================
// EVALOPS HELPERS
// ============================================================================

/**
 * Check if EvalOps is enabled
 */
export function isEvalOpsEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.evalops.enabled;
}

/**
 * Check if a specific EvalOps feature is enabled
 */
export function isEvalOpsFeatureEnabled(feature: keyof FeatureFlags['evalops']): boolean {
  const flags = getFeatureFlags();
  if (!flags.evalops.enabled) return false;

  if (feature === 'sampleRate') {
    return flags.evalops.sampleRate > 0;
  }

  return flags.evalops[feature] === true;
}

/**
 * Get EvalOps sample rate
 */
export function getEvalOpsSampleRate(): number {
  const flags = getFeatureFlags();
  if (!flags.evalops.enabled) return 0;
  return flags.evalops.sampleRate;
}

// ============================================================================
// LIFE COACH DOMAIN HELPERS
// ============================================================================

export type LifeCoachDomain =
  | 'crisis'
  | 'health'
  | 'career'
  | 'decisions'
  | 'family'
  | 'home'
  | 'learning'
  | 'creativity'
  | 'community'
  | 'legalAdmin';

/**
 * Check if a life coach domain is enabled
 * Note: Crisis domain is ALWAYS enabled for safety, regardless of flags
 */
export function isLifeCoachDomainEnabled(domain: LifeCoachDomain): boolean {
  // Crisis is ALWAYS enabled for safety
  if (domain === 'crisis') return true;

  const flags = getFeatureFlags();
  if (!flags.lifeCoachDomains.enabled) return false;
  return flags.lifeCoachDomains[domain] === true;
}

/**
 * Get all enabled life coach domains
 */
export function getEnabledLifeCoachDomains(): LifeCoachDomain[] {
  const flags = getFeatureFlags();
  const domains: LifeCoachDomain[] = [
    'crisis', // Always included
    'health',
    'career',
    'decisions',
    'family',
    'home',
    'learning',
    'creativity',
    'community',
    'legalAdmin',
  ];

  if (!flags.lifeCoachDomains.enabled) {
    return ['crisis']; // Only crisis when disabled
  }

  return domains.filter((d) => flags.lifeCoachDomains[d]);
}

/**
 * Check if life coach analytics is enabled
 */
export function isLifeCoachAnalyticsEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.lifeCoachDomains.enabled && flags.lifeCoachDomains.analytics;
}

/**
 * Emergency: Disable a life coach domain at runtime
 * Note: Cannot disable crisis domain for safety
 */
export function emergencyDisableLifeCoachDomain(domain: LifeCoachDomain, reason: string): boolean {
  if (domain === 'crisis') {
    getLogger().error({ domain, reason }, 'Cannot disable crisis domain - safety critical');
    return false;
  }

  const flags = getFeatureFlags();
  flags.lifeCoachDomains[domain] = false;
  cachedFlags = flags;

  getLogger().warn({ domain, reason }, 'Life coach domain emergency disabled');
  return true;
}

// ============================================================================
// PERSONAL JOURNEY AWARENESS HELPERS
// ============================================================================

export type PersonalJourneyFeature =
  | 'rhythmAwareness'
  | 'seasonalMemory'
  | 'chapterDetection'
  | 'communityWisdom'
  | 'greetingEnhancement';

/**
 * Check if Personal Journey Awareness is enabled
 */
export function isPersonalJourneyEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.personalJourney.enabled;
}

/**
 * Check if a specific Personal Journey feature is enabled
 */
export function isPersonalJourneyFeatureEnabled(feature: PersonalJourneyFeature): boolean {
  const flags = getFeatureFlags();
  if (!flags.personalJourney.enabled) return false;
  return flags.personalJourney[feature] === true;
}

/**
 * Check if user is in Personal Journey rollout
 * Uses userId hash for consistent rollout assignment
 */
export function isUserInPersonalJourneyRollout(userId: string): boolean {
  const flags = getFeatureFlags();
  if (!flags.personalJourney.enabled) return false;
  if (flags.personalJourney.rolloutPercent >= 100) return true;
  if (flags.personalJourney.rolloutPercent <= 0) return false;

  // Hash userId to get consistent rollout assignment
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const bucket = Math.abs(hash) % 100;
  return bucket < flags.personalJourney.rolloutPercent;
}

/**
 * Get Personal Journey rollout percentage
 */
export function getPersonalJourneyRolloutPercent(): number {
  const flags = getFeatureFlags();
  if (!flags.personalJourney.enabled) return 0;
  return flags.personalJourney.rolloutPercent;
}

/**
 * Emergency: Disable Personal Journey at runtime
 */
export function emergencyDisablePersonalJourney(reason: string): void {
  const flags = getFeatureFlags();
  flags.personalJourney.enabled = false;
  cachedFlags = flags;

  getLogger().warn({ reason }, '🚨 Personal Journey Awareness emergency disabled');
}

// ============================================================================
// OUTREACH HELPERS
// ============================================================================

export type OutreachFeature =
  | 'triggerCreation'
  | 'systemInitialization'
  | 'triggerProcessing'
  | 'delivery';

/**
 * Check if outreach system is enabled
 * Currently disabled - being extracted to separate worker architecture
 * See: docs/architecture/OUTREACH-WORKER-ARCHITECTURE.md
 */
export function isOutreachEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.outreach.enabled;
}

/**
 * Check if a specific outreach feature is enabled
 */
export function isOutreachFeatureEnabled(feature: OutreachFeature): boolean {
  const flags = getFeatureFlags();
  if (!flags.outreach.enabled) return false;
  return flags.outreach[feature] === true;
}

/**
 * Check if outreach trigger creation is enabled
 * Used by session-integration.ts before creating triggers
 */
export function isOutreachTriggerCreationEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.outreach.enabled && flags.outreach.triggerCreation;
}

/**
 * Check if outreach system should initialize on startup
 * Used by global-services.ts before initializing outreach engine
 */
export function isOutreachSystemInitEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.outreach.enabled && flags.outreach.systemInitialization;
}

// ============================================================================
// EASTER EGG HELPERS
// ============================================================================

export type EasterEggFeature =
  | 'holidayGreetings'
  | 'seasonalMessages'
  | 'achievements'
  | 'randomMoments';

/**
 * Check if easter eggs are enabled
 */
export function isEasterEggsEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.easterEggs.enabled;
}

/**
 * Check if a specific easter egg feature is enabled
 */
export function isEasterEggFeatureEnabled(feature: EasterEggFeature): boolean {
  const flags = getFeatureFlags();
  if (!flags.easterEggs.enabled) return false;
  return flags.easterEggs[feature] === true;
}

/**
 * Check if holiday greetings are enabled
 * Used by easter-eggs.ts
 */
export function isHolidayGreetingsEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.easterEggs.enabled && flags.easterEggs.holidayGreetings;
}
