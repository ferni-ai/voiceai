/**
 * Personality Intelligence System v2
 *
 * Clean Architecture Implementation of Superhuman Personality Intelligence
 *
 * This module provides "Better Than Human" personality capabilities:
 * - Anticipate emotions before they're expressed
 * - Know when to share vs. listen
 * - Track vulnerability with nuance
 * - Celebrate growth they don't notice
 * - Surface patterns they miss about themselves
 *
 * Architecture:
 * - Domain Layer: Pure business logic, no I/O
 * - Application Layer: Use cases that orchestrate domain + infra
 * - Infrastructure Layer: Firestore, adapters, external services
 *
 * @module personality/v2
 *
 * @example
 * ```typescript
 * import { createPersonalityService, PersonalityService } from './personality/v2';
 *
 * // Create service (uses Firestore by default)
 * const personality = createPersonalityService();
 *
 * // Build context for LLM injection
 * const context = await personality.buildContext({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   currentMessage: "I've been feeling overwhelmed lately",
 *   topics: ['stress', 'work'],
 * });
 *
 * // Inject into LLM
 * const prompt = basePrompt + context.formattedContext;
 *
 * // Record emotional moment from response
 * await personality.recordMoment({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   message: "I've been feeling overwhelmed lately",
 *   topics: ['stress', 'work'],
 * });
 * ```
 */
export { RelationshipDepth, type RelationshipStage, type ShareDepth, } from '../domain/model/value-objects/relationship-depth.js';
export { EmotionalState, type PrimaryEmotion, type GranularEmotion, type EmotionalTrajectory, type EmotionSource, } from '../domain/model/value-objects/emotional-state.js';
export { AnticipatedEmotion, type AnticipationSignal, type AnticipationResponse, type AnticipationConfidence, } from '../domain/model/value-objects/anticipated-emotion.js';
export { EmotionalPattern, type PatternType, type PatternDeliveryTiming, type PatternEvidence, } from '../domain/model/emotional-pattern.js';
export { VulnerabilityDeposit, type VulnerabilityLevel, type VulnerabilityCategory, type FirstTimeMarker, } from '../domain/model/vulnerability-deposit.js';
export { GrowthMilestone, type GrowthArea, type MilestoneSignificance, type GrowthEvidence, } from '../domain/model/growth-milestone.js';
export { PersonalityProfile, type PersonalMoment, type ConversationContext, type SharingDecision, type PersonalityDomainEvent, } from '../domain/model/personality-profile.js';
export { AnticipationEngine, type AnticipationContext } from '../domain/services/anticipation-engine.js';
export { TimingCalculator, type UserIntent, type SuggestedResponse, type TimingAnalysis, type MessageMetadata, } from '../domain/services/timing-calculator.js';
export { VulnerabilityScorer, type VulnerabilityDetectionResult } from '../domain/services/vulnerability-scorer.js';
export type { PersonalityRepository, ProfileQueryOptions, PatternQueryOptions, VulnerabilityQueryOptions, MilestoneQueryOptions, } from '../domain/interfaces/personality-repository.js';
export type { VoiceAnalyzer, VoiceFeatures, VoiceEmotionResult, StressAnalysisResult, SilenceAnalysisResult, BreathAnalysisResult, VoiceTone, VoicePace, BreathPattern, SilenceType, } from '../domain/interfaces/voice-analyzer.js';
export type { EmotionDetector, EmotionDetectionInput, EmotionDetectionResult, ContradictionResult, TrajectoryResult, FirstTimeVulnerabilityResult, } from '../domain/interfaces/emotion-detector.js';
export { BuildPersonalityContext, type BuildPersonalityContextInput, type PersonalityContextOutput, } from '../application/build-personality-context.js';
export { RecordEmotionalMoment, type RecordEmotionalMomentInput, type RecordEmotionalMomentOutput, } from '../application/record-emotional-moment.js';
export { FirestorePersonalityRepository, getFirestorePersonalityRepository, } from '../infrastructure/firestore-personality-repository.js';
export { InMemoryPersonalityRepository } from '../infrastructure/in-memory-personality-repository.js';
export { VoiceAnalyzerAdapter, getVoiceAnalyzerAdapter, EmotionDetectorAdapter, getEmotionDetectorAdapter, } from '../infrastructure/adapters/index.js';
export { analyzeMessageTiming, formatTimingGuidance, shouldSharePersonalMoment, detectVulnerability, anticipateEmotion, buildPersonalityContext, recordEmotionalDataPoint, getPatternInsights, getGrowthCelebrations, getPersonalityService as getLegacyPersonalityService, } from '../infrastructure/legacy-bridge.js';
import { type BuildPersonalityContextInput, type PersonalityContextOutput } from '../application/build-personality-context.js';
import { type RecordEmotionalMomentInput, type RecordEmotionalMomentOutput } from '../application/record-emotional-moment.js';
import type { PersonalityRepository } from '../domain/interfaces/personality-repository.js';
import type { VoiceAnalyzer } from '../domain/interfaces/voice-analyzer.js';
import type { EmotionDetector } from '../domain/interfaces/emotion-detector.js';
import { InMemoryPersonalityRepository } from '../infrastructure/in-memory-personality-repository.js';
/**
 * Personality Service configuration
 */
export interface PersonalityServiceConfig {
    /** Repository implementation (defaults to Firestore) */
    repository?: PersonalityRepository;
    /** Voice analyzer (optional, for multimodal) */
    voiceAnalyzer?: VoiceAnalyzer;
    /** Emotion detector (optional, for enhanced detection) */
    emotionDetector?: EmotionDetector;
}
/**
 * PersonalityService - High-level facade for personality intelligence
 *
 * Provides a simple API for common personality operations.
 */
export declare class PersonalityService {
    private buildContextUseCase;
    private recordMomentUseCase;
    constructor(config?: PersonalityServiceConfig);
    /**
     * Build personality context for LLM injection
     *
     * @example
     * ```typescript
     * const context = await personality.buildContext({
     *   userId: 'user_123',
     *   personaId: 'ferni',
     *   currentMessage: "I've been feeling overwhelmed lately",
     * });
     * ```
     */
    buildContext(input: BuildPersonalityContextInput): Promise<PersonalityContextOutput>;
    /**
     * Record an emotional moment from user message
     *
     * @example
     * ```typescript
     * const result = await personality.recordMoment({
     *   userId: 'user_123',
     *   personaId: 'ferni',
     *   message: "I've been feeling overwhelmed lately",
     * });
     * ```
     */
    recordMoment(input: RecordEmotionalMomentInput): Promise<RecordEmotionalMomentOutput>;
}
/**
 * Create a personality service with default (Firestore) configuration
 */
export declare function createPersonalityService(config?: PersonalityServiceConfig): PersonalityService;
/**
 * Create a personality service with in-memory repository (for testing)
 */
export declare function createTestPersonalityService(config?: Partial<PersonalityServiceConfig>): {
    service: PersonalityService;
    repository: InMemoryPersonalityRepository;
};
/**
 * Create domain services (for direct use)
 */
export declare function createDomainServices(): {
    anticipation: any;
    timing: any;
    vulnerability: any;
};
//# sourceMappingURL=index.d.ts.map