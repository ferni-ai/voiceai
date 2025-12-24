/**
 * Learning System - Active Learning for Semantic Router
 *
 * Two learning layers:
 * 1. Individual - Per-user corrections and preferences
 * 2. Community - Aggregated patterns from all users (privacy-preserving)
 *
 * @module tools/semantic-router/learning
 */

// Individual user learning
export {
  recordCorrection,
  recordImplicitCorrection,
  recordToolUsage,
  getCorrections,
  getUserPreferences,
  getToolBoostForUser,
  getCorrectionAnalytics,
  initializeCorrectionStore,
  type RoutingCorrection,
  type UserPreferences,
  type CorrectionAnalytics,
} from './correction-store.js';

// Community learning (aggregated, privacy-preserving)
export {
  initializeCommunityLearning,
  reportCorrectionToCommunity,
  getCommunityPatternsForQuery,
  getCommunityCorrection,
  getActivePatterns,
  getPatternStats,
  applyCommunityLearning,
  type CommunityPattern,
} from './community-learning.js';
