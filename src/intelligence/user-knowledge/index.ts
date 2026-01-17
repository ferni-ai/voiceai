/**
 * User Knowledge Module - "Better Than Human" Unified Intelligence
 *
 * Single source of truth for everything we know about a user.
 *
 * > "Your best friend forgets. We don't."
 *
 * @module intelligence/user-knowledge
 */

// Main aggregator
export { getUserKnowledge, clearKnowledgeCache } from './aggregator.js';

// Context formatting
export {
  formatKnowledgeForContext,
  getKnowledgeContextForLLM,
  buildBoundaryContext,
  buildEngagementContext,
} from './context-builder.js';

// Queries
export {
  askAboutUser,
  doWeKnow,
  getUserAllergies,
  getUserMusicPreferences,
  getAvoidTopics,
  getUserDreams,
  getKeyPeople,
  getFerniCommitments,
  getKnowledgeCompleteness,
  getOpenLoops,
  getInsideJokes,
} from './queries.js';

// Types
export type {
  UserKnowledge,
  IdentityKnowledge,
  LifestyleKnowledge,
  RelationshipKnowledge,
  AspirationsKnowledge,
  WellnessKnowledge,
  WorkKnowledge,
  CommunicationKnowledge,
  EmotionalKnowledge,
  PatternKnowledge,
  BoundaryKnowledge,
  SharedHistoryKnowledge,
  KnowledgeMetadata,
  KnowledgeOptions,
  KnowledgeContext,
  ContextFormatOptions,
  QueryResult,
  ContactInfo,
  KeyPerson,
  RelationshipPattern,
  DreamItem,
  CommitmentItem,
  GoalItem,
  ValueItem,
  EmotionalPattern,
  BehaviorPattern,
  TemporalPattern,
  CorrelationPattern,
  SensitivityItem,
  FerniCommitmentItem,
  InsideJokeItem,
  OpenLoopItem,
  MilestoneItem,
} from './types.js';
