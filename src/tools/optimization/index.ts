/**
 * Tool Optimization System
 *
 * Unified exports for the automated tool optimization infrastructure.
 * This system continuously learns from user interactions and optimizes
 * the tool ecosystem automatically.
 *
 * Components:
 * - Feedback Collection: Capture explicit and implicit user feedback
 * - Pattern Analysis: Discover usage patterns and opportunities
 * - Recommendations: Generate data-driven improvement suggestions
 * - Auto-Optimization: Continuous improvement loop with A/B testing
 */

// =============================================================================
// FEEDBACK COLLECTION
// =============================================================================

export {
  feedbackCollector,
  FeedbackCollector,
  type FeedbackRecord,
  type FeedbackSummary,
  type FeedbackType,
  type ConversationContext,
} from '../feedback-collector.js';

// =============================================================================
// PATTERN ANALYSIS
// =============================================================================

export {
  patternAnalyzer,
  PatternAnalyzer,
  type ToolCoOccurrence,
  type ToolSequence,
  type UserJourney,
  type GapAnalysis,
  type ConsolidationOpportunity,
  type UserSegment,
  type SessionData,
} from '../pattern-analyzer.js';

// =============================================================================
// RECOMMENDATION ENGINE
// =============================================================================

export {
  recommendationEngine,
  RecommendationEngine,
  type Recommendation,
  type RecommendationType,
  type Evidence,
  type ImpactAssessment,
  type ImplementationGuide,
} from '../recommendation-engine.js';

// =============================================================================
// AUTO OPTIMIZER
// =============================================================================

export {
  autoOptimizer,
  AutoToolOptimizer,
  type OptimizerConfig,
  type OptimizationReport,
  type OptimizationCycle,
} from '../auto-optimizer.js';

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Initialize the full optimization system
 */
export async function initializeOptimizationSystem(config?: {
  enableAutoRecommendations?: boolean;
  enableAutoExperiments?: boolean;
  enableAutoImplementation?: boolean;
  analysisIntervalMs?: number;
}): Promise<void> {
  const { autoOptimizer } = await import('../auto-optimizer.js');
  
  if (config) {
    // Create new instance with config would go here
    // For now, just start with defaults
  }
  
  autoOptimizer.start();
}

/**
 * Shutdown the optimization system gracefully
 */
export async function shutdownOptimizationSystem(): Promise<void> {
  const { autoOptimizer } = await import('../auto-optimizer.js');
  const { feedbackCollector } = await import('../feedback-collector.js');
  
  autoOptimizer.stop();
  await feedbackCollector.flush();
}

/**
 * Quick helper to record a user interaction
 */
export function recordInteraction(
  message: string,
  context: {
    userId: string;
    sessionId: string;
    agentId: string;
    turnNumber: number;
    recentTools: string[];
    lastToolResult?: string;
  },
  lastToolId?: string
): void {
  const { autoOptimizer } = require('../auto-optimizer.js');
  autoOptimizer.processUserMessage(message, context, lastToolId);
}

/**
 * Quick helper to record tool execution
 */
export function recordToolExecution(
  sessionId: string,
  toolId: string,
  success: boolean,
  latencyMs: number
): void {
  const { autoOptimizer } = require('../auto-optimizer.js');
  autoOptimizer.recordToolExecution(sessionId, toolId, success, latencyMs);
}

