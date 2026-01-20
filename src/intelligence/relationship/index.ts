/**
 * Relationship Memory Module
 *
 * > "Every interaction is part of an ongoing relationship, not a one-time transaction."
 *
 * Implements Core Principle #2: Relationship Over Transaction
 *
 * This module provides:
 * - Relationship stage tracking (stranger → confidant)
 * - Shared moment recording and retrieval
 * - Inside joke management
 * - Callback effectiveness learning
 * - Milestone tracking and celebration
 *
 * @module intelligence/relationship
 */

// ============================================================================
// ENGINE (Main API)
// ============================================================================

export {
  // Factory functions
  initializeRelationship,
  getRelationshipEngine,
  clearRelationshipEngine,
  clearAllRelationshipEngines,
  // Class (for advanced use)
  RelationshipEngine,
} from './engine.js';

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  RelationshipStage,
  RelationshipMemory,
  RelationshipContext,
  // Moments
  SharedMoment,
  SharedMomentType,
  MomentDetails,
  // Inside jokes
  InsideJoke,
  // Callbacks
  CallbackAttempt,
  CallbackResponse,
  CallbackEffectiveness,
  CallbackOpportunity,
  // Trajectory
  EmotionalTrajectory,
  SessionMood,
  // Milestones
  Milestone,
  MilestoneType,
  // Session
  SessionStartResult,
  // Config
  StageConfig,
} from './types.js';

export { STAGE_CONFIGS } from './types.js';

// ============================================================================
// PERSISTENCE (For direct access when needed)
// ============================================================================

export {
  loadRelationshipMemory,
  saveRelationshipMemory,
  deleteRelationshipMemory,
  createDefaultMemory,
} from './persistence.js';
