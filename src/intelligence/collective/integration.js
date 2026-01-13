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
import { createLogger } from '../../utils/safe-logger.js';
import { getCommunityInsights, } from './community-insights.js';
import { getAgentEvolution } from './agent-evolution.js';
const log = createLogger({ module: 'CollectiveLearning' });
// ============================================================================
// SIGNAL COLLECTION
// ============================================================================
/**
 * Collector for conversation signals
 * Buffers signals and flushes periodically to avoid blocking
 */
class SignalCollector {
    responseSignals = [];
    storySignals = [];
    breakthroughSignals = [];
    flushIntervalId = null;
    isInitialized = false;
    /**
     * Initialize the collector
     */
    initialize() {
        if (this.isInitialized)
            return;
        // Flush signals every 30 seconds
        this.flushIntervalId = setInterval(() => {
            this.flush().catch((err) => {
                log.warn({ error: err }, 'Failed to flush signals');
            });
        }, 30000);
        this.isInitialized = true;
        log.info('Signal collector initialized');
    }
    /**
     * Stop the collector
     */
    shutdown() {
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
    recordResponse(context, response, reaction) {
        const signal = {
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
    recordStory(context, story) {
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
    recordBreakthrough(personaId, topic, breakthrough) {
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
    async flush() {
        const insights = getCommunityInsights();
        // Process response signals
        const responseCount = this.responseSignals.length;
        for (const signal of this.responseSignals) {
            try {
                insights.recordResponseSignal(signal);
            }
            catch (e) {
                log.warn({ error: e }, 'Failed to record response signal');
            }
        }
        this.responseSignals = [];
        // Process story signals
        const storyCount = this.storySignals.length;
        for (const signal of this.storySignals) {
            try {
                insights.recordStoryUsage(signal.storyId, signal.personaId, {
                    topic: signal.topic,
                    relationshipStage: signal.relationshipStage,
                    userEmotion: signal.emotion,
                }, signal.reaction, signal.engagementScore);
            }
            catch (e) {
                log.warn({ error: e }, 'Failed to record story signal');
            }
        }
        this.storySignals = [];
        // Process breakthrough signals
        const breakthroughCount = this.breakthroughSignals.length;
        for (const signal of this.breakthroughSignals) {
            try {
                insights.recordBreakthroughQuestion(signal.questionPattern, signal.personaId, signal.topic, signal.context, signal.engagementLift);
            }
            catch (e) {
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
    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6)
            return 'night';
        if (hour < 12)
            return 'morning';
        if (hour < 17)
            return 'afternoon';
        if (hour < 21)
            return 'evening';
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
export function analyzeResponseType(response) {
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
export function analyzeResponseLength(response) {
    const wordCount = response.split(/\s+/).length;
    if (wordCount < 30)
        return 'brief';
    if (wordCount < 80)
        return 'moderate';
    return 'lengthy';
}
/**
 * Analyze user message for engagement signals
 */
export function analyzeUserEngagement(message, previousEmotion, currentEmotion) {
    const wordCount = message.split(/\s+/).length;
    const hasQuestion = message.includes('?');
    const hasExclamation = message.includes('!');
    const hasThankYou = /\b(thank|thanks|appreciate)\b/i.test(message);
    const wantsMore = /\b(tell me more|go on|what else|and then|continue)\b/i.test(message);
    // Calculate engagement score
    let engagementScore = 0.5; // baseline
    // Longer responses indicate engagement
    if (wordCount > 20)
        engagementScore += 0.15;
    if (wordCount > 50)
        engagementScore += 0.15;
    // Questions indicate engagement
    if (hasQuestion)
        engagementScore += 0.1;
    // Thank you indicates positive engagement
    if (hasThankYou)
        engagementScore += 0.1;
    // Wanting more is strong engagement
    if (wantsMore)
        engagementScore += 0.2;
    // Determine emotional shift
    let emotionalShift = 'neutral';
    if (previousEmotion && currentEmotion) {
        const prevValence = previousEmotion.valence === 'positive' ? 1 : previousEmotion.valence === 'negative' ? -1 : 0;
        const currValence = currentEmotion.valence === 'positive' ? 1 : currentEmotion.valence === 'negative' ? -1 : 0;
        if (currValence > prevValence)
            emotionalShift = 'positive';
        else if (currValence < prevValence)
            emotionalShift = 'negative';
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
export function initializeCollectiveLearning() {
    signalCollector.initialize();
}
/**
 * Shutdown collective learning
 */
export function shutdownCollectiveLearning() {
    signalCollector.shutdown();
}
/**
 * Record a response signal for collective learning
 */
export function recordResponseForLearning(context, response, reaction, options) {
    const responseData = {
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
export function recordStoryForLearning(context, storyId, reaction, engagementScore) {
    signalCollector.recordStory(context, {
        storyId,
        reaction,
        engagementScore,
    });
}
/**
 * Record a breakthrough question
 */
export function recordBreakthroughForLearning(personaId, topic, questionPattern, context, engagementLift) {
    signalCollector.recordBreakthrough(personaId, topic, {
        questionPattern,
        context,
        engagementLift,
    });
}
/**
 * Flush all pending signals (call at end of session)
 */
export async function flushLearningSignals() {
    return signalCollector.flush();
}
/**
 * Get collective learning recommendations for current context
 */
export function getCollectiveRecommendations(params) {
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
        recommendedQuestions: questions.map((q) => q.question),
        personaAdjustments: adjustments.map((a) => a.adjustment.content),
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
//# sourceMappingURL=integration.js.map