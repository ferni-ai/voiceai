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
    /** Cross-session threading */
    crossSessionThreading: boolean;
    /** Proactive insights */
    proactiveInsights: boolean;
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
   * Life Coach Domain features - new coaching tool domains
   */
  lifeCoachDomains: {
    /** Master switch for all life coach domains */
    enabled: boolean;
    /** Crisis & Safety tools (ALWAYS enabled for safety) */
    crisis: boolean;
    /** Health & Fitness tools */
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
  },
  experimental: {
    sessionContext: false,
    abTesting: false,
    voiceEmotionDetection: true,
    crossSessionThreading: true,
    proactiveInsights: true,
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

  // Humanization
  HUMANIZATION_ENABLED: 'humanization.enabled',
  ENABLE_DISFLUENCIES: 'humanization.disfluencies',
  ENABLE_BACKCHANNELS: 'humanization.backchannels',
  ENABLE_EMOTION_MATCHING: 'humanization.emotionMatching',

  // Experimental
  EXPERIMENTAL_SESSION_CONTEXT: 'experimental.sessionContext',
  ENABLE_AB_TESTING: 'experimental.abTesting',
  ENABLE_VOICE_EMOTION: 'experimental.voiceEmotionDetection',

  // Audio
  ENABLE_MUSIC: 'audio.musicEnabled',
  ENABLE_AMBIENT: 'audio.ambientSounds',

  // Integrations
  ENABLE_SPOTIFY: 'integrations.spotify',
  ENABLE_GOOGLE_CALENDAR: 'integrations.googleCalendar',
  ENABLE_EMAIL: 'integrations.email',
  ENABLE_PUSH_NOTIFICATIONS: 'integrations.pushNotifications',

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
    if (!(parts[i] in current)) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
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
  const flags: FeatureFlags = JSON.parse(JSON.stringify(DEFAULT_FLAGS));

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
export function emergencyDisableLifeCoachDomain(
  domain: LifeCoachDomain,
  reason: string
): boolean {
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
