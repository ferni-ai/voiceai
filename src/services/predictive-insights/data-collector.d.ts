/**
 * Predictive Insights Data Collector
 *
 * Extracts signals from conversations and user activity to feed
 * the predictive insight system. This is how predictions get smarter.
 *
 * Data sources:
 * - Conversation transcripts (mood, topics, people mentioned)
 * - Session metadata (duration, time of day, energy level)
 * - Goals and commitments mentioned
 * - Habit completions
 * - Calendar events
 *
 * @module PredictiveInsights/DataCollector
 */
import type { EnergyLevel } from './types.js';
export interface ConversationSignals {
    userId: string;
    sessionId: string;
    timestamp: Date;
    mood?: 'positive' | 'neutral' | 'negative';
    moodScore?: number;
    energyLevel?: EnergyLevel;
    peopleMentioned?: Array<{
        name: string;
        relationshipType: 'partner' | 'family' | 'close_friend' | 'friend' | 'colleague' | 'acquaintance';
        sentiment: number;
        pronouns?: {
            we: number;
            i: number;
            they: number;
        };
        context?: string;
    }>;
    topics?: string[];
    themes?: string[];
    decisions?: Array<{
        topic: string;
        category: 'career' | 'relationship' | 'financial' | 'health' | 'lifestyle' | 'other';
        sentiment: number;
        options?: string[];
        concerns?: string[];
        resolved?: boolean;
        outcome?: 'positive' | 'negative' | 'neutral';
    }>;
    goals?: Array<{
        goalId: string;
        progress?: number;
        mentioned?: boolean;
    }>;
    habits?: Array<{
        habitId: string;
        completed: boolean;
        duration?: number;
    }>;
    significantDates?: Array<{
        date: string;
        type: 'anniversary' | 'loss' | 'birthday' | 'other';
        description: string;
        emotionalWeight?: number;
    }>;
    sessionDuration?: number;
    userInitiated?: boolean;
    satisfactionSignal?: 'positive' | 'neutral' | 'negative';
}
/**
 * Process conversation signals and record to predictive systems
 */
export declare function processConversationSignals(signals: ConversationSignals): Promise<void>;
/**
 * Extract signals from a conversation transcript
 * This uses simple heuristics - could be enhanced with LLM
 */
export declare function extractSignalsFromTranscript(userId: string, sessionId: string, transcript: string, metadata?: {
    duration?: number;
    userInitiated?: boolean;
}): ConversationSignals;
/**
 * Hook to call when a conversation session ends
 */
export declare function onSessionEnd(userId: string, sessionId: string, transcript: string, metadata: {
    duration: number;
    userInitiated: boolean;
    satisfactionSignal?: 'positive' | 'neutral' | 'negative';
}): Promise<void>;
/**
 * Hook to call when a specific event is detected in conversation
 */
export declare function onConversationEvent(userId: string, event: {
    type: 'mood_detected' | 'person_mentioned' | 'decision_discussed' | 'goal_mentioned' | 'habit_completed';
    data: Record<string, unknown>;
}): void;
declare const _default: {
    processConversationSignals: typeof processConversationSignals;
    extractSignalsFromTranscript: typeof extractSignalsFromTranscript;
    onSessionEnd: typeof onSessionEnd;
    onConversationEvent: typeof onConversationEvent;
};
export default _default;
//# sourceMappingURL=data-collector.d.ts.map