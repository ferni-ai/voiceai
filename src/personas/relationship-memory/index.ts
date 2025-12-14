/**
 * Relationship Memory Engine - Exports
 *
 * > "Your best friend forgets. We don't."
 *
 * This module makes Ferni genuinely "Better than Human" at tracking
 * and leveraging relationship history.
 */

// Core types
export type {
  // Callbacks
  CallbackAttempt,
  CallbackEffectiveness,
  EmotionalTrajectory,
  // Inside jokes
  InsideJoke,
  InsideJokeSeed,
  // Context types
  RelationshipContext,
  // Main memory type
  RelationshipMemory,
  // Milestones
  RelationshipMilestone,
  RelationshipMilestoneType,
  RelationshipPromptInjection,
  // Relationship stages
  RelationshipStage,
  RelationshipStageConfig,
  RelationshipUpdateResult,
  // Shared moments
  SharedMoment,
  SharedMomentType,
  // Patterns
  TemporalPattern,
} from './types.js';

// Engine
export {
  RELATIONSHIP_STAGE_CONFIGS,
  RelationshipMemoryEngine,
  clearRelationshipEngine,
  getRelationshipEngine,
} from './engine.js';

// Persistence
export {
  RelationshipMemoryPersistence,
  getRelationshipPersistence,
  loadAllRelationshipMemories,
  loadRelationshipMemory,
  saveRelationshipMemory,
} from './persistence.js';
