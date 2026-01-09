/**
 * Coaching Module
 *
 * "Better Than Human" question generation and pattern detection.
 *
 * @module intelligence/coaching
 */

// Coaching Questions
export {
  getCoachingQuestion,
  generateMemoryGroundedQuestion,
  generatePatternQuestion,
  generateMirror,
  getAnticipatoryQuestion,
  detectPatterns,
  type MemoryGroundedQuestion,
  type PatternObservation,
  type MirrorReflection,
  type AnticipatedNeed,
} from './questions.js';

// Pattern Tracking
export {
  processTranscriptForPatterns,
  getUserPatterns,
  getPatternsToSurface,
  getPatternForSilence,
  markPatternSurfaced,
  generatePatternSurfacingQuestion,
  recordPattern,
  detectPatternsInTranscript,
  type UserPattern,
  type PatternType,
  type PatternContext,
  type PatternObservation as StoredPatternObservation,
} from './patterns.js';

// Memory Loader
export {
  loadCoachingMemories,
  getMemoriesForTopic,
  getSuggestedFollowUps,
  type CoachingMemory,
  type CoachingMemoryContext,
} from './memory-loader.js';

// Dynamic Questions
export {
  generateQuestion,
  getSilenceQuestion,
  getCheckInQuestion,
  getDeepeningQuestion,
  getPersonaQuestionCapabilities,
  clearQuestionHistory,
  type QuestionIntent,
  type QuestionContext,
  type GeneratedQuestion,
  type QuestionType,
  type GenerateQuestionOptions,
} from './dynamic-questions.js';
