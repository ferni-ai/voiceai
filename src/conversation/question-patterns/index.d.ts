/**
 * Question Patterns Module
 *
 * Clean architecture refactoring of the question pattern system.
 * Split into focused modules:
 * - types.ts: Type definitions
 * - templates.ts: Question templates by type
 * - persona-styles.ts: Persona-specific preferences
 * - engine.ts: Question generation engine
 *
 * @module @ferni/conversation/question-patterns
 */
export type { PersonaCustomQuestion, PersonaQuestionStyle, Question, QuestionContext, QuestionTemplate, QuestionType, } from './types.js';
export { QUESTION_TEMPLATES } from './templates.js';
export { PERSONA_QUESTION_STYLES } from './persona-styles.js';
export { QuestionPatternEngine, default } from './engine.js';
import { QuestionPatternEngine } from './engine.js';
export declare function getQuestionPatternEngine(): QuestionPatternEngine;
export declare function resetQuestionPatternEngine(): void;
//# sourceMappingURL=index.d.ts.map