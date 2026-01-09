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

// Types
export type {
  PersonaCustomQuestion,
  PersonaQuestionStyle,
  Question,
  QuestionContext,
  QuestionTemplate,
  QuestionType,
} from './types.js';

// Templates
export { QUESTION_TEMPLATES } from './templates.js';

// Persona styles
export { PERSONA_QUESTION_STYLES } from './persona-styles.js';

// Engine
export { QuestionPatternEngine, default } from './engine.js';

// ============================================================================
// SINGLETON
// ============================================================================

import { QuestionPatternEngine } from './engine.js';

let instance: QuestionPatternEngine | null = null;

export function getQuestionPatternEngine(): QuestionPatternEngine {
  if (!instance) {
    instance = new QuestionPatternEngine();
  }
  return instance;
}

export function resetQuestionPatternEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
