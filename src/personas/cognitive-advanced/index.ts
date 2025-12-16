/**
 * Advanced Cognitive Intelligence System
 *
 * This module is being refactored into smaller, focused files.
 * This index file re-exports everything for backward compatibility.
 *
 * Module structure:
 * - types.ts: All type definitions
 * - cache.ts: Cognitive style caching
 * - (future) user-detection.ts: User cognitive style detection
 * - (future) handoff.ts: Cognitive handoff context
 * - (future) reasoning.ts: Multi-step reasoning chains
 * - (future) conflict.ts: Cognitive conflict resolution
 * - (future) learning.ts: Cognitive learning tracker
 * - (future) persistence.ts: Knowledge state persistence
 * - (future) growth.ts: Cognitive growth arc
 *
 * @see ../cognitive-advanced.ts for the original implementation
 */

// Re-export types
export type {
  UserCognitiveStyle,
  CognitiveSignals,
  CognitiveStyleCacheEntry,
  CognitiveHandoffContext,
  ReasoningStep,
  ReasoningChain,
  CognitiveConflict,
  ConflictResolutionApproach,
  CognitiveLearningEvent,
  CognitiveLearningProfile,
  KnowledgeState,
  KnownFact,
  Assumption,
  Uncertainty,
  CognitiveGrowthArc,
  GrowthStage,
  GrowthMarker,
} from './types.js';

// Re-export cache functions
export {
  generateCognitiveStyleCacheKey,
  getCachedCognitiveStyle,
  cacheCognitiveStyle,
  getCognitiveStyleCacheStats,
  clearCognitiveStyleCache,
} from './cache.js';

// Re-export everything from the main file (temporary until full refactor)
export {
  // User detection
  detectUserCognitiveStyle,
  // Handoff
  buildCognitiveHandoffContext,
  // Reasoning chains
  buildReasoningChain,
  getReasoningChainGuidance,
  // Conflict resolution
  detectCognitiveConflict,
  // Learning
  CognitiveLearningTracker,
  getCognitiveLearningTracker,
  // Knowledge state
  KnowledgeStateTracker,
  getKnowledgeStateTracker,
  // Growth arc
  getCognitiveGrowthProfile,
  buildCognitiveGrowthContext,
} from '../cognitive-advanced.js';
