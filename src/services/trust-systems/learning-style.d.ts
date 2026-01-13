/**
 * Learning Style Adaptation
 *
 * Detects and adapts to individual learning and processing styles
 * for more effective advice and support delivery.
 *
 * Philosophy: People absorb information differently. Some need
 * metaphors, some need steps, some need space to process.
 * Meeting them where they are makes advice land.
 *
 * Style Dimensions:
 * - Processing (analytical vs intuitive)
 * - Pacing (fast vs slow)
 * - Structure (detailed vs big-picture)
 * - Examples (concrete vs abstract)
 * - Validation (direct vs exploring)
 *
 * @module LearningStyle
 */
export type ProcessingStyle = 'analytical' | 'intuitive' | 'balanced';
export type PacingStyle = 'fast' | 'moderate' | 'slow' | 'adaptive';
export type StructureStyle = 'detailed' | 'big_picture' | 'flexible';
export type ExampleStyle = 'concrete' | 'abstract' | 'metaphorical' | 'mixed';
export type ValidationStyle = 'direct' | 'exploratory' | 'supportive';
export interface LearningProfile {
    userId: string;
    processing: ProcessingDimension;
    pacing: PacingDimension;
    structure: StructureDimension;
    examples: ExampleDimension;
    validation: ValidationDimension;
    patterns: LearningPattern[];
    adaptations: AdaptationRecord[];
    confidence: number;
    lastUpdated: Date;
}
export interface ProcessingDimension {
    style: ProcessingStyle;
    indicators: {
        asksForData: number;
        asksForFeelings: number;
        prefersLogic: number;
        prefersIntuition: number;
    };
    confidence: number;
}
export interface PacingDimension {
    style: PacingStyle;
    avgResponseTime: number;
    prefersBreaks: boolean;
    processesOutLoud: boolean;
    confidence: number;
}
export interface StructureDimension {
    style: StructureStyle;
    prefersSteps: boolean;
    prefersOverview: boolean;
    toleratesAmbiguity: number;
    confidence: number;
}
export interface ExampleDimension {
    style: ExampleStyle;
    respondsBestTo: Array<'stories' | 'data' | 'metaphors' | 'analogies' | 'real_examples'>;
    confidence: number;
}
export interface ValidationDimension {
    style: ValidationStyle;
    needsReassurance: number;
    prefersChallenge: number;
    wantsExploration: number;
    confidence: number;
}
export interface LearningPattern {
    id: string;
    pattern: string;
    observation: string;
    strength: number;
    detectedAt: Date;
}
export interface AdaptationRecord {
    timestamp: Date;
    adaptation: string;
    reception: 'positive' | 'neutral' | 'negative';
    context: string;
}
export interface StyleSignal {
    type: 'processing' | 'pacing' | 'structure' | 'examples' | 'validation';
    signal: string;
    strength: number;
}
export interface DeliveryGuidance {
    format: DeliveryFormat;
    pacing: string;
    structure: string;
    examples: string;
    tone: string;
    suggestions: string[];
    avoidances: string[];
}
export interface DeliveryFormat {
    useSteps: boolean;
    useBullets: boolean;
    useMetaphors: boolean;
    useData: boolean;
    lengthPreference: 'brief' | 'moderate' | 'detailed';
}
/**
 * Detect learning style signals from user text
 */
export declare function detectStyleSignals(text: string): StyleSignal[];
/**
 * Record learning signals and update profile
 */
export declare function recordLearningSignals(userId: string, text: string, context?: {
    responseTime?: number;
    askedFollowUp?: boolean;
    requestedExamples?: boolean;
    requestedClarification?: boolean;
}): void;
/**
 * Generate delivery guidance based on learning profile
 */
export declare function generateDeliveryGuidance(userId: string): DeliveryGuidance;
/**
 * Format guidance for LLM injection
 */
export declare function formatGuidanceForLLM(userId: string): string | null;
/**
 * Record how an adaptation was received
 */
export declare function recordAdaptationReception(userId: string, adaptation: string, reception: 'positive' | 'neutral' | 'negative', context: string): void;
/**
 * Get learning profile
 */
export declare function getLearningProfile(userId: string): LearningProfile | null;
/**
 * Get quick style summary
 */
export declare function getStyleSummary(userId: string): string | null;
declare const _default: {
    detectStyleSignals: typeof detectStyleSignals;
    recordLearningSignals: typeof recordLearningSignals;
    generateDeliveryGuidance: typeof generateDeliveryGuidance;
    formatGuidanceForLLM: typeof formatGuidanceForLLM;
    recordAdaptationReception: typeof recordAdaptationReception;
    getLearningProfile: typeof getLearningProfile;
    getStyleSummary: typeof getStyleSummary;
};
export default _default;
//# sourceMappingURL=learning-style.d.ts.map