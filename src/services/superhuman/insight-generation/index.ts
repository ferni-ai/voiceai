/**
 * Insight Generation Engine - Main Export
 *
 * The superhuman insight generation system that transforms captured data
 * into actionable, surfaceable insights that make Ferni "Better Than Human".
 *
 * ## 10 Insight Categories
 *
 * 1. **Cross-Domain Correlation** - "Your sleep drops when work stress increases"
 * 2. **Unspoken Awareness** - "You haven't mentioned X in weeks"
 * 3. **Voice-Content Mismatch** - "You said fine but sounded heavy"
 * 4. **Growth Trajectory** - "Remember when you couldn't even..."
 * 5. **Relationship Network** - "You light up when Sarah comes up"
 * 6. **Commitment Pattern** - "You keep exercise but struggle with social"
 * 7. **Temporal Rhythm** - "Sunday evenings are consistently hard"
 * 8. **Dream Decay** - "That dream went quiet..."
 * 9. **Anticipatory** - "Your review is next week, last time..."
 * 10. **First-Time Celebration** - "A month ago you first told me..."
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   generateAllInsights,
 *   getInsightsToSurface,
 *   formatInsightsForPrompt,
 * } from './insight-generation/index.js';
 *
 * // Generate all insights for a user
 * const result = await generateAllInsights(userId, {
 *   currentEmotion: 'stressed',
 *   currentTopic: 'work',
 * });
 *
 * // Get insights to surface based on current context
 * const toSurface = await getInsightsToSurface(userId, context);
 *
 * // Format for LLM injection
 * const promptSection = formatInsightsForPrompt(toSurface);
 * ```
 *
 * @module services/superhuman/insight-generation
 */

// Initialize all generators (self-registering on import)
import './generators/index.js';

// Export types
export type * from './types.js';

// Export engine functions
export {
  // Main generation
  generateAllInsights,
  generateCategoryInsights,

  // Surfacing
  getInsightsToSurface,
  queryCachedInsights,
  formatInsightsForPrompt,

  // State management
  markInsightSurfaced,
  dismissInsight,
  clearInsightCache,

  // Registry
  registerInsightGenerator,
  getRegisteredGenerators,
  getEngineStats,
} from './engine.js';

// Export individual generators for direct use
export {
  crossDomainCorrelationGenerator,
  unspokenAwarenessGenerator,
  voiceContentMismatchGenerator,
  growthTrajectoryGenerator,
  relationshipNetworkGenerator,
  commitmentPatternGenerator,
  temporalRhythmGenerator,
  dreamDecayGenerator,
  anticipatoryGenerator,
  firstTimeCelebrationGenerator,
  initializeGenerators,
} from './generators/index.js';

// Re-export engine as default for convenience
import {
  generateAllInsights,
  getInsightsToSurface,
  formatInsightsForPrompt,
  clearInsightCache,
  getEngineStats,
} from './engine.js';

export const insightEngine = {
  generate: generateAllInsights,
  getSurfaceable: getInsightsToSurface,
  format: formatInsightsForPrompt,
  clearCache: clearInsightCache,
  getStats: getEngineStats,
};

export default insightEngine;
