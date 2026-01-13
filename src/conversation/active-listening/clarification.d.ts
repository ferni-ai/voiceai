/**
 * Clarifying Questions
 *
 * Generates clarifying questions for deeper understanding.
 *
 * @module conversation/active-listening/clarification
 */
import type { ClarifyingQuestion } from './types.js';
/**
 * Generate a clarifying question
 */
export declare function generateClarifyingQuestion(type: ClarifyingQuestion['type'], context?: {
    topic?: string;
    previousStatement?: string;
}): ClarifyingQuestion;
//# sourceMappingURL=clarification.d.ts.map