/**
 * Response Guidance Builder
 *
 * Builds guidance for response generation:
 * - Response length
 * - Topic transitions
 * - Story timing
 * - Humor guidance
 * - Pacing
 */

import {
  getConversationHumanizer,
  getEmotionalArcTracker,
  getResponseDynamicsEngine,
  getStoryTimingEngine,
} from '../../conversation/index.js';
import type { EmotionalState, ResponseGuidance, TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build response guidance (length, pacing, story timing)
 */
export function buildResponseGuidance(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: EmotionalState
): ResponseGuidance {
  const { persona, services, userData } = ctx;
  const { analysis, currentTopic, previousTopic, topicChanged } = analysisResult;

  const responseDynamics = getResponseDynamicsEngine();
  const storyTiming = getStoryTimingEngine();
  const humanizer = getConversationHumanizer(persona.id);

  // Record user message for dynamics
  responseDynamics.recordMessage('user', ctx.userText, analysis.topics.detected);

  // Get length guidance
  const lengthGuidance = responseDynamics.getLengthGuidance();

  // Get topic transition
  let topicTransition: string | undefined;
  const preResponseActions = humanizer.processUserMessage({
    personaId: persona.id,
    turnNumber: userData.turnCount || 0,
    userMessage: ctx.userText,
    userEmotion: analysis.emotion.primary,
    topic: currentTopic,
    isSeriousContext: (analysis.emotion.distressLevel || 0) > 0.5,
    wasPersonalSharing: analysis.state.userNeedsSupport || false,
  });

  if (preResponseActions.topicChange?.detected && preResponseActions.topicChange.transitionPhrase) {
    topicTransition = `[TOPIC SHIFT: ${preResponseActions.topicChange.transitionPhrase}]`;
  } else if (topicChanged && previousTopic && currentTopic) {
    const transition = responseDynamics.getTopicTransition(previousTopic, currentTopic);
    if (transition.phrase) {
      topicTransition = `[TOPIC SHIFT: Smoothly transition from ${previousTopic} to ${currentTopic}. Consider: "${transition.phrase}"]`;
    }
  }

  // Story timing
  let storyOpportunity: ResponseGuidance['storyOpportunity'];

  // Get the full emotional arc from the tracker for story timing
  const emotionalArc = getEmotionalArcTracker();
  const fullArc = emotionalArc.getArc();

  const storyContext = {
    turnCount: userData.turnCount || 0,
    conversationDurationMs: Date.now() - services.sessionStartTime,
    lastStoryTurn: userData.lastStoryTurn,
    storiesToldThisSession: userData.storiesShared || [],
    emotionalArc: fullArc, // Use the full EmotionalArc object
    userEngagement:
      analysis.emotion.intensity > 0.6
        ? ('high' as const)
        : analysis.emotion.intensity < 0.3
          ? ('low' as const)
          : ('medium' as const),
    userPacing: responseDynamics.getPacingAnalysis().userPacing,
    currentTopic,
    recentTopics: analysis.topics.detected,
  };

  const storyRecommendation = storyTiming.evaluateStoryTiming(persona, storyContext);
  if (storyRecommendation.shouldTell && storyRecommendation.story) {
    storyOpportunity = {
      story: storyRecommendation.story.content.slice(0, 200),
      transitionPhrase: storyRecommendation.transitionPhrase || '',
    };

    // Record story told
    storyTiming.recordStoryTold(storyRecommendation.story.id, userData.turnCount || 0);
    if (userData) {
      userData.lastStoryTurn = userData.turnCount || 0;
      if (!userData.storiesShared) userData.storiesShared = [];
      userData.storiesShared.push(storyRecommendation.story.id);
    }
  }

  // Humor guidance
  const humorGuidance = services.humorCalibration.getHumorGuidance(
    currentTopic || 'general',
    analysis.emotion.primary,
    userData.turnCount || 0
  );

  // Pacing from voice adapter
  const paceContext = services.voicePaceAdapter.getPaceContext();

  return {
    length: {
      min: 20,
      max: 100,
      guidance: lengthGuidance,
    },
    topicTransition,
    storyOpportunity,
    humor: {
      shouldAttempt: humorGuidance.shouldAttempt,
      type: humorGuidance.recommendedType,
      avoid: humorGuidance.avoidTypes,
    },
    pacing: paceContext || undefined,
  };
}
