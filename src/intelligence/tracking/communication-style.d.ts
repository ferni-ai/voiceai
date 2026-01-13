/**
 * Communication Style Mirroring Engine
 *
 * Learns and mirrors the user's communication style:
 * - Formality level (casual ↔ professional)
 * - Energy/enthusiasm (calm ↔ animated)
 * - Vocabulary complexity
 * - Sentence length patterns
 * - Emoji/expression usage
 * - Question style preferences
 *
 * This creates subconscious rapport by speaking "their language"
 *
 * PERSISTENCE: Communication style data is persisted to Firestore via the
 * unified persistence layer to survive server restarts and improve over sessions.
 */
import { type PersistenceStore } from '../../services/persistence/index.js';
export type FormalityLevel = 'casual' | 'balanced' | 'professional';
export type EnergyLevel = 'calm' | 'moderate' | 'animated';
export type VocabularyLevel = 'simple' | 'moderate' | 'sophisticated';
export interface CommunicationStyle {
    formality: FormalityLevel;
    energy: EnergyLevel;
    vocabulary: VocabularyLevel;
    avgSentenceLength: number;
    usesEmoji: boolean;
    usesExclamation: boolean;
    usesColloquialisms: boolean;
    usesSlang: boolean;
    prefersDirect: boolean;
    prefersStories: boolean;
    prefersNumbers: boolean;
    commonPhrases: string[];
    confidence: number;
    sampleCount: number;
}
export interface StyleGuidance {
    formality: FormalityLevel;
    energy: EnergyLevel;
    vocabulary: VocabularyLevel;
    useEmoji: boolean;
    useExclamation: boolean;
    sentenceStyle: 'short' | 'medium' | 'long';
    toneNote: string;
    phrasesToMirror: string[];
    confidence: number;
}
interface CommunicationStyleData {
    samples: MessageSample[];
    detectedPhrases: Record<string, number>;
    calculatedStyle: CommunicationStyle | null;
    updatedAt: string;
}
export declare class CommunicationMirroringEngine {
    private samples;
    private detectedPhrases;
    private userId;
    private persistenceStore;
    private loaded;
    constructor(userId?: string, persistenceStore?: PersistenceStore<CommunicationStyleData>);
    /**
     * Load persisted communication style data
     */
    loadFromPersistence(): Promise<void>;
    /**
     * Persist communication style data to Firestore
     */
    private persist;
    /**
     * Analyze a user message and update style profile
     */
    analyzeMessage(message: string): Promise<void>;
    private extractFeatures;
    private scoreToFormality;
    private scoreToEnergy;
    private scoreToVocab;
    private extractPhrases;
    private isInterestingPhrase;
    /**
     * Calculate overall communication style from samples
     */
    calculateStyle(): CommunicationStyle;
    private getMostCommon;
    private getDefaultStyle;
    /**
     * Get guidance for mirroring user's style
     */
    getStyleGuidance(): StyleGuidance;
    /**
     * Format guidance for LLM prompt injection
     */
    formatGuidanceForPrompt(): string;
    /**
     * Transform a response to match user's style
     */
    adaptResponse(response: string): string;
    reset(): void;
    getStats(): {
        sampleCount: number;
        style: {
            formality: FormalityLevel;
            energy: EnergyLevel;
            vocabulary: VocabularyLevel;
        };
        confidence: number;
    };
}
interface MessageSample {
    timestamp: Date;
    wordCount: number;
    avgSentenceLength: number;
    formality: FormalityLevel;
    energy: EnergyLevel;
    vocabulary: VocabularyLevel;
    hasEmoji: boolean;
    hasExclamation: boolean;
    hasColloquialisms: boolean;
    hasSlang: boolean;
    endsWithQuestion: boolean;
}
/**
 * Initialize communication mirroring persistence
 */
export declare function initializeCommunicationMirroringPersistence(): Promise<void>;
/**
 * Shutdown communication mirroring persistence
 */
export declare function shutdownCommunicationMirroringPersistence(): Promise<void>;
export declare function getCommunicationMirroring(userId: string): CommunicationMirroringEngine;
export declare function removeCommunicationMirroring(userId: string): void;
/**
 * Clear all communication mirroring data for a user
 */
export declare function clearCommunicationMirroringData(userId: string): Promise<void>;
export {};
//# sourceMappingURL=communication-style.d.ts.map