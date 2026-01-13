/**
 * Dynamic Tool Questions
 *
 * Provides contextual, persona-grounded questions for domain tools.
 * Replaces hardcoded question arrays with intelligent generation.
 *
 * Used by: stories, relationships, grief, meaning, crisis, curiosity domains
 *
 * @module tools/utils/dynamic-tool-questions
 */
export type QuestionDomain = 'stories' | 'relationships' | 'grief' | 'meaning' | 'crisis' | 'curiosity' | 'vulnerability' | 'presence';
export type QuestionFocus = 'childhood' | 'defining-moments' | 'relationships' | 'challenges' | 'joys' | 'lessons' | 'legacy' | 'trust' | 'communication' | 'conflict' | 'connection' | 'boundaries' | 'fresh-loss' | 'grief-waves' | 'chronic-grief' | 'anticipatory' | 'anniversary' | 'purpose' | 'values' | 'spirituality' | 'mortality' | 'exploration' | 'reflection' | 'action';
export interface ToolQuestionContext {
    personaId: string;
    domain: QuestionDomain;
    focus: QuestionFocus;
    specificContext?: string;
    emotionalTone?: 'gentle' | 'direct' | 'supportive' | 'curious';
    maxQuestions?: number;
}
export interface GeneratedToolQuestions {
    intro?: string;
    questions: string[];
    closingPrompt: string;
    personaStyle: string;
}
/**
 * Generate contextual, persona-grounded questions for a tool
 */
export declare function generateToolQuestions(context: ToolQuestionContext): GeneratedToolQuestions;
/**
 * Format questions for tool response output
 */
export declare function formatQuestionsForResponse(generated: GeneratedToolQuestions, options?: {
    numbered?: boolean;
    includeIntro?: boolean;
    includeClosing?: boolean;
    boldQuestions?: boolean;
}): string;
/**
 * Quick function to get questions for a domain
 */
export declare function getQuestions(personaId: string, domain: QuestionDomain, focus: QuestionFocus, specificContext?: string): string;
//# sourceMappingURL=dynamic-tool-questions.d.ts.map