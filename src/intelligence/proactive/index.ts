/**
 * Proactive Intelligence Module
 *
 * Timing intelligence for surfacing insights at the right moment.
 *
 * @module intelligence/proactive
 */

export {
  // Core functions
  checkProactiveTriggers,
  markInsightSurfaced,
  recordInsightReaction,
  wasInsightSurfaced,
  getInsightReaction,
  // Session management
  initProactiveSession,
  cleanupProactiveSession,
  // Preferences
  getProactivePreferences,
  updateProactivePreferences,
  // Cleanup
  clearProactiveState,
  // Singleton
  proactiveEngine,
  // Types
  type SurfaceMoment,
  type InsightCategory,
  type ProactiveIntelligenceInsight,
  type ProactiveTriggerResult,
  type ProactivePreferences,
} from './proactive-engine.js';
