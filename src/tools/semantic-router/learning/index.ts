/**
 * Learning System - Active Learning for Semantic Router
 *
 * @module tools/semantic-router/learning
 */

export {
  recordCorrection,
  recordImplicitCorrection,
  recordToolUsage,
  getCorrections,
  getUserPreferences,
  getToolBoostForUser,
  getCorrectionAnalytics,
  type RoutingCorrection,
  type UserPreferences,
  type CorrectionAnalytics,
} from './correction-store.js';
