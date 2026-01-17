/**
 * Question Patterns
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the question-patterns/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see question-patterns/index.ts for the new module structure
 * @module @ferni/conversation/question-patterns
 */

// Re-export everything from the new module
export {
  // Types
  type PersonaCustomQuestion,
  type PersonaQuestionStyle,
  type Question,
  type QuestionContext,
  type QuestionTemplate,
  type QuestionType,
  // Templates and styles
  QUESTION_TEMPLATES,
  PERSONA_QUESTION_STYLES,
  // Engine and singleton
  QuestionPatternEngine,
  getQuestionPatternEngine,
  resetQuestionPatternEngine,
  default,
} from './question-patterns/index.js';
