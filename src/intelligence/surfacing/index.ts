/**
 * Proactive Surfacing Module
 *
 * Determines WHEN and WHAT to proactively surface to users:
 * - Timing Intelligence
 * - Content Selection
 * - Delivery Strategy
 *
 * @module intelligence/surfacing
 */

export {
  // Engine
  ProactiveSurfacingEngine,
  TimingIntelligence,
  getSurfacingEngine,
  // Functions
  queueForSurfacing,
  getNextSurfacing,
  generateAndQueueSuggestions,
  // Types
  type SurfaceContentType,
  type DeliveryChannel,
  type SurfacingPriority,
  type SurfaceContent,
  type TimingDecision,
  type SurfacingPreferences,
} from './proactive-surfacing-engine.js';
