/**
 * Memory Lane Service
 *
 * Surfaces meaningful moments from past conversations, creating
 * a sense of shared history between the user and Ferni.
 *
 * Features:
 * - "On This Day" anniversary moments
 * - Growth and progress highlights
 * - Relationship depth markers
 * - Emotional breakthrough moments
 *
 * @module services/memory-lane
 */

// Types
export * from './types.js';

// Memory collection
export {
  memoryCollector,
  collectAllMemories,
  loadMemories,
  loadOnThisDayMemories,
  saveMemory,
  processCollectionInput,
} from './memory-collector.js';

// Highlight scoring
export {
  highlightScorer,
  scoreMemory,
  getHighlights,
  getOnThisDayHighlights,
  markMemorySurfaced,
  recordReaction,
} from './highlight-scorer.js';

// Real-time collection hooks
export {
  memoryLaneRealTime,
  captureCommitment,
  captureDream,
  captureInsideJoke,
  captureMilestone,
  captureCelebration,
  captureConversationMoment,
} from './real-time-collector.js';
