/**
 * Trigger Effectiveness Calculator
 *
 * Phase 4: Effectiveness Learning
 *
 * Calculates and manages trigger effectiveness scores that personalize
 * which triggers work best for each user. This is the "learning" component
 * that makes triggers genuinely adaptive.
 *
 * Key capabilities:
 * - Weighted effectiveness scoring (engagement rate, sentiment shift, session impact)
 * - Rolling window for relevance (last 30 days by default)
 * - Dynamic confidence adjustment (0.5x to 1.5x multiplier)
 * - Feedback loop protection (minimum floor, exploration)
 *
 * @module EffectivenessCalculator
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'effectiveness-calculator' });
export const DEFAULT_EFFECTIVENESS_CONFIG = {
    engagementWeight: 0.5,
    sentimentWeight: 0.3,
    sessionImpactWeight: 0.2,
    rollingWindowDays: 30,
    minObservations: 3,
    minMultiplier: 0.5,
    maxMultiplier: 1.5,
    explorationRate: 0.08, // 8% of suppressed triggers get explored
    suppressionThreshold: 0.35,
    boostThreshold: 0.65,
};
// ============================================================================
// IN-MEMORY OUTCOME STORAGE (Session-scoped)
// ============================================================================
// Session-scoped outcome events (cleared at session end)
const sessionOutcomes = new Map();
/**
 * Record a trigger outcome event during a session
 */
export function recordOutcomeEvent(sessionId, event) {
    const events = sessionOutcomes.get(sessionId) ?? [];
    events.push(event);
    sessionOutcomes.set(sessionId, events);
    log.debug({
        sessionId,
        triggerName: event.triggerName,
        response: event.response,
        engagementSignals: event.engagementSignals.length,
        deflectionSignals: event.deflectionSignals.length,
        sentimentShift: event.sentimentAfter !== undefined && event.sentimentBefore !== undefined
            ? (event.sentimentAfter - event.sentimentBefore).toFixed(2)
            : 'unknown',
    }, 'Recorded trigger outcome event');
}
/**
 * Get outcome events for a session
 */
export function getSessionOutcomes(sessionId) {
    return sessionOutcomes.get(sessionId) ?? [];
}
/**
 * Clear session outcomes (call at session end after persisting)
 */
export function clearSessionOutcomes(sessionId) {
    sessionOutcomes.delete(sessionId);
}
// ============================================================================
// SIGNAL DETECTION
// ============================================================================
/**
 * Detect engagement signals from user response
 */
export function detectEngagementSignals(userResponse, averageResponseLength, previousTopics, currentTopic) {
    const signals = [];
    const responseLower = userResponse.toLowerCase();
    // Longer response
    if (userResponse.length > averageResponseLength * 1.5) {
        signals.push('longer_response');
    }
    // Deeper topic (topic wasn't in previous topics)
    if (currentTopic && !previousTopics.includes(currentTopic)) {
        // Check if response goes deeper (has emotional words, "because", "I feel", etc.)
        const deeperIndicators = [
            'because',
            'i feel',
            'i think',
            'actually',
            'to be honest',
            'the truth is',
            "i've been",
            'i realized',
            'it made me',
        ];
        if (deeperIndicators.some((ind) => responseLower.includes(ind))) {
            signals.push('deeper_topic');
        }
    }
    // Emotional expression
    const emotionalIndicators = [
        'i feel',
        'makes me',
        "i'm feeling",
        'i was feeling',
        "i'm so",
        "i've been so",
        'it hurts',
        'i love',
        'i hate',
        "i'm scared",
        "i'm worried",
        "i'm excited",
        "i'm happy",
    ];
    if (emotionalIndicators.some((ind) => responseLower.includes(ind))) {
        signals.push('emotional_expression');
    }
    // Question asked
    if (userResponse.includes('?')) {
        signals.push('question_asked');
    }
    // Gratitude expressed
    const gratitudeIndicators = [
        'thank you',
        'thanks',
        'appreciate',
        'grateful',
        'that helps',
        'that means a lot',
        'i needed that',
    ];
    if (gratitudeIndicators.some((ind) => responseLower.includes(ind))) {
        signals.push('gratitude_expressed');
    }
    // Vulnerability shared
    const vulnerabilityIndicators = [
        "i haven't told",
        'nobody knows',
        "i've never",
        'secret',
        'ashamed',
        'embarrassed',
        'scared to admit',
        'hard to say',
    ];
    if (vulnerabilityIndicators.some((ind) => responseLower.includes(ind))) {
        signals.push('vulnerability_shared');
    }
    // Continuation requested
    const continuationIndicators = [
        'tell me more',
        'go on',
        'and then',
        'what else',
        'keep going',
        'continue',
        "i'd like to",
    ];
    if (continuationIndicators.some((ind) => responseLower.includes(ind))) {
        signals.push('continuation_requested');
    }
    return signals;
}
/**
 * Detect deflection signals from user response
 */
export function detectDeflectionSignals(userResponse, averageResponseLength, previousTopic, currentTopic, sessionEndedWithin // minutes until session ended, or null if ongoing
) {
    const signals = [];
    const responseLower = userResponse.toLowerCase();
    // Topic change (abrupt shift)
    if (previousTopic && currentTopic && previousTopic !== currentTopic) {
        const transitionIndicators = [
            'anyway',
            'moving on',
            'so anyway',
            'but anyway',
            "let's talk about",
        ];
        if (transitionIndicators.some((ind) => responseLower.includes(ind))) {
            signals.push('topic_change');
        }
    }
    // Short response
    if (userResponse.length < averageResponseLength * 0.3 && userResponse.length < 30) {
        signals.push('short_response');
    }
    // Minimization
    const minimizationIndicators = [
        "it's fine",
        "i'm fine",
        'no big deal',
        "doesn't matter",
        'whatever',
        'not a big deal',
        'it is what it is',
        "i'm okay",
    ];
    if (minimizationIndicators.some((ind) => responseLower.includes(ind))) {
        signals.push('minimization');
    }
    // Deflection phrase
    const deflectionPhrases = [
        'anyway',
        'moving on',
        "let's change",
        'never mind',
        'forget it',
        "don't worry about it",
        "it doesn't matter",
    ];
    if (deflectionPhrases.some((phrase) => responseLower.includes(phrase))) {
        signals.push('deflection_phrase');
    }
    // Dismissive tone (multiple indicators)
    const dismissiveIndicators = ['yeah', 'sure', 'okay', 'right', 'uh huh'];
    const wordCount = userResponse.split(/\s+/).length;
    if (wordCount <= 3 &&
        dismissiveIndicators.some((ind) => responseLower === ind || responseLower.startsWith(ind + ' '))) {
        signals.push('dismissive_tone');
    }
    // Session ended shortly after
    if (sessionEndedWithin !== null && sessionEndedWithin <= 2) {
        signals.push('session_ended');
    }
    return signals;
}
// ============================================================================
// EFFECTIVENESS CALCULATION
// ============================================================================
/**
 * Calculate effectiveness score from outcome events
 */
export function calculateEffectivenessFromEvents(triggerName, events, config = DEFAULT_EFFECTIVENESS_CONFIG) {
    // Filter to relevant events in rolling window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.rollingWindowDays);
    const relevantEvents = events.filter((e) => e.triggerName === triggerName && e.timestamp >= cutoffDate);
    // Default result for insufficient data
    if (relevantEvents.length < config.minObservations) {
        return {
            triggerName,
            rawScore: 0.5, // Neutral
            confidence: 0,
            multiplier: 1.0, // Neutral multiplier
            shouldExplore: false,
            bestContexts: [],
            worstContexts: [],
            components: {
                engagementRate: 0.5,
                avgSentimentShift: 0,
                avgSessionImpact: 0,
            },
            observationsInWindow: relevantEvents.length,
        };
    }
    // Calculate engagement rate
    const engagedCount = relevantEvents.filter((e) => e.response === 'engaged' || e.response === 'appreciated').length;
    const deflectedCount = relevantEvents.filter((e) => e.response === 'deflected').length;
    const engagementRate = engagedCount / relevantEvents.length;
    // Calculate average sentiment shift
    const eventsWithSentiment = relevantEvents.filter((e) => e.sentimentBefore !== undefined && e.sentimentAfter !== undefined);
    const avgSentimentShift = eventsWithSentiment.length > 0
        ? eventsWithSentiment.reduce((sum, e) => sum + (e.sentimentAfter - e.sentimentBefore), 0) /
            eventsWithSentiment.length
        : 0;
    // Normalize to 0-1 range (sentiment shift can be -1 to +1)
    const normalizedSentimentScore = (avgSentimentShift + 1) / 2;
    // Calculate session impact (how much longer sessions lasted after trigger)
    const eventsWithSession = relevantEvents.filter((e) => e.sessionDurationBefore !== undefined && e.sessionDurationAfter !== undefined);
    const avgSessionImpact = eventsWithSession.length > 0
        ? eventsWithSession.reduce((sum, e) => sum + (e.sessionDurationAfter - e.sessionDurationBefore), 0) / eventsWithSession.length
        : 0;
    // Normalize: assume +10 minutes is very positive, -5 is very negative
    const normalizedSessionScore = Math.max(0, Math.min(1, (avgSessionImpact + 5) / 15));
    // Weighted score
    const rawScore = config.engagementWeight * engagementRate +
        config.sentimentWeight * normalizedSentimentScore +
        config.sessionImpactWeight * normalizedSessionScore;
    // Confidence based on observation count
    const confidence = Math.min(relevantEvents.length / 20, 1); // Max out at 20 observations
    // Calculate multiplier
    let multiplier = 1.0;
    if (rawScore >= config.boostThreshold) {
        // Boost effective triggers
        multiplier =
            1.0 +
                ((rawScore - config.boostThreshold) / (1 - config.boostThreshold)) *
                    (config.maxMultiplier - 1.0);
    }
    else if (rawScore <= config.suppressionThreshold) {
        // Suppress ineffective triggers
        multiplier =
            config.minMultiplier +
                (rawScore / config.suppressionThreshold) * (1.0 - config.minMultiplier);
    }
    // Apply confidence: less confident = closer to 1.0
    multiplier = 1.0 + (multiplier - 1.0) * confidence;
    // Determine if should explore (feedback loop protection)
    const shouldExplore = rawScore < config.suppressionThreshold && Math.random() < config.explorationRate;
    // Find best and worst contexts
    const contextCounts = new Map();
    for (const event of relevantEvents) {
        for (const tag of event.contextTags) {
            const counts = contextCounts.get(tag) ?? { engaged: 0, deflected: 0 };
            if (event.response === 'engaged' || event.response === 'appreciated') {
                counts.engaged++;
            }
            else if (event.response === 'deflected') {
                counts.deflected++;
            }
            contextCounts.set(tag, counts);
        }
    }
    const contextRates = Array.from(contextCounts.entries())
        .map(([context, counts]) => ({
        context,
        rate: counts.engaged / (counts.engaged + counts.deflected || 1),
        total: counts.engaged + counts.deflected,
    }))
        .filter((c) => c.total >= 2) // Need at least 2 observations
        .sort((a, b) => b.rate - a.rate);
    const bestContexts = contextRates
        .slice(0, 3)
        .filter((c) => c.rate >= 0.6)
        .map((c) => c.context);
    const worstContexts = contextRates
        .slice(-3)
        .filter((c) => c.rate <= 0.4)
        .map((c) => c.context);
    log.debug({
        triggerName,
        rawScore: rawScore.toFixed(3),
        confidence: confidence.toFixed(2),
        multiplier: multiplier.toFixed(2),
        engagementRate: engagementRate.toFixed(2),
        avgSentimentShift: avgSentimentShift.toFixed(2),
        observations: relevantEvents.length,
    }, 'Calculated trigger effectiveness');
    return {
        triggerName,
        rawScore: Math.round(rawScore * 1000) / 1000,
        confidence: Math.round(confidence * 100) / 100,
        multiplier: Math.round(multiplier * 100) / 100,
        shouldExplore,
        bestContexts,
        worstContexts,
        components: {
            engagementRate: Math.round(engagementRate * 100) / 100,
            avgSentimentShift: Math.round(avgSentimentShift * 100) / 100,
            avgSessionImpact: Math.round(avgSessionImpact * 10) / 10,
        },
        observationsInWindow: relevantEvents.length,
    };
}
/**
 * Calculate effectiveness from existing TriggerEffectiveness records
 * (For backward compatibility with Phase 2 data)
 */
export function calculateEffectivenessFromRecord(record, config = DEFAULT_EFFECTIVENESS_CONFIG) {
    const total = record.timesFired;
    if (total < config.minObservations) {
        return {
            triggerName: record.triggerName,
            rawScore: 0.5,
            confidence: 0,
            multiplier: 1.0,
            shouldExplore: false,
            bestContexts: record.effectiveContexts,
            worstContexts: record.ineffectiveContexts,
            components: {
                engagementRate: 0.5,
                avgSentimentShift: 0,
                avgSessionImpact: 0,
            },
            observationsInWindow: total,
        };
    }
    // Use existing effectiveness score as base
    const rawScore = record.effectivenessScore;
    const confidence = Math.min(total / 20, 1);
    // Calculate multiplier
    let multiplier = 1.0;
    if (rawScore >= config.boostThreshold) {
        multiplier =
            1.0 +
                ((rawScore - config.boostThreshold) / (1 - config.boostThreshold)) *
                    (config.maxMultiplier - 1.0);
    }
    else if (rawScore <= config.suppressionThreshold) {
        multiplier =
            config.minMultiplier +
                (rawScore / config.suppressionThreshold) * (1.0 - config.minMultiplier);
    }
    multiplier = 1.0 + (multiplier - 1.0) * confidence;
    const shouldExplore = rawScore < config.suppressionThreshold && Math.random() < config.explorationRate;
    return {
        triggerName: record.triggerName,
        rawScore,
        confidence,
        multiplier: Math.round(multiplier * 100) / 100,
        shouldExplore,
        bestContexts: record.effectiveContexts,
        worstContexts: record.ineffectiveContexts,
        components: {
            engagementRate: record.positiveEngagements / total,
            avgSentimentShift: 0, // Not available in old records
            avgSessionImpact: 0, // Not available in old records
        },
        observationsInWindow: total,
    };
}
// ============================================================================
// USER-LEVEL ANALYSIS
// ============================================================================
/**
 * Analyze effectiveness of all triggers for a user
 */
export function analyzeUserEffectiveness(profile, config = DEFAULT_EFFECTIVENESS_CONFIG) {
    const triggerResults = [];
    // Calculate effectiveness for each trigger in user's history
    for (const record of profile.triggerEffectiveness) {
        const result = calculateEffectivenessFromRecord(record, config);
        triggerResults.push(result);
    }
    // Categorize triggers
    const triggersToBoost = triggerResults
        .filter((r) => r.rawScore >= config.boostThreshold && r.confidence >= 0.5)
        .map((r) => r.triggerName);
    const triggersToSuppress = triggerResults
        .filter((r) => r.rawScore <= config.suppressionThreshold && r.confidence >= 0.5 && !r.shouldExplore)
        .map((r) => r.triggerName);
    const triggersToExplore = triggerResults.filter((r) => r.shouldExplore).map((r) => r.triggerName);
    // Overall confidence
    const overallConfidence = triggerResults.length > 0
        ? triggerResults.reduce((sum, r) => sum + r.confidence, 0) / triggerResults.length
        : 0;
    log.info({
        userId: profile.userId,
        totalTriggers: triggerResults.length,
        toBoost: triggersToBoost.length,
        toSuppress: triggersToSuppress.length,
        toExplore: triggersToExplore.length,
        overallConfidence: overallConfidence.toFixed(2),
    }, 'Analyzed user trigger effectiveness');
    return {
        userId: profile.userId,
        analyzedAt: new Date(),
        triggerResults,
        triggersToBoost,
        triggersToSuppress,
        triggersToExplore,
        overallConfidence: Math.round(overallConfidence * 100) / 100,
    };
}
// ============================================================================
// TRIGGER MATCHING INTEGRATION
// ============================================================================
/**
 * Get effectiveness multiplier for a trigger
 * Used during trigger matching to adjust confidence
 */
export function getEffectivenessMultiplier(triggerName, profile, config = DEFAULT_EFFECTIVENESS_CONFIG) {
    const record = profile.triggerEffectiveness.find((r) => r.triggerName === triggerName);
    if (!record) {
        // No data - neutral multiplier
        return { multiplier: 1.0, shouldExplore: false, confidence: 0 };
    }
    const result = calculateEffectivenessFromRecord(record, config);
    return {
        multiplier: result.multiplier,
        shouldExplore: result.shouldExplore,
        confidence: result.confidence,
    };
}
/**
 * Apply effectiveness learning to a trigger match score
 */
export function applyEffectivenessToScore(originalScore, triggerName, profile, config = DEFAULT_EFFECTIVENESS_CONFIG) {
    const { multiplier, shouldExplore, confidence } = getEffectivenessMultiplier(triggerName, profile, config);
    let adjustedScore = originalScore * multiplier;
    // Exploration: occasionally allow suppressed triggers through
    let wasExplored = false;
    if (shouldExplore && adjustedScore < originalScore) {
        adjustedScore = originalScore * 0.8; // Reduce penalty for exploration
        wasExplored = true;
    }
    // Cap score to valid range
    adjustedScore = Math.max(0, Math.min(1, adjustedScore));
    log.debug({
        triggerName,
        originalScore: originalScore.toFixed(3),
        adjustedScore: adjustedScore.toFixed(3),
        multiplier: multiplier.toFixed(2),
        wasExplored,
        confidence: confidence.toFixed(2),
    }, 'Applied effectiveness to trigger score');
    return {
        adjustedScore,
        wasExplored,
        multiplierApplied: multiplier,
    };
}
// In-memory analytics (reset on restart)
let effectivenessAnalytics = {
    totalUsersAnalyzed: 0,
    totalTriggersTracked: 0,
    avgEffectivenessScore: 0,
    triggersAboveBoostThreshold: 0,
    triggersBelowSuppressionThreshold: 0,
    explorationEventsTriggered: 0,
    topPerformingTriggers: [],
    worstPerformingTriggers: [],
};
// Aggregate trigger performance across users
const globalTriggerStats = new Map();
/**
 * Record analytics from a user analysis
 */
export function recordEffectivenessAnalytics(analysis) {
    effectivenessAnalytics.totalUsersAnalyzed++;
    for (const result of analysis.triggerResults) {
        effectivenessAnalytics.totalTriggersTracked++;
        if (result.rawScore >= DEFAULT_EFFECTIVENESS_CONFIG.boostThreshold) {
            effectivenessAnalytics.triggersAboveBoostThreshold++;
        }
        if (result.rawScore <= DEFAULT_EFFECTIVENESS_CONFIG.suppressionThreshold) {
            effectivenessAnalytics.triggersBelowSuppressionThreshold++;
        }
        if (result.shouldExplore) {
            effectivenessAnalytics.explorationEventsTriggered++;
        }
        // Track global stats
        const stats = globalTriggerStats.get(result.triggerName) ?? {
            totalScore: 0,
            count: 0,
            observations: 0,
        };
        stats.totalScore += result.rawScore;
        stats.count++;
        stats.observations += result.observationsInWindow;
        globalTriggerStats.set(result.triggerName, stats);
    }
    // Recalculate averages and top/worst performers
    const allStats = Array.from(globalTriggerStats.entries())
        .map(([name, stats]) => ({
        name,
        score: stats.totalScore / stats.count,
        observations: stats.observations,
    }))
        .filter((s) => s.observations >= 5); // Minimum observations for global ranking
    allStats.sort((a, b) => b.score - a.score);
    effectivenessAnalytics.topPerformingTriggers = allStats.slice(0, 10);
    effectivenessAnalytics.worstPerformingTriggers = allStats.slice(-10).reverse();
    if (effectivenessAnalytics.totalTriggersTracked > 0) {
        const totalScore = Array.from(globalTriggerStats.values()).reduce((sum, s) => sum + s.totalScore / s.count, 0);
        effectivenessAnalytics.avgEffectivenessScore = totalScore / globalTriggerStats.size;
    }
}
/**
 * Get effectiveness analytics
 */
export function getEffectivenessAnalytics() {
    return { ...effectivenessAnalytics };
}
/**
 * Reset effectiveness analytics (for testing)
 */
export function resetEffectivenessAnalytics() {
    effectivenessAnalytics = {
        totalUsersAnalyzed: 0,
        totalTriggersTracked: 0,
        avgEffectivenessScore: 0,
        triggersAboveBoostThreshold: 0,
        triggersBelowSuppressionThreshold: 0,
        explorationEventsTriggered: 0,
        topPerformingTriggers: [],
        worstPerformingTriggers: [],
    };
    globalTriggerStats.clear();
}
//# sourceMappingURL=effectiveness-calculator.js.map