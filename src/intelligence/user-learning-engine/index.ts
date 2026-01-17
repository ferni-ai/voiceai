/**
 * User Learning Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * The central orchestrator for making Ferni smarter over time.
 * Captures insights during conversations and persists them to user profiles.
 * Retrieves relevant memories to enrich context for better responses.
 *
 * Real friends remember what matters to you. They notice patterns,
 * celebrate your wins, and understand your struggles. This engine
 * is how Ferni becomes that friend - not through scripts, but through
 * genuine learning about each person.
 *
 * KEY RESPONSIBILITIES:
 * 1. Learn user preferences from conversation patterns
 * 2. Capture key moments (breakthroughs, concerns, celebrations)
 * 3. Index conversation insights for future retrieval
 * 4. Build dynamic context from user history
 * 5. Provide feedback loops on conversation quality
 *
 * @module intelligence/user-learning-engine
 */

// Re-export types
export type {
  LearningInsight,
  PreferenceUpdates,
  ConversationLearningData,
  DynamicUserContext,
  VoiceEmotionValidation,
  StoryRecord,
} from './types.js';

// Re-export the main implementation
export { UserLearningEngine, getLearningEngine, resetLearningEngine } from './engine.js';
