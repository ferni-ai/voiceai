/**
 * Coaching Questions - "Better Than Human" Question Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module generates questions that make users think "How did you know to ask that?"
 *
 * Key capabilities:
 * 1. MEMORY-GROUNDED - References things they've shared before
 * 2. PATTERN-SURFACING - Notices recurring themes they can't see
 * 3. THE MIRROR - Reflects their words back meaningfully
 * 4. ANTICIPATORY - Asks what they need before they know they need it
 *
 * A great coaching question should make them:
 * - PAUSE before answering
 * - THINK differently than they were
 * - Feel UNDERSTOOD, not interrogated
 * - WANT to answer (not have to)
 */
import { type QuestionContext, type GeneratedQuestion } from './dynamic-questions.js';
export interface MemoryGroundedQuestion extends GeneratedQuestion {
    groundedIn?: {
        memory: string;
        daysAgo: number;
        connection: string;
        originalContext?: string;
    };
}
export interface PatternObservation {
    pattern: string;
    occurrences: number;
    contexts: string[];
    surfacingQuestion: string;
    intent: string;
}
export interface MirrorReflection {
    observed: string;
    reflection: string;
    question: string;
    gentleness: 'soft' | 'direct' | 'curious';
}
export interface AnticipatedNeed {
    signal: string;
    anticipated: string;
    checkQuestion: string;
    ifConfirmed: string;
    ifDenied: string;
}
/**
 * Generate a memory-grounded question
 *
 * This references something they've shared before to show we remember
 * and care about their story.
 */
export declare function generateMemoryGroundedQuestion(context: QuestionContext, memories: Array<{
    topic: string;
    daysAgo: number;
    summary: string;
}>, options?: {
    llmCall?: (prompt: string) => Promise<string>;
}): Promise<MemoryGroundedQuestion>;
/**
 * Detect and surface patterns in their conversation
 */
export declare function detectPatterns(context: QuestionContext): PatternObservation[];
/**
 * Generate a pattern-surfacing question
 */
export declare function generatePatternQuestion(context: QuestionContext, options?: {
    llmCall?: (prompt: string) => Promise<string>;
}): Promise<GeneratedQuestion | null>;
/**
 * Generate a mirror reflection - reflect their words back
 */
export declare function generateMirror(transcript: string): MirrorReflection | null;
/**
 * Generate an anticipatory question based on signals
 */
export declare function getAnticipatoryQuestion(signals: {
    pauseBeforeSpeaking?: boolean;
    voiceDropped?: boolean;
    shortAnswers?: boolean;
    changedSubject?: boolean;
    repeatedPerson?: string;
}): AnticipatedNeed | null;
/**
 * Get the best coaching question based on context
 *
 * This is the main entry point that decides which type of question to ask:
 * 1. Memory-grounded (if we have relevant memories)
 * 2. Pattern-surfacing (if we detect patterns)
 * 3. Mirror (if their language reveals something)
 * 4. Anticipatory (if we sense they need something)
 * 5. Regular dynamic question (fallback)
 */
export declare function getCoachingQuestion(context: QuestionContext, options?: {
    memories?: Array<{
        topic: string;
        daysAgo: number;
        summary: string;
    }>;
    transcript?: string;
    signals?: {
        pauseBeforeSpeaking?: boolean;
        voiceDropped?: boolean;
        shortAnswers?: boolean;
        changedSubject?: boolean;
        repeatedPerson?: string;
    };
    llmCall?: (prompt: string) => Promise<string>;
}): Promise<GeneratedQuestion>;
declare const _default: {
    generateMemoryGroundedQuestion: typeof generateMemoryGroundedQuestion;
    generatePatternQuestion: typeof generatePatternQuestion;
    generateMirror: typeof generateMirror;
    getAnticipatoryQuestion: typeof getAnticipatoryQuestion;
    getCoachingQuestion: typeof getCoachingQuestion;
    detectPatterns: typeof detectPatterns;
};
export default _default;
//# sourceMappingURL=questions.d.ts.map