/**
 * Cognitive Question Templates
 *
 * Each persona asks different kinds of questions based on their
 * cognitive style. This creates truly differentiated conversations.
 */
import type { ReasoningStyle } from '../personas/cognitive-types.js';
export interface CognitiveQuestion {
    text: string;
    purpose: string;
    style: ReasoningStyle;
    depth: 'surface' | 'moderate' | 'deep';
    expectedResponse: 'factual' | 'emotional' | 'reflective' | 'action' | 'exploratory';
}
export interface CognitiveQuestionContext {
    personaId: string;
    topic: string;
    userCognitiveStyle?: string;
    emotionalWeight: number;
    conversationDepth: 'surface' | 'moderate' | 'deep';
    recentQuestions?: string[];
}
/**
 * Generate a cognitive-appropriate question for a persona
 */
export declare function generateCognitiveQuestion(context: CognitiveQuestionContext): CognitiveQuestion | null;
/**
 * Get all question templates for a reasoning style
 */
export declare function getQuestionsForStyle(style: ReasoningStyle): CognitiveQuestion[];
/**
 * Get persona's favorite questions
 */
export declare function getPersonaFavoriteQuestions(personaId: string): string[];
declare const _default: {
    generateCognitiveQuestion: typeof generateCognitiveQuestion;
    getQuestionsForStyle: typeof getQuestionsForStyle;
    getPersonaFavoriteQuestions: typeof getPersonaFavoriteQuestions;
    COGNITIVE_QUESTION_TEMPLATES: Record<ReasoningStyle, CognitiveQuestion[]>;
};
export default _default;
//# sourceMappingURL=cognitive-questions.d.ts.map