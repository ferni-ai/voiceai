/**
 * Community Learning Context Builder
 *
 * Injects insights learned from the entire user community:
 * - Best response strategies for this context
 * - Effective questions that lead to breakthroughs
 * - Story recommendations based on resonance data
 * - Persona adjustments from A/B tests and emergent patterns
 *
 * This makes every conversation smarter because of collective learning.
 */

import { log } from '@livekit/agents';
import {
  registerContextBuilder,
  createHintInjection,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getCommunityInsights } from '../community-insights.js';
import { getAgentEvolution } from '../agent-evolution.js';

const getLogger = () => log();

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildCommunityLearningContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userProfile, analysis, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Only inject after a few turns to let conversation establish
  if (turnCount < 2) {
    return injections;
  }

  const personaId = persona.id;
  const userEmotion = analysis.emotion?.primary || 'neutral';
  const topic = analysis.topics?.primary || analysis.topics?.detected?.[0] || 'general';
  const relationshipStage = userProfile?.relationshipStage || 'new_acquaintance';

  try {
    // 1. Get best strategy from community data
    const communityInsights = getCommunityInsights();
    const bestStrategy = communityInsights.getBestStrategy({
      userEmotion,
      topic,
      relationshipStage,
      personaId,
    });

    if (bestStrategy && bestStrategy.confidence > 0.6) {
      injections.push(
        createHintInjection(
          'community_strategy',
          `[COMMUNITY LEARNING: "${bestStrategy.strategy}" responses work well here ` +
            `(${(bestStrategy.confidence * 100).toFixed(0)}% confident, ` +
            `${(bestStrategy.expectedEngagement * 100).toFixed(0)}% expected engagement). ` +
            `Alternatives: ${bestStrategy.alternatives.slice(0, 2).join(', ')}]`
        )
      );
    }

    // 2. Get effective questions for this topic
    const effectiveQuestions = communityInsights.getEffectiveQuestions(personaId, topic, 2);

    if (effectiveQuestions.length > 0 && Math.random() < 0.3) {
      // 30% chance to suggest
      const question = effectiveQuestions[0];
      injections.push(
        createHintInjection(
          'community_question',
          `[BREAKTHROUGH QUESTION: "${question.question}" has ` +
            `${(question.expectedBreakthroughRate * 100).toFixed(0)}% breakthrough rate ` +
            `in ${question.bestContext} context. Consider using it if natural.]`
        )
      );
    }

    // 3. Get persona adjustments
    const evolution = getAgentEvolution();
    const adjustments = evolution.getActiveAdjustments(personaId, {
      userEmotion,
      topic,
      relationshipStage,
    });

    if (adjustments.length > 0) {
      const adjustmentText = evolution.formatAdjustmentsForPrompt(adjustments);
      if (adjustmentText) {
        injections.push(createStandardInjection('persona_adjustments', adjustmentText));
      }
    }

    // 4. Get story recommendations (if storytelling is appropriate)
    if (turnCount > 5 && Math.random() < 0.2) {
      // 20% chance
      const recommendedStories = evolution.getRecommendedStories(
        personaId,
        { topic, relationshipStage, userEmotion },
        2
      );

      if (recommendedStories.length > 0) {
        const storyRec = recommendedStories[0];
        injections.push(
          createHintInjection(
            'story_recommendation',
            `[STORY SUGGESTION: "${storyRec.storyId}" scores ${(storyRec.score * 100).toFixed(0)}% ` +
              `effectiveness here - ${storyRec.reason}. Consider if a story fits.]`
          )
        );
      }
    }

    if (injections.length > 0) {
      getLogger().debug(
        { personaId, injectionCount: injections.length, topic, emotion: userEmotion },
        'Community learning context injected'
      );
    }
  } catch (error) {
    getLogger().warn({ error }, 'Failed to build community learning context');
  }

  return injections;
}

// ============================================================================
// SIGNAL RECORDING (Called after responses)
// ============================================================================

/**
 * Record response effectiveness signal
 * Call this after each agent response to contribute to community learning
 */
export function recordResponseSignal(params: {
  personaId: string;
  context: {
    userEmotion: string;
    topic: string;
    relationshipStage: string;
    turnInConversation: number;
  };
  strategy: {
    type: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation';
    hadPersonalShare: boolean;
    hadQuirk: boolean;
    hadTeamReference: boolean;
    responseLength: 'brief' | 'moderate' | 'lengthy';
  };
  outcome: {
    engagementScore: number;
    userContinued: boolean;
    emotionalShift: 'positive' | 'neutral' | 'negative';
    topicDepthened: boolean;
    askFollowUp: boolean;
  };
}): void {
  try {
    const insights = getCommunityInsights();
    
    insights.recordResponseSignal({
      context: {
        ...params.context,
        personaId: params.personaId,
        timeOfDay: getTimeOfDay(),
      },
      strategy: params.strategy,
      outcome: params.outcome,
      recordedAt: new Date(),
    });
  } catch (error) {
    getLogger().warn({ error }, 'Failed to record response signal');
  }
}

/**
 * Record story usage and reaction
 */
export function recordStoryUsage(params: {
  storyId: string;
  personaId: string;
  topic: string;
  relationshipStage: string;
  userEmotion: string;
  reaction: 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent';
  engagementScore: number;
}): void {
  try {
    const insights = getCommunityInsights();
    
    insights.recordStoryUsage(
      params.storyId,
      params.personaId,
      {
        topic: params.topic,
        relationshipStage: params.relationshipStage,
        userEmotion: params.userEmotion,
      },
      params.reaction,
      params.engagementScore
    );
  } catch (error) {
    getLogger().warn({ error }, 'Failed to record story usage');
  }
}

/**
 * Record a question that led to a breakthrough
 */
export function recordBreakthroughQuestion(params: {
  questionPattern: string;
  personaId: string;
  topic: string;
  context: string;
  engagementLift: number;
}): void {
  try {
    const insights = getCommunityInsights();
    
    insights.recordBreakthroughQuestion(
      params.questionPattern,
      params.personaId,
      params.topic,
      params.context,
      params.engagementLift
    );
  } catch (error) {
    getLogger().warn({ error }, 'Failed to record breakthrough question');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'community_learning',
  description: 'Injects insights learned from community patterns',
  priority: 60, // Run after most builders but before final formatting
  build: buildCommunityLearningContext,
});

export { buildCommunityLearningContext };

