/**
 * Embedding-Powered Predictive Intelligence
 *
 * Enhances the Better Than Human v4 predictive capabilities with
 * semantic understanding through embeddings.
 *
 * CAPABILITIES:
 * 1. Semantic Avoidance - Find thematically related avoided topics
 * 2. Trajectory Patterns - Match emotional sequences to past patterns
 * 3. Breakthrough Embeddings - Find similar breakthrough moments
 * 4. Conversation Trajectory - Track semantic drift in real-time
 * 5. Cognitive Similarity - Community learning from similar profiles
 * 6. Ripple Embedding Space - Domain influence through semantic proximity
 * 7. Intervention Matching - Situation-based intervention selection
 *
 * @module intelligence/predictive/embeddings
 */

// ============================================================================
// EXPORTS
// ============================================================================

export * from './semantic-avoidance.js';
export * from './trajectory-patterns.js';
export * from './breakthrough-embeddings.js';
export * from './conversation-trajectory.js';
export * from './cognitive-similarity.js';
export * from './ripple-embedding-space.js';
export * from './intervention-matching.js';

// ============================================================================
// NAMED IMPORTS FOR CONVENIENCE
// ============================================================================

import { semanticAvoidance } from './semantic-avoidance.js';
import { trajectoryPatterns } from './trajectory-patterns.js';
import { breakthroughEmbeddings } from './breakthrough-embeddings.js';
import { conversationTrajectory } from './conversation-trajectory.js';
import { cognitiveSimilarity } from './cognitive-similarity.js';
import { rippleEmbeddingSpace } from './ripple-embedding-space.js';
import { interventionMatching } from './intervention-matching.js';

// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================

export interface EmbeddingPredictiveContext {
  userId: string;
  sessionId?: string;
  currentTopic?: string;
  currentSituation?: {
    transcript: string;
    emotionalState: string;
    topic: string;
    conversationDepth?: 'surface' | 'moderate' | 'deep';
  };
}

/**
 * Get comprehensive embedding-powered predictive context
 *
 * Combines all 7 embedding capabilities into a unified context for LLM injection.
 */
export async function getEmbeddingPredictiveContext(
  context: EmbeddingPredictiveContext
): Promise<string> {
  const sections: string[] = [];
  
  try {
    // 1. Semantic Avoidance
    const avoidanceContext = semanticAvoidance.buildSemanticAvoidanceContext(context.userId);
    if (avoidanceContext) sections.push(avoidanceContext);
    
    // 2. Conversation Trajectory (if session active)
    if (context.sessionId) {
      const trajectoryContext = conversationTrajectory.buildTrajectoryContext(context.sessionId);
      if (trajectoryContext) sections.push(trajectoryContext);
    }
    
    // 3. Intervention Matching (if current situation provided)
    if (context.currentSituation) {
      const interventionContext = await interventionMatching.buildInterventionMatchingContext(
        context.userId,
        context.currentSituation
      );
      if (interventionContext) sections.push(interventionContext);
      
      // 4. Breakthrough Pattern Matching
      const breakthroughContext = await breakthroughEmbeddings.buildBreakthroughEmbeddingContext(
        context.userId,
        {
          topic: context.currentSituation.topic,
          conversationContext: context.currentSituation.transcript,
          emotionalState: context.currentSituation.emotionalState,
          indicators: [],  // Would be passed from breakthrough proximity
        }
      );
      if (breakthroughContext) sections.push(breakthroughContext);
      
      // 5. Trajectory Pattern Matching
      const patternContext = await trajectoryPatterns.buildTrajectoryPatternContext(
        context.userId,
        {
          signals: [],  // Would be passed from pre-trajectory detection
          contextDescription: context.currentSituation.transcript,
          lifeDomains: [],
          emotionalState: context.currentSituation.emotionalState,
        }
      );
      if (patternContext) sections.push(patternContext);
    }
    
    // 6. Ripple Embedding Space
    const rippleContext = await rippleEmbeddingSpace.buildRippleSpaceContext(
      context.userId,
      context.currentTopic
    );
    if (rippleContext) sections.push(rippleContext);
    
    // 7. Community Learning
    const communityContext = await cognitiveSimilarity.buildCommunityLearningContext(
      context.userId
    );
    if (communityContext) sections.push(communityContext);
    
  } catch (error) {
    // Fail silently - embedding context is enhancement, not critical
  }
  
  if (sections.length === 0) return '';
  
  return '\n=== EMBEDDING INTELLIGENCE ===\n' + sections.join('\n\n');
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

export {
  semanticAvoidance,
  trajectoryPatterns,
  breakthroughEmbeddings,
  conversationTrajectory,
  cognitiveSimilarity,
  rippleEmbeddingSpace,
  interventionMatching,
};
