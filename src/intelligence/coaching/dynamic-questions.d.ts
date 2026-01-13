/**
 * Dynamic Question Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * CRITICAL: Every question Ferni asks should have a REASON. The agent must know:
 * - WHY it's asking this question
 * - What it expects to LEARN
 * - How to FOLLOW UP based on any answer
 *
 * This replaces all hardcoded question banks (meaningful-silence.ts, journaling-prompts.ts, etc.)
 * with LLM-generated, persona-grounded, context-aware questions.
 *
 * Two Modes:
 * 1. LLM Generation (preferred) - Dynamic, contextual, truly "Better than Human"
 * 2. Persona-Filtered Fallback - When LLM unavailable, uses cognitive profiles to filter
 *
 * Key Principles:
 * - Questions are PERSONA-GROUNDED (Ferni asks differently than Maya)
 * - Questions are CONTEXT-AWARE (based on what we know about them)
 * - Questions have PROVENANCE (we track why we asked)
 * - Questions are DEDUPLICATED (never repeat within a session)
 */
/**
 * The reason we're asking this question - agent MUST know this
 */
export interface QuestionIntent {
    /** What we're trying to understand */
    seekingToUnderstand: string;
    /** Why NOW is the right time to ask */
    timingReason: string;
    /** What we expect to learn */
    expectedInsight: string;
    /** How this relates to what we already know */
    buildsOnContext?: string;
}
/**
 * Full context needed to generate a meaningful question
 */
export interface QuestionContext {
    /** Active persona */
    personaId: string;
    /** User we're talking to */
    userId: string;
    /** Session for deduplication */
    sessionId: string;
    knownFacts: string[];
    recentTopics: string[];
    currentStruggle?: string;
    currentWin?: string;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    conversationDepth: number;
    emotionalState?: {
        primary: string;
        intensity: number;
    };
    recentEmotionalTone?: 'heavy' | 'light' | 'neutral';
    hourOfDay: number;
    isWeekend: boolean;
    lastUserMessage?: string;
    silenceReason?: 'processing' | 'distracted' | 'emotional' | 'thinking' | 'unknown';
    turnCount: number;
    boundaries: string[];
    sensitiveTopics?: string[];
}
/**
 * A generated question with full provenance
 */
export interface GeneratedQuestion {
    /** The question text (plain) */
    text: string;
    /** SSML-formatted for speech */
    ssml: string;
    /** The intent behind this question - REQUIRED */
    intent: QuestionIntent;
    /** How to respond based on their answer */
    followUpStrategy: {
        ifPositive: string;
        ifNegative: string;
        ifDeflects: string;
        ifSilence: string;
    };
    /** Metadata */
    personaId: string;
    generatedAt: Date;
    generationMethod: 'llm' | 'filtered_fallback' | 'universal_fallback';
    /** For deduplication */
    contentHash: string;
}
/**
 * Question type categories
 */
export type QuestionType = 'deepening' | 'checking_in' | 'curious' | 'supportive' | 'celebratory' | 'reflective' | 'silence_break' | 'relationship_building';
/**
 * Clear session question history
 */
export declare function clearQuestionHistory(sessionId: string): void;
export interface GenerateQuestionOptions {
    /** Force LLM generation (skip fallback) */
    forceLLM?: boolean;
    /** Custom LLM call function */
    llmCall?: (prompt: string) => Promise<string>;
    /** Specific question intent override */
    specificIntent?: string;
}
/**
 * Generate a contextual, persona-grounded question
 *
 * This is the main entry point. It will:
 * 1. Try LLM generation if available
 * 2. Fall back to persona-filtered static questions
 * 3. Fall back to universal questions if all else fails
 */
export declare function generateQuestion(context: QuestionContext, type: QuestionType, options?: GenerateQuestionOptions): Promise<GeneratedQuestion>;
/**
 * Convenience function: Get a silence-breaking question
 */
export declare function getSilenceQuestion(context: QuestionContext, options?: GenerateQuestionOptions): Promise<GeneratedQuestion>;
/**
 * Convenience function: Get a checking-in question
 */
export declare function getCheckInQuestion(context: QuestionContext, options?: GenerateQuestionOptions): Promise<GeneratedQuestion>;
/**
 * Convenience function: Get a deepening question
 */
export declare function getDeepeningQuestion(context: QuestionContext, options?: GenerateQuestionOptions): Promise<GeneratedQuestion>;
/**
 * Get available question types for a persona
 */
export declare function getPersonaQuestionCapabilities(personaId: string): {
    preferredTypes: QuestionType[];
    avoidTypes: QuestionType[];
    voiceStyle: string;
};
declare const _default: {
    generateQuestion: typeof generateQuestion;
    getSilenceQuestion: typeof getSilenceQuestion;
    getCheckInQuestion: typeof getCheckInQuestion;
    getDeepeningQuestion: typeof getDeepeningQuestion;
    clearQuestionHistory: typeof clearQuestionHistory;
    getPersonaQuestionCapabilities: typeof getPersonaQuestionCapabilities;
};
export default _default;
//# sourceMappingURL=dynamic-questions.d.ts.map