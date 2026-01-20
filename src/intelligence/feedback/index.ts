/**
 * Feedback Module
 *
 * Phase 1 of BTH Communication System Overhaul:
 * Track injection effectiveness and learn what works.
 *
 * @module intelligence/feedback
 */

export {
  // Types
  type MinimalInjection,
  type TrackedInjection,
  type InjectionFeedback,
  type BuilderMetrics,

  // Core tracking
  tagInjectionsForTracking,
  analyzeResponseAlignment,
  recordUserReaction,

  // Session management
  getSessionFeedback,
  getSessionMetrics,
  cleanupSession,

  // Aggregation
  aggregateBuilderMetrics,
} from './injection-tracker.js';
