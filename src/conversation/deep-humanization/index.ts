/**
 * Deep Humanization Types
 *
 * The mood tracker and the generators (breath sounds, spontaneous thoughts,
 * playfulness, ...) ran only inside applyDeepHumanization, which the post-LLM
 * humanizer called over a finished reply. That humanizer never ran on calls
 * and was removed, and the generators, mood tracker and behavior loader went
 * with it. What remains is the type surface; the humanizer still types its
 * session data with SessionMemory.
 *
 * @module @ferni/conversation/deep-humanization
 */

export type {
  HumanizationContext,
  HumanizationInjection,
  HumanizationSignals,
  ConversationMood,
  HumanizationType,
  SessionMemory,
} from './types.js';
