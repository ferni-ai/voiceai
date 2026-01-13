/**
 * Question Pattern Types
 *
 * Types for diverse question generation in natural conversation.
 *
 * @module @ferni/conversation/question-patterns/types
 */
export type QuestionType = 'open_ended' | 'clarifying' | 'confirming' | 'rhetorical' | 'echo' | 'leading' | 'reflective' | 'scaling' | 'hypothetical' | 'follow_up';
export interface Question {
    type: QuestionType;
    text: string;
    ssml: string;
    purpose: string;
    expectedResponseType: 'detailed' | 'brief' | 'emotional' | 'factual' | 'none';
}
export interface QuestionContext {
    topic?: string;
    userEmotion?: string;
    previousUserStatement?: string;
    conversationDepth?: 'surface' | 'medium' | 'deep';
    personaId?: string;
    intent?: 'explore' | 'understand' | 'guide' | 'connect' | 'close';
    /**
     * Optional seed for deterministic selection. If omitted, selection falls back
     * to process randomness (legacy behavior).
     */
    randomSeed?: string;
}
export interface QuestionTemplate {
    template: string;
    purposeDescription: string;
    expectedResponse: Question['expectedResponseType'];
    contexts?: string[];
}
export interface PersonaCustomQuestion {
    text: string;
    type: QuestionType;
    context?: string;
}
export interface PersonaQuestionStyle {
    preferredTypes: QuestionType[];
    avoidTypes: QuestionType[];
    customQuestions: PersonaCustomQuestion[];
}
//# sourceMappingURL=types.d.ts.map