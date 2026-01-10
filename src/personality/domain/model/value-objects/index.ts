/**
 * Value Objects Index
 *
 * Value objects are immutable domain primitives with behavior.
 * They encapsulate concepts and their invariants.
 *
 * @module personality/domain/model/value-objects
 */

export {
  RelationshipDepth,
  type RelationshipStage,
  type ShareDepth,
} from './relationship-depth.js';

export {
  EmotionalState,
  type PrimaryEmotion,
  type GranularEmotion,
  type EmotionalTrajectory,
  type EmotionSource,
} from './emotional-state.js';

export {
  AnticipatedEmotion,
  type AnticipationSignal,
  type AnticipationResponse,
  type AnticipationConfidence,
} from './anticipated-emotion.js';
