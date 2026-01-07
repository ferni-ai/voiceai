/**
 * Relationship Arc System
 *
 * > "Better than human" means tracking the full arc of a relationship,
 * > from first meeting through deep partnership.
 *
 * This module exports the complete relationship arc system, including:
 * - Stage-specific context builders
 * - Storage and persistence
 * - Type definitions
 *
 * ## Stages
 *
 * | Stage | Sessions | Key Behaviors |
 * |-------|----------|---------------|
 * | Stranger | 0-1 | Energy matching, vulnerability modeling, gift of noticing |
 * | Acquaintance | 2-5 | Shared history, gentle patterns, trust building |
 * | Friend | 6-15 | Inside jokes, growth reflection, gentle challenging |
 * | Trusted Advisor | 15+ | Life arc, values accountability, cross-domain synthesis |
 *
 * ## Usage
 *
 * The builders auto-activate based on relationship stage. Just import to register:
 *
 * ```typescript
 * import 'src/intelligence/context-builders/relationship-arc/index.js';
 * ```
 *
 * ## Storage
 *
 * Data is persisted to Firestore at:
 * `bogle_users/{userId}/relationship_arc/data`
 *
 * @module intelligence/context-builders/relationship-arc
 */

// Types
export type {
  RelationshipStage,
  StageConfig,
  DetectedEnergy,
  FirstMeetingData,
  KeyMomentType,
  KeyMoment,
  StageTransition,
  SharedVocabulary,
  RelationshipArcData,
  RelationshipArcInput,
} from './types.js';

export {
  STAGE_CONFIGS,
  createDefaultRelationshipArcData,
  determineStage,
  generateMomentId,
} from './types.js';

// Storage
export {
  loadRelationshipArcData,
  saveRelationshipArcData,
  recordFirstMeeting,
  recordKeyMoment,
  markFirstWordsCallbackMade,
  markMilestoneReferenced,
  addSharedVocabulary,
  incrementSessionStats,
  forceStageTransition,
  getUnreferencedMoments,
  getMomentsByType,
  canMakeFirstWordsCallback,
  getCurrentStage,
  clearArcCache,
  clearAllArcCache,
  prewarmArcCache,
} from './storage.js';

// Builders (import to register)
export {
  firstMeetingMagicBuilder,
  detectUserEnergy,
  checkIsFirstMeeting,
} from './first-meeting-magic.js';
export { acquaintanceDeepeningBuilder } from './acquaintance-deepening.js';
export { friendshipFloweringBuilder } from './friendship-flowering.js';
export { trustedAdvisorBuilder } from './trusted-advisor.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { loadRelationshipArcData, incrementSessionStats as incrementStats } from './storage.js';
import type { RelationshipStage } from './types.js';

/**
 * Get the current relationship stage for a user
 */
export async function getRelationshipStage(userId: string): Promise<RelationshipStage> {
  const data = await loadRelationshipArcData(userId);
  return data?.currentStage ?? 'stranger';
}

/**
 * Record end of session (increments session count, may trigger stage transition)
 */
export async function recordSessionEnd(userId: string, turnCount: number): Promise<void> {
  await incrementStats(userId, turnCount);
}

/**
 * Check if a user is past the "stranger" stage
 */
export async function hasEstablishedRelationship(userId: string): Promise<boolean> {
  const stage = await getRelationshipStage(userId);
  return stage !== 'stranger';
}

/**
 * Check if a user has reached "friend" or higher
 */
export async function isFriendOrHigher(userId: string): Promise<boolean> {
  const stage = await getRelationshipStage(userId);
  return stage === 'friend' || stage === 'trusted_advisor';
}
