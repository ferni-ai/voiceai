/**
 * Question Pattern Engine
 *
 * Generates contextually appropriate questions for natural conversation.
 *
 * @module @ferni/conversation/question-patterns/engine
 */
import type { Question, QuestionContext, QuestionType } from './types.js';
export declare class QuestionPatternEngine {
    private recentQuestionTypes;
    private recentQuestions;
    constructor();
    /**
     * Generate a question appropriate for the context
     */
    generateQuestion(context: QuestionContext): Question;
    /**
     * Generate an echo question from user's statement
     */
    generateEchoQuestion(userStatement: string): Question;
    /**
     * Generate a follow-up question based on response type needed
     */
    generateFollowUp(intent: 'deepen' | 'clarify' | 'move_on' | 'validate', context: QuestionContext): Question;
    /**
     * Get a quick conversational question tag
     */
    getQuestionTag(): string;
    /**
     * Check if a question type would be appropriate given recent history
     */
    isTypeAppropriate(type: QuestionType): boolean;
    /**
     * Generate a question asynchronously with LLM
     */
    generateQuestionAsync(context: QuestionContext): Promise<Question | null>;
    /**
     * Reset tracking
     */
    reset(): void;
    private selectQuestionType;
    private buildQuestion;
    private getExpectedResponse;
    private extractKeywords;
}
export default QuestionPatternEngine;
//# sourceMappingURL=engine.d.ts.map