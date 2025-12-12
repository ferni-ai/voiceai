/**
 * Collective Learning Integration
 *
 * Integrates the collective learning pipeline into the voice agent flow:
 *
 * 1. COLLECTION: Record signals during conversation (response effectiveness, story usage)
 * 2. AGGREGATION: Background job aggregates signals into patterns
 * 3. INJECTION: Context builders inject learnings into prompts
 * 4. EVOLUTION: Persona adjustments are applied based on patterns
 *
 * This closes the loop described in COLLECTIVE-LEARNING.md.
 *
 * @module intelligence/collective-learning-integration
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  getCommunityInsights,
  type ResponseStrategySignal,
  type StoryResonance,
} from './community-insights.js';
import {
  getAgentEvolution,
  type PersonaAdjustment,
} from './agent-evolution.js';
import type { EmotionResult } from './emotion-detector.js';
import type { IntentResult } from './intent-classifier.js';

const log = createLogger({ module: 'CollectiveLearning' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSignalContext {
  sessionId: string;
  userId: string;
  personaId: string;
  turnNumber: number;
  emotion: string;
  topic: string;
  relationshipStage: string;
}

export interface ResponseSignalData {
  /** What type of response was given */
  responseType: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation';

  /** Did the response include a personal share? */
  hadPersonalShare: boolean;

  /** Did the response include a persona quirk? */
  hadQuirk: boolean;

  /** Did the response reference the team? */
  hadTeamReference: boolean;

  /** Response length category */
  responseLength: 'brief' | 'moderate' | 'lengthy';
}

export interface UserReactionSignal {
  /** User engagement score (0-1) based on response length, questions asked, etc. */
  engagementScore: number;

  /** Did the user continue engaging after this response? */
  userContinued: boolean;

  /** Did the user's emotion shift positively? */
  emotionalShift: 'positive' | 'neutral' | 'negative';

  /** Did the conversation go deeper on the topic? */
  topicDepthened: boolean;

  /** Did the user ask a follow-up question? */
  askedFollowUp: boolean;
}

export interface StoryUsageSignal {
  storyId: string;
  reaction: 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent';
  engagementScore: number;
}

export interface BreakthroughSignal {
  questionPattern: string;
  context: string;
  engagementLift: number;
}

// ============================================================================
// SIGNAL COLLECTION
// ============================================================================

/**
 * Collector for conversation signals
 * Buffers signals and flushes periodically to avoid blocking
 */
class SignalCollector {
  private responseSignals: Array<ResponseStrategySignal & { sessionId: string }> = [];
  private storySignals: Array<StoryUsageSignal & ConversationSignalContext> = [];
  private breakthroughSignals: Array<BreakthroughSignal & { personaId: string; topic: string }> = [];

  private flushIntervalId: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  /**
   * Initialize the collector
   */
  initialize(): void {
    if (this.isInitialized) return;

    // Flush signals every 30 seconds
    this.flushIntervalId = setInterval(() => {
      this.flush().catch(err => {
        log.warn({ error: err }, 'Failed to flush signals');
      });
    }, 30000);

    this.isInitialized = true;
    log.info('Signal collector initialized');
  }

  /**
   * Stop the collector
   */
  shutdown(): void {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }

    // Final flush
    void this.flush();

    this.isInitialized = false;
    log.info('Signal collector shutdown');
  }

  /**
   * Record a response signal
   */
  recordResponse(
    context: ConversationSignalContext,
    response: ResponseSignalData,
    reaction: UserReactionSignal
  ): void {
    const signal: ResponseStrategySignal & { sessionId: string } = {
      sessionId: context.sessionId,
      context: {
        userEmotion: context.emotion,
        topic: context.topic,
        relationshipStage: context.relationshipStage,
        personaId: context.personaId,
        timeOfDay: this.getTimeOfDay(),
        turnInConversation: context.turnNumber,
      },
      strategy: {
        type: response.responseType,
        hadPersonalShare: response.hadPersonalShare,
        hadQuirk: response.hadQuirk,
        hadTeamReference: response.hadTeamReference,
        responseLength: response.responseLength,
      },
      outcome: {
        engagementScore: reaction.engagementScore,
        userContinued: reaction.userContinued,
        emotionalShift: reaction.emotionalShift,
        topicDepthened: reaction.topicDepthened,
        askFollowUp: reaction.askedFollowUp,
      },
      recordedAt: new Date(),
    };

    this.responseSignals.push(signal);

    log.debug({
      sessionId: context.sessionId,
      responseType: response.responseType,
      engagement: reaction.engagementScore,
    }, 'Response signal recorded');
  }

  /**
   * Record a story usage signal
   */
  recordStory(context: ConversationSignalContext, story: StoryUsageSignal): void {
    this.storySignals.push({
      ...story,
      ...context,
    });

    log.debug({
      sessionId: context.sessionId,
      storyId: story.storyId,
      reaction: story.reaction,
    }, 'Story signal recorded');
  }

  /**
   * Record a breakthrough question signal
   */
  recordBreakthrough(
    personaId: string,
    topic: string,
    breakthrough: BreakthroughSignal
  ): void {
    this.breakthroughSignals.push({
      ...breakthrough,
      personaId,
      topic,
    });

    log.debug({
      personaId,
      topic,
      question: breakthrough.questionPattern.slice(0, 50),
    }, 'Breakthrough signal recorded');
  }

  /**
   * Flush all buffered signals to community insights
   */
  async flush(): Promise<{
    responses: number;
    stories: number;
    breakthroughs: number;
  }> {
    const insights = getCommunityInsights();

    // Process response signals
    const responseCount = this.responseSignals.length;
    for (const signal of this.responseSignals) {
      try {
        insights.recordResponseSignal(signal);
      } catch (e) {
        log.warn({ error: e }, 'Failed to record response signal');
      }
    }
    this.responseSignals = [];

    // Process story signals
    const storyCount = this.storySignals.length;
    for (const signal of this.storySignals) {
      try {
        insights.recordStoryUsage(
          signal.storyId,
          signal.personaId,
          {
            topic: signal.topic,
            relationshipStage: signal.relationshipStage,
            userEmotion: signal.emotion,
          },
          signal.reaction,
          signal.engagementScore
        );
      } catch (e) {
        log.warn({ error: e }, 'Failed to record story signal');
      }
    }
    this.storySignals = [];

    // Process breakthrough signals
    const breakthroughCount = this.breakthroughSignals.length;
    for (const signal of this.breakthroughSignals) {
      try {
        insights.recordBreakthroughQuestion(
          signal.questionPattern,
          signal.personaId,
          signal.topic,
          signal.context,
          signal.engagementLift
        );
      } catch (e) {
        log.warn({ error: e }, 'Failed to record breakthrough signal');
      }
    }
    this.breakthroughSignals = [];

    if (responseCount + storyCount + breakthroughCount > 0) {
      log.info({
        responses: responseCount,
        stories: storyCount,
        breakthroughs: breakthroughCount,
      }, '📊 Collective learning signals flushed');
    }

    return {
      responses: responseCount,
      stories: storyCount,
      breakthroughs: breakthroughCount,
    };
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }
}

// Singleton collector
const signalCollector = new SignalCollector();

// ============================================================================
// SIGNAL ANALYSIS
// ============================================================================

/**
 * Analyze a response to classify its type
 */
export function analyzeResponseType(response: string): ResponseSignalData['responseType'] {
  const lower = response.toLowerCase();

  // Check for story indicators
  if (/\b(remember when|one time|story|back in|there was a time)\b/i.test(response)) {
    return 'story';
  }

  // Check for question indicators
  if (response.includes('?') && /\b(what|how|why|when|where|can you|would you)\b/i.test(lower)) {
    return 'question';
  }

  // Check for empathy indicators
  if (/\b(i understand|that (sounds|must be)|i hear you|that's (hard|tough|difficult))\b/i.test(lower)) {
    return 'empathy';
  }

  // Check for humor indicators
  if (/\b(haha|lol|funny|joke|kidding|😄|😂)\b/i.test(lower)) {
    return 'humor';
  }

  // Check for explanation indicators
  if (/\b(here's (how|why|what)|let me explain|the (reason|way))\b/i.test(lower)) {
    return 'explanation';
  }

  // Default to advice
  return 'advice';
}

/**
 * Analyze response length category
 */
export function analyzeResponseLength(response: string): ResponseSignalData['responseLength'] {
  const wordCount = response.split(/\s+/).length;

  if (wordCount < 30) return 'brief';
  if (wordCount < 80) return 'moderate';
  return 'lengthy';
}

/**
 * Analyze user message for engagement signals
 */
export function analyzeUserEngagement(
  message: string,
  previousEmotion: EmotionResult | null,
  currentEmotion: EmotionResult
): UserReactionSignal {
  const wordCount = message.split(/\s+/).length;
  const hasQuestion = message.includes('?');
  const hasExclamation = message.includes('!');
  const hasThankYou = /\b(thank|thanks|appreciate)\b/i.test(message);
  const wantsMore = /\b(tell me more|go on|what else|and then|continue)\b/i.test(message);

  // Calculate engagement score
  let engagementScore = 0.5; // baseline

  // Longer responses indicate engagement
  if (wordCount > 20) engagementScore += 0.15;
  if (wordCount > 50) engagementScore += 0.15;

  // Questions indicate engagement
  if (hasQuestion) engagementScore += 0.1;

  // Thank you indicates positive engagement
  if (hasThankYou) engagementScore += 0.1;

  // Wanting more is strong engagement
  if (wantsMore) engagementScore += 0.2;

  // Determine emotional shift
  let emotionalShift: UserReactionSignal['emotionalShift'] = 'neutral';
  if (previousEmotion && currentEmotion) {
    const prevValence = previousEmotion.valence === 'positive' ? 1 : previousEmotion.valence === 'negative' ? -1 : 0;
    const currValence = currentEmotion.valence === 'positive' ? 1 : currentEmotion.valence === 'negative' ? -1 : 0;

    if (currValence > prevValence) emotionalShift = 'positive';
    else if (currValence < prevValence) emotionalShift = 'negative';
  }

  return {
    engagementScore: Math.min(1, engagementScore),
    userContinued: wordCount > 5,
    emotionalShift,
    topicDepthened: wordCount > 30 || wantsMore,
    askedFollowUp: hasQuestion,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize collective learning for the session
 */
export function initializeCollectiveLearning(): void {
  signalCollector.initialize();
}

/**
 * Shutdown collective learning
 */
export function shutdownCollectiveLearning(): void {
  signalCollector.shutdown();
}

/**
 * Record a response signal for collective learning
 */
export function recordResponseForLearning(
  context: ConversationSignalContext,
  response: string,
  reaction: UserReactionSignal,
  options?: {
    hadPersonalShare?: boolean;
    hadQuirk?: boolean;
    hadTeamReference?: boolean;
  }
): void {
  const responseData: ResponseSignalData = {
    responseType: analyzeResponseType(response),
    hadPersonalShare: options?.hadPersonalShare ?? false,
    hadQuirk: options?.hadQuirk ?? false,
    hadTeamReference: options?.hadTeamReference ?? false,
    responseLength: analyzeResponseLength(response),
  };

  signalCollector.recordResponse(context, responseData, reaction);
}

/**
 * Record a story usage signal
 */
export function recordStoryForLearning(
  context: ConversationSignalContext,
  storyId: string,
  reaction: StoryUsageSignal['reaction'],
  engagementScore: number
): void {
  signalCollector.recordStory(context, {
    storyId,
    reaction,
    engagementScore,
  });
}

/**
 * Record a breakthrough question
 */
export function recordBreakthroughForLearning(
  personaId: string,
  topic: string,
  questionPattern: string,
  context: string,
  engagementLift: number
): void {
  signalCollector.recordBreakthrough(personaId, topic, {
    questionPattern,
    context,
    engagementLift,
  });
}

/**
 * Flush all pending signals (call at end of session)
 */
export async function flushLearningSignals(): Promise<{
  responses: number;
  stories: number;
  breakthroughs: number;
}> {
  return signalCollector.flush();
}

/**
 * Get collective learning recommendations for current context
 */
export function getCollectiveRecommendations(params: {
  personaId: string;
  emotion: string;
  topic: string;
  relationshipStage: string;
}): {
  bestStrategy?: string;
  strategyConfidence?: number;
  recommendedQuestions: string[];
  personaAdjustments: string[];
} {
  const insights = getCommunityInsights();
  const evolution = getAgentEvolution();

  // Get best strategy
  const strategy = insights.getBestStrategy({
    userEmotion: params.emotion,
    topic: params.topic,
    relationshipStage: params.relationshipStage,
    personaId: params.personaId,
  });

  // Get effective questions
  const questions = insights.getEffectiveQuestions(params.personaId, params.topic, 3);

  // Get active adjustments
  const adjustments = evolution.getActiveAdjustments(params.personaId, {
    userEmotion: params.emotion,
    topic: params.topic,
    relationshipStage: params.relationshipStage,
  });

  return {
    bestStrategy: strategy?.strategy,
    strategyConfidence: strategy?.confidence,
    recommendedQuestions: questions.map(q => q.question),
    personaAdjustments: adjustments.map(a => a.adjustment.content),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeCollectiveLearning,
  shutdownCollectiveLearning,
  recordResponseForLearning,
  recordStoryForLearning,
  recordBreakthroughForLearning,
  flushLearningSignals,
  getCollectiveRecommendations,
  analyzeResponseType,
  analyzeResponseLength,
  analyzeUserEngagement,
};

