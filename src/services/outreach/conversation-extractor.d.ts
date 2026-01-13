/**
 * Conversation Extractor for Intelligent Outreach
 *
 * Automatically extracts from conversations:
 * - Commitments ("I'll start meditating tomorrow")
 * - Emotions ("I've been feeling stressed")
 * - Life Events ("I have a job interview Friday")
 * - Wins ("I finally finished that project!")
 * - Struggles ("I've been having trouble sleeping")
 *
 * This feeds the Context Aggregator, enabling "Better Than Human" outreach
 * that references specific things the user shared.
 *
 * @module ConversationExtractor
 */
import { type EmotionalState } from './context-aggregator.js';
export interface ExtractionResult {
    commitments: ExtractedCommitment[];
    emotions: ExtractedEmotion[];
    events: ExtractedEvent[];
    wins: string[];
    struggles: string[];
    topics: string[];
    patterns: ExtractedPattern[];
    milestones: ExtractedMilestone[];
    triggersCreated: string[];
}
export interface ExtractedPattern {
    type: 'day_of_week' | 'time_of_day' | 'recurring' | 'behavioral';
    pattern: string;
    dayOfWeek?: number;
    confidence: number;
}
export interface ExtractedMilestone {
    type: 'streak' | 'anniversary' | 'goal_progress' | 'count';
    description: string;
    value?: number;
    unit?: string;
    confidence: number;
}
export interface ExtractedCommitment {
    what: string;
    when?: Date;
    checkInTime?: Date;
    confidence: number;
}
export interface ExtractedEmotion {
    state: EmotionalState;
    trigger?: string;
    intensity: 'low' | 'medium' | 'high';
    confidence: number;
}
export interface ExtractedEvent {
    description: string;
    date?: Date;
    type: 'appointment' | 'deadline' | 'celebration' | 'social' | 'work' | 'health' | 'other';
    importance: 'low' | 'medium' | 'high';
    confidence: number;
}
/**
 * Extract all relevant information from a conversation turn
 */
export declare function extractFromMessage(message: string): Partial<ExtractionResult>;
/**
 * Process extraction results and update the context aggregator + create triggers
 */
export declare function processExtractionResults(userId: string, extraction: Partial<ExtractionResult>): Promise<string[]>;
/**
 * Main function: Extract and process a conversation message
 */
export declare function extractAndProcess(userId: string, message: string): Promise<ExtractionResult>;
declare const _default: {
    extractFromMessage: typeof extractFromMessage;
    processExtractionResults: typeof processExtractionResults;
    extractAndProcess: typeof extractAndProcess;
};
export default _default;
//# sourceMappingURL=conversation-extractor.d.ts.map