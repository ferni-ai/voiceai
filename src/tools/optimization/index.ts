/**
 * Tool Optimization System
 *
 * Data-driven tool optimization infrastructure:
 * - Pattern Analysis: User interaction patterns, co-occurrence, journeys
 * - Feedback Collection: Implicit and explicit tool feedback
 * - Recommendation Engine: Data-driven tool improvement recommendations
 * - Auto Optimizer: Automatic tool optimization based on usage patterns
 *
 * These are infrastructure services, not domain tools.
 */

// Re-export everything from the optimization modules
export * from './pattern-analyzer.js';
export * from './feedback-collector.js';
export * from './recommendation-engine.js';
export * from './auto-optimizer.js';

// Default exports for convenience
import { patternAnalyzer } from './pattern-analyzer.js';
import { feedbackCollector } from './feedback-collector.js';
import { recommendationEngine } from './recommendation-engine.js';
import { autoOptimizer } from './auto-optimizer.js';

export default {
  patternAnalyzer,
  feedbackCollector,
  recommendationEngine,
  autoOptimizer,
};
