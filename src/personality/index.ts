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
 * **Persistence**:
 * - `callback-persistence.ts` - Callbacks to Firestore
 * - `pattern-persistence.ts` - Patterns to Firestore
 *
 * **Sub-modules** (used by emotional-patterns.ts):
 * - `emotional-data.ts` - Data collection
 * - `pattern-analysis.ts` - Pattern detection
 * - `growth-tracking.ts` - Growth tracking
 *
 * ## CLEANUP (2024-12)
 * The following deprecated files have been REMOVED:
 * - `callback-system.ts` - Use memory-adapter.ts (getPendingCallbacksFromProfile)
 * - `relationship-memory.ts` - Use memory module (personas/relationship-memory/)
 * - `relevance-engine.ts` - Use memory-adapter.ts (findRelevantMomentSemantic)
 *
 * @module personality
 */

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// PERSONAL MOMENT STORE
// ============================================================================

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

// ============================================================================
// MEMORY-INTEGRATED ADAPTER (preferred - uses existing memory infrastructure)
// ============================================================================

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

// ============================================================================
// EMOTIONAL PATTERN RECOGNITION (Superhuman - notice what they don't)
// ============================================================================

// Main entry point (records data + analyzes patterns)
export { recordEmotionalDataPoint } from './emotional-patterns.js';

// Pattern insights
export {
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getGrowthCelebrations,
  getPatternInsights,
  type EmotionalDataPoint,
  type EmotionalPattern,
  type EmotionalTrend,
  type GrowthMoment,
} from './emotional-patterns.js';

// Memory management (in-memory)
export {
  clearAllUserEmotionalTracking,
  clearUserEmotionalData,
  clearUserGrowthMoments,
  clearUserPatterns,
  getEmotionalHistory,
  getEmotionalTrackingStats,
} from './emotional-patterns.js';

// Mark as surfaced (in-memory)
export {
  markGrowthSurfaced,
  markPatternSurfaced,
  recordGrowthEvidence,
} from './emotional-patterns.js';

// ============================================================================
// TIMING INTELLIGENCE (Superhuman - know when to share vs listen)
// ============================================================================

export {
  analyzeMessageTiming,
  formatTimingGuidance,
  shouldSharePersonalMoment,
  type MessageMetadata,
  type SuggestedResponse,
  type TimingAnalysis,
  type UserIntent,
} from './timing-intelligence.js';

// ============================================================================
// CALLBACK PERSISTENCE (Save callbacks to Firestore)
// ============================================================================

export {
  extractAndSaveCallbacks,
  markCallbackComplete,
  saveKeyMoment,
} from './callback-persistence.js';

// ============================================================================
// PATTERN PERSISTENCE (Save emotional patterns to Firestore)
//
// NOTE: These are the PERSISTENT versions that save to Firestore.
// Use these for cross-session pattern storage.
// The in-memory versions (markPatternSurfaced, markGrowthSurfaced) are for
// within-session tracking only.
// ============================================================================

export {
  getEmotionalDataPoints,
  getEmotionalPatterns,
  getGrowthMoments,
  saveEmotionalDataPoint,
  saveEmotionalPattern,
  saveGrowthMoment,
  // Persistent versions with clear naming
  markGrowthSurfaced as persistGrowthSurfaced,
  markPatternSurfaced as persistPatternSurfaced,
} from './pattern-persistence.js';

// ============================================================================
// PERSONA MOMENTS (direct access if needed)
// ============================================================================

export { ALEX_MOMENTS } from './moments/alex-moments.js';
export { FERNI_MOMENTS } from './moments/ferni-moments.js';
export { JORDAN_MOMENTS } from './moments/jordan-moments.js';
export { MAYA_MOMENTS } from './moments/maya-moments.js';
export { NAYAN_MOMENTS } from './moments/nayan-moments.js';
export { PETER_MOMENTS } from './moments/peter-moments.js';
