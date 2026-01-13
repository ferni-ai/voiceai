/**
 * BuildPersonalityContext Use Case
 *
 * Orchestrates building the complete personality context for LLM injection.
 * This is the main entry point for getting personality intelligence.
 *
 * Features:
 * - Profile caching (reduces Firestore reads)
 * - Time decay applied per-session (not per-turn)
 * - Anticipation engine for superhuman prediction
 *
 * @module personality/application/build-personality-context
 */
import type { PersonalityRepository } from '../domain/interfaces/personality-repository.js';
import type { VoiceAnalyzer, VoiceFeatures, SilenceAnalysisResult } from '../domain/interfaces/voice-analyzer.js';
import type { EmotionDetector } from '../domain/interfaces/emotion-detector.js';
import type { PersonalityProfile, PersonalMoment } from '../domain/model/personality-profile.js';
import type { AnticipatedEmotion } from '../domain/model/value-objects/anticipated-emotion.js';
import type { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import type { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../domain/model/growth-milestone.js';
import { type TimingAnalysis } from '../domain/services/timing-calculator.js';
/** Invalidate a specific user's cached profile */
export declare function invalidateBuildContextCache(userId: string, personaId: string): void;
/** Export for testing */
export declare function clearProfileCache(): void;
/** Get cache stats for monitoring */
export declare function getProfileCacheStats(): {
    cacheSize: number;
    loadingCount: number;
    maxSize: number;
    ttlMs: number;
};
/**
 * Input for building personality context
 */
export interface BuildPersonalityContextInput {
    /** User ID */
    userId: string;
    /** Persona ID */
    personaId: string;
    /** Current user message */
    currentMessage?: string;
    /** Partial transcript (for anticipation) */
    partialTranscript?: string;
    /** Voice features (if available) */
    voiceFeatures?: VoiceFeatures;
    /** Silence duration (if applicable) */
    silenceDurationMs?: number;
    /** Current topics */
    topics?: string[];
    /** Mentioned people */
    mentionedPeople?: string[];
    /** Session turn count */
    turnCount?: number;
    /** Available personal moments (for sharing decisions) */
    availableMoments?: PersonalMoment[];
}
/**
 * Complete personality context output
 */
export interface PersonalityContextOutput {
    /** User's personality profile */
    profile: PersonalityProfile;
    /** Current relationship stage */
    relationshipStage: string;
    /** Timing analysis */
    timing: TimingAnalysis | null;
    /** Anticipated emotion (SUPERHUMAN) */
    anticipatedEmotion: AnticipatedEmotion | null;
    /** Silence analysis (if applicable) */
    silenceAnalysis: SilenceAnalysisResult | null;
    /** Vulnerabilities needing follow-up */
    pendingVulnerabilities: VulnerabilityDeposit[];
    /** Patterns ready to surface */
    surfaceablePatterns: EmotionalPattern[];
    /** Milestones ready to celebrate */
    celebratableMilestones: GrowthMilestone[];
    /** Should we share a moment? */
    momentToShare: {
        should: boolean;
        moment?: PersonalMoment;
        transition?: string;
        reason: string;
    } | null;
    /** Should hold space (be silent)? */
    shouldHoldSpace: boolean;
    /** Caution level (0-1) */
    cautionLevel: number;
    /** Formatted context for LLM injection */
    formattedContext: string;
}
/**
 * BuildPersonalityContext Use Case
 *
 * Orchestrates all personality intelligence for a conversation turn.
 *
 * @example
 * ```typescript
 * const useCase = new BuildPersonalityContext(repository, voiceAnalyzer, emotionDetector);
 *
 * const context = await useCase.execute({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   currentMessage: "I've been feeling overwhelmed lately",
 *   topics: ['stress', 'work'],
 * });
 *
 * // Inject into LLM
 * const prompt = basePrompt + context.formattedContext;
 * ```
 */
export declare class BuildPersonalityContext {
    private repository;
    private voiceAnalyzer?;
    private emotionDetector?;
    private anticipationEngine;
    private timingCalculator;
    constructor(repository: PersonalityRepository, voiceAnalyzer?: VoiceAnalyzer | undefined, emotionDetector?: EmotionDetector | undefined);
    /**
     * Execute the use case
     */
    execute(input: BuildPersonalityContextInput): Promise<PersonalityContextOutput>;
    /**
     * Detect voice tone from features
     */
    private detectVoiceTone;
    /**
     * Infer conversation phase from turn count
     */
    private inferConversationPhase;
    /**
     * Decide on moment sharing
     */
    private decideMomentSharing;
    /**
     * Format context for LLM injection
     */
    private formatContext;
}
//# sourceMappingURL=build-personality-context.d.ts.map