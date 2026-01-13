/**
 * Emotion Types - Shared across memory and intelligence layers
 *
 * This file consolidates emotion-related type definitions to prevent
 * architecture violations (memory → intelligence imports).
 *
 * @module types/emotion-types
 */
/**
 * Primary emotion categories
 */
export type PrimaryEmotion = 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation' | 'anxiety' | 'regret' | 'neutral';
/**
 * Emotional valence (positive/negative/neutral)
 */
export type Valence = 'positive' | 'negative' | 'neutral';
/**
 * Detected emotion with metadata
 */
export interface EmotionResult {
    primary: PrimaryEmotion;
    secondary?: PrimaryEmotion;
    intensity: number;
    valence: Valence;
    distressLevel: number;
    confidence: number;
    markers: string[];
    suggestedTone: 'warm' | 'gentle' | 'enthusiastic' | 'calm' | 'serious' | 'friendly' | 'reassuring' | 'informative' | 'measured';
}
/**
 * A significant emotional moment from a conversation
 */
export interface EmotionalMoment {
    id: string;
    timestamp: Date;
    sessionId: string;
    emotion: PrimaryEmotion;
    intensity: 'mild' | 'moderate' | 'strong';
    topic: string;
    trigger: string;
    userStatement: string;
    resolved?: boolean;
    resolutionNote?: string;
    followedUp?: boolean;
}
/**
 * Detected pattern in emotional behavior over time
 */
export interface EmotionalPattern {
    topic: string;
    emotions: PrimaryEmotion[];
    frequency: number;
    lastSeen: Date;
    trend: 'improving' | 'stable' | 'worsening' | 'unknown';
}
/**
 * A suggested check-in based on past emotional moments
 */
export interface EmotionalCheckIn {
    type: 'follow_up' | 'celebration' | 'support' | 'curiosity';
    reference: string;
    suggestedOpener: string;
    priority: 'high' | 'medium' | 'low';
    moment: EmotionalMoment;
}
/**
 * Emotional context for LLM injection
 */
export interface EmotionalContext {
    recentEmotions: string[];
    unresolvedConcerns: string[];
    celebratableWins: string[];
    checkInSuggestions: EmotionalCheckIn[];
}
/**
 * Check if a value is a valid PrimaryEmotion
 */
export declare function isPrimaryEmotion(value: unknown): value is PrimaryEmotion;
/**
 * Check if a value is a valid EmotionResult
 */
export declare function isEmotionResult(value: unknown): value is EmotionResult;
//# sourceMappingURL=emotion-types.d.ts.map