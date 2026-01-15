/**
 * Community Learning Module
 *
 * Contributes session learnings to community insights and
 * retrieves community-informed recommendations.
 *
 * @module user-learning-engine/community-learning
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getCommunityInsights } from '../collective/community-insights.js';
import { getAgentEvolution } from '../collective/agent-evolution.js';
import type { KeyMoment, EmotionalPattern } from '../../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityContextResult {
  suggestedStrategy?: string;
  recommendedStories?: string[];
  effectiveQuestions?: string[];
  adjustments?: string[];
}

export interface SessionContributionData {
  engagementScores: number[];
  userSatisfaction: 'positive' | 'neutral' | 'negative';
  breakthoughQuestions?: Array<{ question: string; engagementLift: number }>;
}

interface StoryRecord {
  storyId: string;
  theme: string;
  sharedAt: Date;
}

// ============================================================================
// HELPERS
// ============================================================================

function detectResponseType(
  content: string
): 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation' {
  const lower = content.toLowerCase();

  if (
    /\b(i remember|when i|back in|years ago|let me tell you|there was a time)\b/.test(lower) &&
    content.length > 150
  ) {
    return 'story';
  }

  if (/\b(understand|hear you|that must|feel|sorry to hear)\b/.test(lower)) {
    return 'empathy';
  }

  if (/\b(should|recommend|suggest|consider|try|important|make sure)\b/.test(lower)) {
    return 'advice';
  }

  if (content.includes('?') && content.length < 100) {
    return 'question';
  }

  if (/\b(haha|joke|kidding|😄|😂|!.*!)\b/.test(lower)) {
    return 'humor';
  }

  return 'explanation';
}

function getResponseLength(content: string): 'brief' | 'moderate' | 'lengthy' {
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 30) return 'brief';
  if (wordCount > 100) return 'lengthy';
  return 'moderate';
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function detectStoryReaction(
  userResponse: string
): 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent' {
  const lower = userResponse.toLowerCase();

  if (/\b(wow|amazing|incredible|beautiful|touching)\b/.test(lower)) return 'moved';
  if (/\b(inspired|motivat|encourage|excit)\b/.test(lower)) return 'inspired';
  if (/\b(me too|same|i also|i remember when|my|mine)\b/.test(lower)) return 'connected';
  if (/\b(tell me more|what happened|then what|how did)\b/.test(lower) || lower.includes('?'))
    return 'curious';

  return 'indifferent';
}

// ============================================================================
// COMMUNITY CONTRIBUTION
// ============================================================================

/**
 * Contribute session learnings to community insights
 * Call this at the end of each session to help improve all personas
 */
export function contributeToCommunnityLearning(
  personaId: string,
  sessionData: SessionContributionData,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionEmotions: EmotionalPattern[],
  topicsDiscussed: string[],
  sessionKeyMoments: KeyMoment[],
  sessionStoriesTold: StoryRecord[]
): void {
  const communityInsights = getCommunityInsights();

  try {
    // 1. Contribute response effectiveness signals
    const avgEngagement =
      sessionData.engagementScores.length > 0
        ? sessionData.engagementScores.reduce((a, b) => a + b, 0) /
          sessionData.engagementScores.length
        : 0.5;

    // Record general session signal
    for (let i = 0; i < conversationHistory.length - 1; i += 2) {
      const userMsg = conversationHistory[i];
      const assistantMsg = conversationHistory[i + 1];

      if (userMsg?.role === 'user' && assistantMsg?.role === 'assistant') {
        const emotion = sessionEmotions[Math.floor(i / 2)]?.emotion || 'neutral';
        const topic = topicsDiscussed[0] || 'general';

        // Analyze response type
        const responseType = detectResponseType(assistantMsg.content);

        communityInsights.recordResponseSignal({
          context: {
            userEmotion: emotion,
            topic,
            relationshipStage: 'acquaintance', // Would come from profile
            personaId,
            timeOfDay: getTimeOfDay(),
            turnInConversation: i,
          },
          strategy: {
            type: responseType,
            hadPersonalShare: /\bi\s+(remember|recall|had|was|felt|think)\b/i.test(
              assistantMsg.content
            ),
            hadQuirk: false, // Would need more context
            hadTeamReference: /\b(Maya|Jordan|Alex|Peter|Ferni)\b/.test(assistantMsg.content),
            responseLength: getResponseLength(assistantMsg.content),
          },
          outcome: {
            engagementScore: sessionData.engagementScores[Math.floor(i / 2)] || avgEngagement,
            userContinued: i + 2 < conversationHistory.length,
            emotionalShift:
              sessionData.userSatisfaction === 'positive'
                ? 'positive'
                : sessionData.userSatisfaction === 'negative'
                  ? 'negative'
                  : 'neutral',
            topicDepthened: topicsDiscussed.length < 3, // Few topics = deep conversation
            askFollowUp:
              i + 2 < conversationHistory.length &&
              conversationHistory[i + 2].content.includes('?'),
          },
          recordedAt: new Date(),
        });
      }
    }

    // 2. Contribute breakthrough questions
    if (sessionData.breakthoughQuestions) {
      for (const q of sessionData.breakthoughQuestions) {
        communityInsights.recordBreakthroughQuestion(
          q.question,
          personaId,
          topicsDiscussed[0] || 'general',
          'conversation',
          q.engagementLift
        );
      }
    }

    // 3. Contribute key moments as signals for what resonates
    for (const moment of sessionKeyMoments) {
      if (moment.type === 'breakthrough') {
        // Breakthroughs are valuable learnings
        log.debug(
          { personaId, momentType: moment.type },
          'Breakthrough moment contributed to community learning'
        );
      }
    }

    // 4. Contribute story effectiveness
    for (const story of sessionStoriesTold) {
      // Find user reaction after story was told
      const storyIndex = conversationHistory.findIndex(
        (m) => m.role === 'assistant' && m.content.includes(story.theme)
      );

      if (storyIndex >= 0 && storyIndex + 1 < conversationHistory.length) {
        const userResponse = conversationHistory[storyIndex + 1].content;
        const reaction = detectStoryReaction(userResponse);

        communityInsights.recordStoryUsage(
          story.storyId,
          personaId,
          {
            topic: story.theme,
            relationshipStage: 'acquaintance',
            userEmotion: 'neutral',
          },
          reaction,
          sessionData.engagementScores[Math.floor(storyIndex / 2)] || avgEngagement
        );
      }
    }

    log.info(
      {
        personaId,
        turns: conversationHistory.length,
        stories: sessionStoriesTold.length,
        keyMoments: sessionKeyMoments.length,
      },
      'Session contributed to community learning'
    );
  } catch (error) {
    log.warn({ error }, 'Failed to contribute to community learning');
  }
}

// ============================================================================
// COMMUNITY RECOMMENDATIONS
// ============================================================================

/**
 * Get community-informed context for better responses
 * Call this to get suggestions based on what works across users
 */
export function getCommunityContext(
  personaId: string,
  context: {
    userEmotion: string;
    topic: string;
    relationshipStage: string;
  }
): CommunityContextResult {
  const result: CommunityContextResult = {};

  try {
    const communityInsights = getCommunityInsights();
    const evolution = getAgentEvolution();

    // Get best strategy
    const bestStrategy = communityInsights.getBestStrategy({
      ...context,
      personaId,
    });

    if (bestStrategy && bestStrategy.confidence > 0.5) {
      result.suggestedStrategy = bestStrategy.strategy;
    }

    // Get effective questions
    const questions = communityInsights.getEffectiveQuestions(personaId, context.topic, 2);
    if (questions.length > 0) {
      result.effectiveQuestions = questions.map((q) => q.question);
    }

    // Get story recommendations
    const stories = evolution.getRecommendedStories(personaId, context, 2);
    if (stories.length > 0) {
      result.recommendedStories = stories.map((s) => s.storyId);
    }

    // Get active adjustments
    const adjustments = evolution.getActiveAdjustments(personaId, context);
    if (adjustments.length > 0) {
      result.adjustments = adjustments.map((a) => a.adjustment.content);
    }
  } catch (error) {
    log.debug({ error }, 'Could not get community context');
  }

  return result;
}
