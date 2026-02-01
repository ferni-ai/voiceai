/**
 * Relational Memory Module
 *
 * Store and retrieve relationship-specific memories:
 * - Inside jokes
 * - Conversation rituals
 * - Communication preferences
 * - Trust milestones
 *
 * ## Usage
 *
 * ```typescript
 * import { getRelationalMemory } from './services/superhuman/relational-memory/index.js';
 *
 * const relMem = getRelationalMemory();
 *
 * // Add an inside joke
 * const joke = await relMem.addJoke(userId, {
 *   content: "Remember when you said AI couldn't be funny?",
 *   originContext: "First session humor discussion",
 *   triggerKeywords: ['funny', 'humor', 'jokes', 'AI'],
 * });
 *
 * // Find relevant joke
 * const relevantJoke = await relMem.findRelevantJoke(userId, ['funny', 'joke']);
 *
 * // Add a ritual
 * const ritual = await relMem.addRitual(userId, {
 *   name: 'Morning check-in',
 *   description: 'Start with "How did you sleep?"',
 *   type: 'check-in',
 *   timing: 'session-start',
 *   phrases: ['How did you sleep?', 'Ready for another day?'],
 *   userPreference: 0.8,
 * });
 *
 * // Get rituals for session start
 * const startRituals = await relMem.getRitualsForTiming(userId, 'session-start');
 *
 * // Update communication preference
 * await relMem.updatePreference(userId, {
 *   category: 'tone',
 *   value: 'warm and casual',
 *   confidence: 0.8,
 *   sampleSize: 15,
 *   updatedAt: new Date(),
 * });
 *
 * // Add trust milestone
 * await relMem.addMilestone(userId, {
 *   type: 'first-vulnerability',
 *   description: 'User shared their anxiety for the first time',
 *   occurredAt: new Date(),
 *   sessionId: 'session-123',
 *   impactScore: 0.9,
 * });
 *
 * // Build context for LLM
 * const context = await relMem.buildContextForLLM(userId);
 * ```
 *
 * @module @ferni/services/superhuman/relational-memory
 */

// Types
export type {
  InsideJoke,
  ConversationRitual,
  CommunicationPreference,
  TrustMilestone,
  RelationalMemory,
  RelationshipStats,
  IRelationalMemory,
} from './types.js';

export { RelationalMemoryToken } from './types.js';

// Engine
export {
  RelationalMemoryEngine,
  getRelationalMemory,
  createRelationalMemory,
  resetRelationalMemory,
  clearUserData,
} from './engine.js';
