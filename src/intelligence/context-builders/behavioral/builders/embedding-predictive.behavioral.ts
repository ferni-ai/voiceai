/**
 * Embedding Predictive Behavioral Builder
 *
 * Translates embedding-powered predictive intelligence into behavioral signals.
 *
 * SIGNALS EMITTED:
 * - Avoidance proximity → careful/protective tone
 * - Breakthrough readiness → encouraging/curious tone
 * - Trajectory match → preventive/supportive style
 * - Community insights → confident recommendations
 * - Ripple predictions → holistic awareness
 * - Intervention matching → optimal approach selection
 *
 * @module intelligence/context-builders/behavioral/builders/embedding-predictive
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { ContextBuilderInput } from '../../core/types.js';
import { registerBehavioralBuilder } from '../orchestrator.js';
import type { BehavioralSignals } from '../signals.js';

const log = createLogger({ module: 'EmbeddingPredictiveBehavior' });

// ============================================================================
// BUILDER
// ============================================================================

/**
 * Build behavioral signals from embedding intelligence
 */
async function buildEmbeddingPredictiveBehavior(
  input: ContextBuilderInput
): Promise<BehavioralSignals> {
  const { services } = input;
  const userId = services?.userId;
  const sessionId = services?.sessionId;

  if (!userId) {
    return {
      source: 'embedding-predictive',
      confidence: 0,
      priority: 0,
    };
  }

  const signals: BehavioralSignals = {
    source: 'embedding-predictive',
    confidence: 0.6,
    priority: 45, // Slightly below core predictive (50)
    callbacks: [],
  };

  try {
    // ========================================================================
    // 1. CONVERSATION TRAJECTORY
    // ========================================================================
    if (sessionId) {
      const { conversationTrajectory } =
        await import('../../../predictive/embeddings/conversation-trajectory.js');

      const analysis = conversationTrajectory.analyzeTrajectory(sessionId);

      if (analysis) {
        // Pattern-based signals
        switch (analysis.pattern) {
          case 'circling':
            signals.tone = 'gentle';
            signals.callbacks?.push({
              type: 'avoidance',
              hint: 'Circling detected - gently name what you notice',
              strength: 'natural',
            });
            break;

          case 'avoiding':
            signals.tone = 'warm';
            signals.style = 'supportive';
            signals.modes = { ...signals.modes, spiralRiskMode: true };
            break;

          case 'deepening':
            signals.tone = 'encouraging';
            signals.depth = 'deep';
            signals.callbacks?.push({
              type: 'breakthrough',
              hint: 'Conversation deepening - trust building',
              strength: 'natural',
            });
            break;

          case 'wandering':
            signals.callbacks?.push({
              type: 'suggestion',
              hint: 'Consider grounding in one thread',
              strength: 'gentle',
            });
            break;
        }

        // Emotional direction signals
        if (analysis.emotionalDirection === 'declining') {
          signals.tone = 'warm';
          signals.callbacks?.push({
            type: 'prevention',
            hint: 'Emotional decline detected - check in',
            strength: 'natural',
          });
        } else if (analysis.emotionalDirection === 'volatile') {
          signals.pace = 'slow';
          signals.style = 'supportive';
        }

        // Depth signals
        if (analysis.depth === 'deep') {
          signals.depth = 'deep';
          signals.length = 'expansive';
        } else if (analysis.depth === 'surface') {
          signals.depth = 'surface';
        }
      }
    }

    // ========================================================================
    // 2. SEMANTIC AVOIDANCE
    // ========================================================================
    const { semanticAvoidance } =
      await import('../../../predictive/embeddings/semantic-avoidance.js');

    const avoidanceContext = semanticAvoidance.buildSemanticAvoidanceContext(userId);
    if (avoidanceContext && avoidanceContext.length > 50) {
      // Has significant avoidance patterns
      signals.tone = 'gentle';
      signals.callbacks?.push({
        type: 'avoidance',
        hint: 'Known avoidance patterns active',
        strength: 'gentle',
      });
    }

    // ========================================================================
    // 3. INTERVENTION MATCHING
    // ========================================================================
    const currentTopic = input.analysis.topics.primary;
    const emotionalState = input.analysis.emotion.primary;

    if (currentTopic && emotionalState) {
      const { interventionMatching } =
        await import('../../../predictive/embeddings/intervention-matching.js');

      const recommendation = await interventionMatching.getBestIntervention(userId, {
        transcript: input.userText || '',
        emotionalState,
        topic: currentTopic,
      });

      if (recommendation && recommendation.confidence > 0.5) {
        // Map intervention to behavioral signals
        const interventionSignals = mapInterventionToSignals(recommendation.intervention);
        Object.assign(signals, interventionSignals);

        signals.callbacks?.push({
          type: 'suggestion',
          hint: `${recommendation.intervention} worked ${Math.round(recommendation.successRate * 100)}% in similar situations`,
          strength: recommendation.confidence > 0.7 ? 'important' : 'natural',
        });
      }
    }

    // ========================================================================
    // 4. BREAKTHROUGH READINESS
    // ========================================================================
    const { breakthroughEmbeddings } =
      await import('../../../predictive/embeddings/breakthrough-embeddings.js');

    if (currentTopic && emotionalState) {
      const prediction = await breakthroughEmbeddings.predictBreakthroughReadiness(userId, {
        topic: currentTopic,
        conversationContext: input.userText || '',
        emotionalState,
        indicators: [],
      });

      if (prediction && prediction.readiness > 0.6) {
        signals.tone = 'encouraging';
        signals.modes = { ...signals.modes, breakthroughMode: true };

        if (prediction.optimalCatalysts.length > 0) {
          const topCatalyst = prediction.optimalCatalysts[0];
          signals.callbacks?.push({
            type: 'breakthrough',
            hint: `Breakthrough readiness ${Math.round(prediction.readiness * 100)}% - ${topCatalyst.description}`,
            strength: 'important',
          });
        }
      }
    }

    // ========================================================================
    // 5. RIPPLE AWARENESS
    // ========================================================================
    const { rippleEmbeddingSpace } =
      await import('../../../predictive/embeddings/ripple-embedding-space.js');

    if (currentTopic) {
      const related = await rippleEmbeddingSpace.findRelatedDomains(userId, currentTopic, 3);

      if (related.length > 0 && related[0].similarity > 0.6) {
        // Current topic is semantically close to tracked domains
        signals.callbacks?.push({
          type: 'ripple',
          hint: `Topic connected to: ${related.map((r) => r.domain).join(', ')}`,
          strength: 'gentle',
        });
      }
    }

    // ========================================================================
    // 6. COMMUNITY LEARNING
    // ========================================================================
    const { cognitiveSimilarity } =
      await import('../../../predictive/embeddings/cognitive-similarity.js');

    const communityContext = await cognitiveSimilarity.buildCommunityLearningContext(userId);
    if (communityContext && communityContext.length > 50) {
      // Has community insights
      signals.confidence = Math.min(1, (signals.confidence ?? 0.5) + 0.1);
    }

    // Set confidence based on signals generated
    if (signals.callbacks && signals.callbacks.length > 0) {
      signals.confidence = Math.min(1, 0.5 + signals.callbacks.length * 0.1);
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Embedding behavior builder failed (non-fatal)');
  }

  return signals;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapInterventionToSignals(intervention: string): Partial<BehavioralSignals> {
  const mapping: Record<string, Partial<BehavioralSignals>> = {
    validation: {
      tone: 'warm',
      style: 'supportive',
    },
    grounding: {
      tone: 'grounding',
      pace: 'slow',
    },
    reflection: {
      tone: 'contemplative',
      style: 'coaching',
      questionStyle: 'reflective',
    },
    reframe: {
      tone: 'encouraging',
      style: 'coaching',
    },
    challenge: {
      tone: 'direct',
      style: 'challenging',
    },
    presence: {
      tone: 'warm',
      pace: 'slow',
    },
    celebration: {
      tone: 'encouraging',
    },
    psychoeducation: {
      style: 'directive',
      length: 'expansive',
    },
    boundary_setting: {
      tone: 'direct',
      style: 'coaching',
    },
    future_pacing: {
      tone: 'encouraging',
      questionStyle: 'open',
    },
  };

  return mapping[intervention] || {};
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerBehavioralBuilder({
  name: 'embedding-predictive',
  description: 'Behavioral signals from embedding-powered predictive intelligence',
  priority: 45,
  category: 'predictive',
  build: buildEmbeddingPredictiveBehavior,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildEmbeddingPredictiveBehavior };
