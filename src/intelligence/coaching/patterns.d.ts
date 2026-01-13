/**
 * Coaching Patterns - Cross-Session Pattern Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module tracks patterns across sessions to surface recurring themes:
 * - Topics they keep coming back to
 * - Words/phrases they use repeatedly
 * - Emotional patterns (e.g., always deflects with humor)
 * - Time-based patterns (e.g., always stressed on Mondays)
 * - Relationship patterns (e.g., always mentions mom during work talk)
 *
 * The goal: Help users see patterns they can't see themselves.
 */
export interface UserPattern {
    id: string;
    userId: string;
    patternType: PatternType;
    pattern: string;
    occurrences: number;
    contexts: PatternContext[];
    firstSeen: Date;
    lastSeen: Date;
    surfacedToUser: boolean;
    surfacedAt?: Date;
    userReaction?: 'resonated' | 'dismissed' | 'explored';
}
export type PatternType = 'recurring_topic' | 'deflection_humor' | 'deflection_busy' | 'word_repetition' | 'emotional_trigger' | 'time_correlation' | 'person_correlation' | 'avoidance';
export interface PatternContext {
    timestamp: Date;
    topic: string;
    triggerText?: string;
    emotion?: string;
    hourOfDay: number;
    dayOfWeek: number;
}
export interface PatternObservation {
    userId: string;
    patternType: PatternType;
    pattern: string;
    context: Omit<PatternContext, 'timestamp'>;
    triggerText: string;
}
/**
 * Detect patterns in a user's transcript
 */
export declare function detectPatternsInTranscript(transcript: string, topic: string, emotion?: string): Array<{
    type: PatternType;
    pattern: string;
    trigger: string;
}>;
/**
 * Record a pattern observation
 */
export declare function recordPattern(observation: PatternObservation): Promise<void>;
/**
 * Get patterns for a user
 */
export declare function getUserPatterns(userId: string): Promise<UserPattern[]>;
/**
 * Get patterns ready to be surfaced to user
 *
 * A pattern is ready to surface when:
 * - It has occurred at least 3 times
 * - It hasn't been surfaced before (or was well-received)
 * - It's been more than a week since last surfacing
 */
export declare function getPatternsToSurface(userId: string): Promise<UserPattern[]>;
/**
 * Mark a pattern as surfaced
 */
export declare function markPatternSurfaced(patternId: string, reaction?: 'resonated' | 'dismissed' | 'explored'): Promise<void>;
/**
 * Generate a pattern-surfacing question
 */
export declare function generatePatternSurfacingQuestion(pattern: UserPattern): string;
/**
 * Process a turn and record any patterns detected
 */
export declare function processTranscriptForPatterns(userId: string, transcript: string, topic: string, emotion?: string): Promise<void>;
/**
 * Get a pattern to potentially surface in the next silence
 */
export declare function getPatternForSilence(userId: string): Promise<{
    pattern: UserPattern;
    question: string;
} | null>;
declare const _default: {
    detectPatternsInTranscript: typeof detectPatternsInTranscript;
    recordPattern: typeof recordPattern;
    getUserPatterns: typeof getUserPatterns;
    getPatternsToSurface: typeof getPatternsToSurface;
    markPatternSurfaced: typeof markPatternSurfaced;
    generatePatternSurfacingQuestion: typeof generatePatternSurfacingQuestion;
    processTranscriptForPatterns: typeof processTranscriptForPatterns;
    getPatternForSilence: typeof getPatternForSilence;
};
export default _default;
//# sourceMappingURL=patterns.d.ts.map