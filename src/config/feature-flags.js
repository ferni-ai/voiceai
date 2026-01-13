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
// DEFAULT VALUES
// ============================================================================
const DEFAULT_FLAGS = {
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
const ENV_MAPPINGS = {
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
let cachedFlags = null;
/**
 * Parse a string value to boolean
 */
function parseBoolean(value) {
    if (value === undefined || value === '')
        return undefined;
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes')
        return true;
    if (lower === 'false' || lower === '0' || lower === 'no')
        return false;
    return undefined;
}
/**
 * Set a nested value in an object using dot notation path
 */
function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part)
            continue; // Guard for noUncheckedIndexedAccess
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
function getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === undefined || current === null)
            return undefined;
        current = current[part];
    }
    return typeof current === 'boolean' ? current : undefined;
}
/**
 * Load feature flags from defaults and environment
 */
function loadFeatureFlags() {
    // Start with defaults
    const flags = structuredClone(DEFAULT_FLAGS);
    // Override from environment variables
    let overrideCount = 0;
    for (const [envVar, path] of Object.entries(ENV_MAPPINGS)) {
        const envValue = process.env[envVar];
        const boolValue = parseBoolean(envValue);
        if (boolValue !== undefined) {
            setNestedValue(flags, path, boolValue);
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
export function getFeatureFlags() {
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
export function isFeatureEnabled(path) {
    const flags = getFeatureFlags();
    const value = getNestedValue(flags, path);
    return value === true;
}
/**
 * Check if debug logging is enabled for a specific category
 *
 * @param category - Debug category (agent, humanizing, memory, tools, handoff, audio)
 * @returns Whether debug is enabled
 */
export function isDebugEnabled(category) {
    const flags = getFeatureFlags();
    return flags.debug[category] === true;
}
/**
 * Check if an experimental feature is enabled
 *
 * @param feature - Experimental feature name
 * @returns Whether the experimental feature is enabled
 */
export function isExperimentalEnabled(feature) {
    const flags = getFeatureFlags();
    return flags.experimental[feature] === true;
}
/**
 * Force reload feature flags from environment
 * Useful for testing or when environment changes
 */
export function reloadFeatureFlags() {
    cachedFlags = null;
    return getFeatureFlags();
}
/**
 * Override feature flags for testing
 * Use sparingly - only in test environments
 */
export function setFeatureFlagsForTesting(overrides) {
    const flags = getFeatureFlags();
    // Deep merge overrides
    const merge = (target, source) => {
        for (const key of Object.keys(source)) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key])
                    target[key] = {};
                merge(target[key], source[key]);
            }
            else {
                target[key] = source[key];
            }
        }
    };
    merge(flags, overrides);
    cachedFlags = flags;
}
/**
 * Reset feature flags to defaults (for testing)
 */
export function resetFeatureFlags() {
    cachedFlags = null;
}
// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================
/**
 * Check if all humanization features are enabled
 */
export function isHumanizationEnabled() {
    const flags = getFeatureFlags();
    return flags.humanization.enabled;
}
/**
 * Get all enabled debug categories
 */
export function getEnabledDebugCategories() {
    const flags = getFeatureFlags();
    return Object.keys(flags.debug).filter((key) => flags.debug[key]);
}
// ============================================================================
// EVALOPS HELPERS
// ============================================================================
/**
 * Check if EvalOps is enabled
 */
export function isEvalOpsEnabled() {
    const flags = getFeatureFlags();
    return flags.evalops.enabled;
}
/**
 * Check if a specific EvalOps feature is enabled
 */
export function isEvalOpsFeatureEnabled(feature) {
    const flags = getFeatureFlags();
    if (!flags.evalops.enabled)
        return false;
    if (feature === 'sampleRate') {
        return flags.evalops.sampleRate > 0;
    }
    return flags.evalops[feature] === true;
}
/**
 * Get EvalOps sample rate
 */
export function getEvalOpsSampleRate() {
    const flags = getFeatureFlags();
    if (!flags.evalops.enabled)
        return 0;
    return flags.evalops.sampleRate;
}
/**
 * Check if a life coach domain is enabled
 * Note: Crisis domain is ALWAYS enabled for safety, regardless of flags
 */
export function isLifeCoachDomainEnabled(domain) {
    // Crisis is ALWAYS enabled for safety
    if (domain === 'crisis')
        return true;
    const flags = getFeatureFlags();
    if (!flags.lifeCoachDomains.enabled)
        return false;
    return flags.lifeCoachDomains[domain] === true;
}
/**
 * Get all enabled life coach domains
 */
export function getEnabledLifeCoachDomains() {
    const flags = getFeatureFlags();
    const domains = [
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
export function isLifeCoachAnalyticsEnabled() {
    const flags = getFeatureFlags();
    return flags.lifeCoachDomains.enabled && flags.lifeCoachDomains.analytics;
}
/**
 * Emergency: Disable a life coach domain at runtime
 * Note: Cannot disable crisis domain for safety
 */
export function emergencyDisableLifeCoachDomain(domain, reason) {
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
/**
 * Check if Personal Journey Awareness is enabled
 */
export function isPersonalJourneyEnabled() {
    const flags = getFeatureFlags();
    return flags.personalJourney.enabled;
}
/**
 * Check if a specific Personal Journey feature is enabled
 */
export function isPersonalJourneyFeatureEnabled(feature) {
    const flags = getFeatureFlags();
    if (!flags.personalJourney.enabled)
        return false;
    return flags.personalJourney[feature] === true;
}
/**
 * Check if user is in Personal Journey rollout
 * Uses userId hash for consistent rollout assignment
 */
export function isUserInPersonalJourneyRollout(userId) {
    const flags = getFeatureFlags();
    if (!flags.personalJourney.enabled)
        return false;
    if (flags.personalJourney.rolloutPercent >= 100)
        return true;
    if (flags.personalJourney.rolloutPercent <= 0)
        return false;
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
export function getPersonalJourneyRolloutPercent() {
    const flags = getFeatureFlags();
    if (!flags.personalJourney.enabled)
        return 0;
    return flags.personalJourney.rolloutPercent;
}
/**
 * Emergency: Disable Personal Journey at runtime
 */
export function emergencyDisablePersonalJourney(reason) {
    const flags = getFeatureFlags();
    flags.personalJourney.enabled = false;
    cachedFlags = flags;
    getLogger().warn({ reason }, '🚨 Personal Journey Awareness emergency disabled');
}
/**
 * Check if outreach system is enabled
 * Currently disabled - being extracted to separate worker architecture
 * See: docs/architecture/OUTREACH-WORKER-ARCHITECTURE.md
 */
export function isOutreachEnabled() {
    const flags = getFeatureFlags();
    return flags.outreach.enabled;
}
/**
 * Check if a specific outreach feature is enabled
 */
export function isOutreachFeatureEnabled(feature) {
    const flags = getFeatureFlags();
    if (!flags.outreach.enabled)
        return false;
    return flags.outreach[feature] === true;
}
/**
 * Check if outreach trigger creation is enabled
 * Used by session-integration.ts before creating triggers
 */
export function isOutreachTriggerCreationEnabled() {
    const flags = getFeatureFlags();
    return flags.outreach.enabled && flags.outreach.triggerCreation;
}
/**
 * Check if outreach system should initialize on startup
 * Used by global-services.ts before initializing outreach engine
 */
export function isOutreachSystemInitEnabled() {
    const flags = getFeatureFlags();
    return flags.outreach.enabled && flags.outreach.systemInitialization;
}
/**
 * Check if easter eggs are enabled
 */
export function isEasterEggsEnabled() {
    const flags = getFeatureFlags();
    return flags.easterEggs.enabled;
}
/**
 * Check if a specific easter egg feature is enabled
 */
export function isEasterEggFeatureEnabled(feature) {
    const flags = getFeatureFlags();
    if (!flags.easterEggs.enabled)
        return false;
    return flags.easterEggs[feature] === true;
}
/**
 * Check if holiday greetings are enabled
 * Used by easter-eggs.ts
 */
export function isHolidayGreetingsEnabled() {
    const flags = getFeatureFlags();
    return flags.easterEggs.enabled && flags.easterEggs.holidayGreetings;
}
//# sourceMappingURL=feature-flags.js.map