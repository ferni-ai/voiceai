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
/**
 * Get the current feature flags configuration
 *
 * @returns The feature flags object
 */
export declare function getFeatureFlags(): FeatureFlags;
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
export declare function isFeatureEnabled(path: string): boolean;
/**
 * Check if debug logging is enabled for a specific category
 *
 * @param category - Debug category (agent, humanizing, memory, tools, handoff, audio)
 * @returns Whether debug is enabled
 */
export declare function isDebugEnabled(category: keyof FeatureFlags['debug']): boolean;
/**
 * Check if an experimental feature is enabled
 *
 * @param feature - Experimental feature name
 * @returns Whether the experimental feature is enabled
 */
export declare function isExperimentalEnabled(feature: keyof FeatureFlags['experimental']): boolean;
/**
 * Force reload feature flags from environment
 * Useful for testing or when environment changes
 */
export declare function reloadFeatureFlags(): FeatureFlags;
/**
 * Override feature flags for testing
 * Use sparingly - only in test environments
 */
export declare function setFeatureFlagsForTesting(overrides: Partial<FeatureFlags>): void;
/**
 * Reset feature flags to defaults (for testing)
 */
export declare function resetFeatureFlags(): void;
/**
 * Check if all humanization features are enabled
 */
export declare function isHumanizationEnabled(): boolean;
/**
 * Get all enabled debug categories
 */
export declare function getEnabledDebugCategories(): Array<keyof FeatureFlags['debug']>;
/**
 * Check if EvalOps is enabled
 */
export declare function isEvalOpsEnabled(): boolean;
/**
 * Check if a specific EvalOps feature is enabled
 */
export declare function isEvalOpsFeatureEnabled(feature: keyof FeatureFlags['evalops']): boolean;
/**
 * Get EvalOps sample rate
 */
export declare function getEvalOpsSampleRate(): number;
export type LifeCoachDomain = 'crisis' | 'health' | 'career' | 'decisions' | 'family' | 'home' | 'learning' | 'creativity' | 'community' | 'legalAdmin';
/**
 * Check if a life coach domain is enabled
 * Note: Crisis domain is ALWAYS enabled for safety, regardless of flags
 */
export declare function isLifeCoachDomainEnabled(domain: LifeCoachDomain): boolean;
/**
 * Get all enabled life coach domains
 */
export declare function getEnabledLifeCoachDomains(): LifeCoachDomain[];
/**
 * Check if life coach analytics is enabled
 */
export declare function isLifeCoachAnalyticsEnabled(): boolean;
/**
 * Emergency: Disable a life coach domain at runtime
 * Note: Cannot disable crisis domain for safety
 */
export declare function emergencyDisableLifeCoachDomain(domain: LifeCoachDomain, reason: string): boolean;
export type PersonalJourneyFeature = 'rhythmAwareness' | 'seasonalMemory' | 'chapterDetection' | 'communityWisdom' | 'greetingEnhancement';
/**
 * Check if Personal Journey Awareness is enabled
 */
export declare function isPersonalJourneyEnabled(): boolean;
/**
 * Check if a specific Personal Journey feature is enabled
 */
export declare function isPersonalJourneyFeatureEnabled(feature: PersonalJourneyFeature): boolean;
/**
 * Check if user is in Personal Journey rollout
 * Uses userId hash for consistent rollout assignment
 */
export declare function isUserInPersonalJourneyRollout(userId: string): boolean;
/**
 * Get Personal Journey rollout percentage
 */
export declare function getPersonalJourneyRolloutPercent(): number;
/**
 * Emergency: Disable Personal Journey at runtime
 */
export declare function emergencyDisablePersonalJourney(reason: string): void;
export type OutreachFeature = 'triggerCreation' | 'systemInitialization' | 'triggerProcessing' | 'delivery';
/**
 * Check if outreach system is enabled
 * Currently disabled - being extracted to separate worker architecture
 * See: docs/architecture/OUTREACH-WORKER-ARCHITECTURE.md
 */
export declare function isOutreachEnabled(): boolean;
/**
 * Check if a specific outreach feature is enabled
 */
export declare function isOutreachFeatureEnabled(feature: OutreachFeature): boolean;
/**
 * Check if outreach trigger creation is enabled
 * Used by session-integration.ts before creating triggers
 */
export declare function isOutreachTriggerCreationEnabled(): boolean;
/**
 * Check if outreach system should initialize on startup
 * Used by global-services.ts before initializing outreach engine
 */
export declare function isOutreachSystemInitEnabled(): boolean;
export type EasterEggFeature = 'holidayGreetings' | 'seasonalMessages' | 'achievements' | 'randomMoments';
/**
 * Check if easter eggs are enabled
 */
export declare function isEasterEggsEnabled(): boolean;
/**
 * Check if a specific easter egg feature is enabled
 */
export declare function isEasterEggFeatureEnabled(feature: EasterEggFeature): boolean;
/**
 * Check if holiday greetings are enabled
 * Used by easter-eggs.ts
 */
export declare function isHolidayGreetingsEnabled(): boolean;
//# sourceMappingURL=feature-flags.d.ts.map