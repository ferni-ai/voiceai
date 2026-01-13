/**
 * RecordEmotionalMoment Use Case
 *
 * Records emotional data and vulnerability from user messages.
 * Updates the personality profile with new insights.
 *
 * @module personality/application/record-emotional-moment
 */
import type { PersonalityRepository } from '../domain/interfaces/personality-repository.js';
import type { EmotionDetector } from '../domain/interfaces/emotion-detector.js';
import type { VoiceAnalyzer, VoiceFeatures } from '../domain/interfaces/voice-analyzer.js';
import type { PersonalityProfile, PersonalityDomainEvent } from '../domain/model/personality-profile.js';
import { EmotionalState } from '../domain/model/value-objects/emotional-state.js';
/**
 * Input for recording emotional moment
 */
export interface RecordEmotionalMomentInput {
    /** User ID */
    userId: string;
    /** Persona ID */
    personaId: string;
    /** User's message */
    message: string;
    /** Topics detected in message */
    topics?: string[];
    /** Voice features (for multimodal analysis) */
    voiceFeatures?: VoiceFeatures;
    /** Was this message acknowledged well? (for feedback) */
    acknowledgmentQuality?: 'positive' | 'neutral' | 'negative';
    /** Mentioned people */
    mentionedPeople?: string[];
}
/**
 * Output from recording emotional moment
 */
export interface RecordEmotionalMomentOutput {
    /** Updated profile */
    profile: PersonalityProfile;
    /** Detected emotional state */
    detectedState: EmotionalState;
    /** Was vulnerability detected? */
    vulnerabilityDetected: boolean;
    /** Was this a first-time share? */
    isFirstTimeVulnerability: boolean;
    /** Domain events emitted */
    domainEvents: PersonalityDomainEvent[];
    /** Pattern evidence recorded? */
    patternEvidenceRecorded: boolean;
}
/**
 * RecordEmotionalMoment Use Case
 *
 * Analyzes user messages for emotional content and vulnerability,
 * updates the personality profile, and tracks patterns.
 *
 * @example
 * ```typescript
 * const useCase = new RecordEmotionalMoment(repository, emotionDetector, voiceAnalyzer);
 *
 * const result = await useCase.execute({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   message: "I've never told anyone this, but I struggle with anxiety",
 *   topics: ['mental_health', 'anxiety'],
 * });
 *
 * if (result.isFirstTimeVulnerability) {
 *   // Handle first-time vulnerability specially
 * }
 * ```
 */
export declare class RecordEmotionalMoment {
    private repository;
    private emotionDetector?;
    private voiceAnalyzer?;
    private vulnerabilityScorer;
    constructor(repository: PersonalityRepository, emotionDetector?: EmotionDetector | undefined, voiceAnalyzer?: VoiceAnalyzer | undefined);
    /**
     * Execute the use case
     */
    execute(input: RecordEmotionalMomentInput): Promise<RecordEmotionalMomentOutput>;
    /**
     * Detect emotion from message
     */
    private detectEmotion;
    /**
     * Simple emotion detection fallback
     */
    private simpleEmotionDetection;
    /**
     * Generate summary from message and category
     */
    private generateSummary;
}
//# sourceMappingURL=record-emotional-moment.d.ts.map