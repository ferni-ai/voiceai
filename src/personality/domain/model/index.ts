/**
 * Domain Model Index
 *
 * Exports all domain entities and value objects for the personality system.
 *
 * @module personality/domain/model
 */

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  RelationshipDepth,
  type RelationshipStage,
  type ShareDepth,
} from './value-objects/relationship-depth.js';

export {
  EmotionalState,
  type PrimaryEmotion,
  type GranularEmotion,
  type EmotionalTrajectory,
  type EmotionSource,
} from './value-objects/emotional-state.js';

export {
  AnticipatedEmotion,
  type AnticipationSignal,
  type AnticipationResponse,
  type AnticipationConfidence,
} from './value-objects/anticipated-emotion.js';

// ============================================================================
// ENTITIES
// ============================================================================

export {
  EmotionalPattern,
  type PatternType,
  type PatternDeliveryTiming,
  type PatternEvidence,
} from './emotional-pattern.js';

export {
  VulnerabilityDeposit,
  type VulnerabilityLevel,
  type VulnerabilityCategory,
  type FirstTimeMarker,
} from './vulnerability-deposit.js';

export {
  GrowthMilestone,
  type GrowthArea,
  type MilestoneSignificance,
  type GrowthEvidence,
} from './growth-milestone.js';

// ============================================================================
// AGGREGATE ROOT
// ============================================================================

export {
  PersonalityProfile,
  type PersonalMoment,
  type ConversationContext,
  type SharingDecision,
  type PersonalityDomainEvent,
} from './personality-profile.js';
