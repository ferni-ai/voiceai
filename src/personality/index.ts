/**
 * Human Personality System
 *
 * Transforms personas from personalities that announce themselves to ones
 * that emerge through relevance and relationship.
 *
 * Philosophy:
 * - Personality through relevance, not repetition
 * - Per-user discovery over time
 * - Behavior over declaration
 * - The callback system (the smile factor)
 *
 * ## Architecture (2024-12)
 *
 * **PREFERRED** (use for new code):
 * - `memory-adapter.ts` - Semantic relevance, memory integration, callbacks
 * - `timing-intelligence.ts` - When to share vs listen
 * - `emotional-patterns.ts` - Pattern recognition, growth tracking
 * - `personal-moment-store.ts` - Moment registry for all personas
 *
 * ## CLEANUP (2024-12)
 * The following deprecated files have been REMOVED:
 * - `callback-system.ts` - Use memory-adapter.ts (getPendingCallbacksFromProfile)
 * - `relationship-memory.ts` - Use memory module (personas/relationship-memory/)
 * - `relevance-engine.ts` - Use memory-adapter.ts (findRelevantMomentSemantic)
 *
 * @module personality
 */

// Types
export type {
  CallbackExtractionOptions,
  HumanPersonalityContext,
  PendingCallback,
  PersonalMoment,
  PersonalMomentTopic,
  PersonalityRelationship,
  RelationshipStage,
  RelevanceMatch,
  RelevanceOptions,
  ShareDepth,
  SharedMomentRecord,
  UserMomentCategory,
  UserMomentRecord,
} from './types.js';

// Personal Moment Store
export {
  STANDARD_TRANSITIONS,
  createMoment,
  getAskableMoments,
  getMomentById,
  getMomentStats,
  getMomentsByDepth,
  getMomentsByTopic,
  getMomentsForPersona,
  getMomentsForRelationshipStage,
  getRegisteredPersonaIds,
  searchMomentsByKeyword,
} from './personal-moment-store.js';

// Memory-Integrated Adapter (preferred - uses existing memory infrastructure)
export {
  clearEmbeddingCache,
  createCallbackKeyMoment,
  createSharedStoryRecord,
  extractCallbackKeyMoments,
  findRelevantMomentSemantic,
  formatCallbackForPrompt,
  getDiscoveredTopicsFromStories,
  getPendingCallbacksFromProfile,
  warmUpAllPersonaEmbeddings,
  warmUpPersonaEmbeddings,
  wasMomentSharedWithUser,
} from './memory-adapter.js';

// Emotional Pattern Recognition (Superhuman - notice what they don't)
export {
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getGrowthCelebrations,
  getPatternInsights,
  markGrowthSurfaced,
  markPatternSurfaced,
  recordEmotionalDataPoint,
  recordGrowthEvidence,
  type EmotionalDataPoint,
  type EmotionalPattern,
  type EmotionalTrend,
  type GrowthMoment,
} from './emotional-patterns.js';

// Timing Intelligence (Superhuman - know when to share vs listen)
export {
  analyzeMessageTiming,
  formatTimingGuidance,
  shouldSharePersonalMoment,
  type MessageMetadata,
  type SuggestedResponse,
  type TimingAnalysis,
  type UserIntent,
} from './timing-intelligence.js';

// Callback Persistence (Save callbacks to Firestore)
export {
  extractAndSaveCallbacks,
  markCallbackComplete,
  saveKeyMoment,
} from './callback-persistence.js';

// Pattern Persistence (Save emotional patterns to Firestore)
export {
  getEmotionalDataPoints,
  getEmotionalPatterns,
  getGrowthMoments,
  markGrowthSurfaced as markGrowthSurfacedPersistent,
  markPatternSurfaced as markPatternSurfacedPersistent,
  saveEmotionalDataPoint,
  saveEmotionalPattern,
  saveGrowthMoment,
} from './pattern-persistence.js';

// Persona Moments (direct access if needed)
export { ALEX_MOMENTS } from './moments/alex-moments.js';
export { FERNI_MOMENTS } from './moments/ferni-moments.js';
export { JORDAN_MOMENTS } from './moments/jordan-moments.js';
export { MAYA_MOMENTS } from './moments/maya-moments.js';
export { NAYAN_MOMENTS } from './moments/nayan-moments.js';
export { PETER_MOMENTS } from './moments/peter-moments.js';
