/**
 * Enhanced Socratic Questioning Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Uses Socratic questioning to help users discover insights themselves.
 * The best answer is the one they arrive at on their own.
 *
 * Philosophy:
 * - Questions > Answers
 * - Curiosity > Advice
 * - Discovery > Instruction
 *
 * @module SocraticEngine
 */
export type SocraticQuestionType = 'clarifying' | 'assumption_probing' | 'evidence_seeking' | 'perspective_taking' | 'implication_exploring' | 'meta_questioning' | 'origin_exploring' | 'alternative_generating';
export interface SocraticQuestion {
    question: string;
    type: SocraticQuestionType;
    followUp?: string;
    ssml: string;
}
export interface SocraticContext {
    topic: string;
    userStatement: string;
    emotionalTone?: string;
    previousQuestions?: SocraticQuestionType[];
}
/**
 * Determine the best question type for the context
 */
export declare function selectQuestionType(userMessage: string, context?: Partial<SocraticContext>): SocraticQuestionType;
/**
 * Generate a Socratic question
 */
export declare function generateSocraticQuestion(context: SocraticContext): SocraticQuestion;
/**
 * Generate multiple questions for a topic
 */
export declare function generateQuestionSequence(topic: string, depth?: number): SocraticQuestion[];
/**
 * Generate a Socratic response that blends validation with inquiry
 */
export declare function generateSocraticResponse(userMessage: string, emotionalTone?: string): {
    validation: string;
    question: SocraticQuestion;
    combined: string;
    ssml: string;
};
/**
 * Build LLM context for Socratic questioning
 */
export declare function buildSocraticContext(userMessage: string, previousQuestions?: SocraticQuestionType[]): string;
declare const _default: {
    selectQuestionType: typeof selectQuestionType;
    generateSocraticQuestion: typeof generateSocraticQuestion;
    generateQuestionSequence: typeof generateQuestionSequence;
    generateSocraticResponse: typeof generateSocraticResponse;
    buildSocraticContext: typeof buildSocraticContext;
};
export default _default;
//# sourceMappingURL=socratic-engine.d.ts.map