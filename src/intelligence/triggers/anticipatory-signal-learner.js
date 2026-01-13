/**
 * Anticipatory Signal Learner
 *
 * Phase 5: Anticipatory Triggers
 *
 * Learns opening phrases and patterns that predict what the user is about
 * to say. This enables "Better than Human" anticipation - responding to
 * emotional needs BEFORE they're fully expressed.
 *
 * Key insight: "So... I was thinking..." + slight tremor in voice =
 * high probability of vulnerable disclosure. Respond with space-creating
 * support BEFORE they finish.
 *
 * @module AnticipatorySignalLearner
 */
import { createLogger } from '../../utils/safe-logger.js';
import { DEFAULT_ANTICIPATORY_INTELLIGENCE } from './user-trigger-profile.types.js';
const log = createLogger({ module: 'anticipatory-signal-learner' });
export const DEFAULT_SIGNAL_LEARNER_CONFIG = {
    minObservations: 3,
    minProbability: 0.6,
    maxSignalsPerUser: 50,
    maxExamplesPerSignal: 5,
    eventRetentionDays: 30,
    voiceProsodyWeight: 0.4,
    textSignalWeight: 0.6,
};
// ============================================================================
// COMMON ANTICIPATORY PHRASES
// ============================================================================
/**
 * Common opening phrases that often precede specific outcomes.
 * These serve as seed patterns for new users.
 */
export const COMMON_ANTICIPATORY_PHRASES = [
    {
        phrases: [
            'so... i was thinking',
            "i've been meaning to tell you",
            'there is something i',
            "i don't know how to say this",
            'can i be honest',
            "i've never told anyone",
            "promise you won't",
        ],
        anticipatedOutcome: 'vulnerability',
        baselineProbability: 0.75,
    },
    {
        phrases: [
            "i'm worried about",
            "i can't stop thinking about",
            'something is wrong',
            "i'm scared that",
            "i don't know what to do",
            'everything feels',
            "i'm not okay",
        ],
        anticipatedOutcome: 'distress',
        baselineProbability: 0.8,
    },
    {
        phrases: [
            'guess what',
            'you will never believe',
            'i have amazing news',
            'i did it',
            'it finally happened',
            'i got the',
            'we got',
        ],
        anticipatedOutcome: 'celebration',
        baselineProbability: 0.85,
    },
    {
        phrases: [
            "i've been trying to figure out",
            "i'm still processing",
            'i keep coming back to',
            'part of me thinks',
            "i'm torn between",
            'on one hand',
        ],
        anticipatedOutcome: 'processing',
        baselineProbability: 0.7,
    },
    {
        phrases: [
            "it's not a big deal",
            "i'm fine, just",
            'anyway, moving on',
            "let's talk about something else",
            'never mind',
            "it doesn't matter",
        ],
        anticipatedOutcome: 'avoidance',
        baselineProbability: 0.75,
    },
    {
        phrases: [
            'could you help me',
            'i need some advice',
            "i was wondering if you'd",
            'do you think you could',
            'i have a favor',
        ],
        anticipatedOutcome: 'request',
        baselineProbability: 0.9,
    },
];
/**
 * Detect anticipatory signals in partial input
 */
export function detectAnticipatorySignals(partialInput, intelligence, voiceProsody, sessionContext, config = DEFAULT_SIGNAL_LEARNER_CONFIG) {
    const inputLower = partialInput.toLowerCase().trim();
    // Check safeguards first
    const safeguardCheck = checkSafeguards(intelligence.safeguards, partialInput, sessionContext);
    if (!safeguardCheck.allowed) {
        return {
            detected: false,
            signals: [],
            anticipatedOutcome: null,
            overallConfidence: 0,
            safeguardsAllowed: false,
            safeguardBlockReason: safeguardCheck.reason,
        };
    }
    const matchedSignals = [];
    // Check user's learned signals
    for (const signal of intelligence.signals) {
        if (signal.observations < config.minObservations)
            continue;
        if (signal.probability < config.minProbability)
            continue;
        const match = matchSignalPhrase(inputLower, signal);
        if (match) {
            // Calculate voice confidence from associated cues
            let voiceConfidence = 0;
            if (voiceProsody && signal.associatedVoiceCues.length > 0) {
                voiceConfidence = calculateVoiceConfidence(voiceProsody.cues, signal.associatedVoiceCues);
            }
            const textConfidence = signal.probability;
            const combinedConfidence = config.textSignalWeight * textConfidence + config.voiceProsodyWeight * voiceConfidence;
            matchedSignals.push({
                signal,
                matchedPhrase: match,
                textConfidence,
                voiceConfidence,
                combinedConfidence,
            });
        }
    }
    // Also check common phrases for new users or as fallback
    if (matchedSignals.length === 0) {
        for (const common of COMMON_ANTICIPATORY_PHRASES) {
            for (const phrase of common.phrases) {
                if (inputLower.includes(phrase)) {
                    // Create a temporary signal for common phrases
                    const tempSignal = {
                        id: `common_${phrase.replace(/\s+/g, '_')}`,
                        phrase,
                        isRegex: false,
                        anticipatedOutcome: common.anticipatedOutcome,
                        triggersCategories: [],
                        probability: common.baselineProbability,
                        observations: 100, // High confidence in common phrases
                        correctPredictions: 80,
                        exampleContexts: [],
                        associatedVoiceCues: [],
                        firstObserved: new Date(),
                        lastObserved: new Date(),
                        userConfirmed: false,
                    };
                    let voiceConfidence = 0;
                    if (voiceProsody) {
                        voiceConfidence = voiceProsody.overallScore;
                    }
                    const combinedConfidence = config.textSignalWeight * common.baselineProbability +
                        config.voiceProsodyWeight * voiceConfidence;
                    matchedSignals.push({
                        signal: tempSignal,
                        matchedPhrase: phrase,
                        textConfidence: common.baselineProbability,
                        voiceConfidence,
                        combinedConfidence,
                    });
                    break; // Only match first phrase from this category
                }
            }
        }
    }
    // Sort by combined confidence
    matchedSignals.sort((a, b) => b.combinedConfidence - a.combinedConfidence);
    // Determine anticipated outcome from top signals
    let anticipatedOutcome = null;
    let overallConfidence = 0;
    if (matchedSignals.length > 0) {
        // Use the top signal's outcome
        anticipatedOutcome = matchedSignals[0].signal.anticipatedOutcome;
        // Boost confidence if multiple signals agree
        const agreeingSignals = matchedSignals.filter((s) => s.signal.anticipatedOutcome === anticipatedOutcome);
        overallConfidence = Math.min(matchedSignals[0].combinedConfidence * (1 + 0.1 * (agreeingSignals.length - 1)), 1.0);
    }
    log.debug({
        inputLength: partialInput.length,
        signalsDetected: matchedSignals.length,
        anticipatedOutcome,
        overallConfidence: overallConfidence.toFixed(2),
        topSignal: matchedSignals[0]?.matchedPhrase,
    }, 'Anticipatory signal detection');
    return {
        detected: matchedSignals.length > 0,
        signals: matchedSignals,
        anticipatedOutcome,
        overallConfidence,
        safeguardsAllowed: true,
    };
}
/**
 * Match a signal phrase against input
 */
function matchSignalPhrase(input, signal) {
    if (signal.isRegex) {
        try {
            const regex = new RegExp(signal.phrase, 'i');
            const match = input.match(regex);
            return match ? match[0] : null;
        }
        catch {
            return null;
        }
    }
    else {
        return input.includes(signal.phrase.toLowerCase()) ? signal.phrase : null;
    }
}
/**
 * Calculate voice confidence from prosody cues
 */
function calculateVoiceConfidence(detectedCues, expectedCues) {
    if (expectedCues.length === 0)
        return 0;
    let matchScore = 0;
    let totalWeight = 0;
    for (const expected of expectedCues) {
        const matching = detectedCues.find((d) => d.type === expected.type &&
            (expected.direction === undefined || d.direction === expected.direction));
        if (matching) {
            // Weight by intensity and reliability
            const weight = expected.reliability;
            matchScore += matching.intensity * weight;
            totalWeight += weight;
        }
        else {
            totalWeight += expected.reliability;
        }
    }
    return totalWeight > 0 ? matchScore / totalWeight : 0;
}
/**
 * Check if safeguards allow anticipation
 */
function checkSafeguards(safeguards, input, sessionContext) {
    if (!safeguards.enabled) {
        return { allowed: false, reason: 'Anticipation disabled by user' };
    }
    if (input.length < safeguards.minInputLength) {
        return { allowed: false, reason: 'Input too short' };
    }
    if (sessionContext) {
        if (sessionContext.anticipationsThisSession >= safeguards.maxPerSession) {
            return { allowed: false, reason: 'Max anticipations per session reached' };
        }
        if (sessionContext.lastAnticipationTime) {
            const secondsSince = (Date.now() - sessionContext.lastAnticipationTime.getTime()) / 1000;
            if (secondsSince < safeguards.minSecondsBetween) {
                return { allowed: false, reason: 'Too soon since last anticipation' };
            }
        }
        if (sessionContext.currentTopic &&
            safeguards.disabledTopics.includes(sessionContext.currentTopic)) {
            return { allowed: false, reason: 'Topic has anticipation disabled' };
        }
        // Check disabled times
        for (const timeWindow of safeguards.disabledTimes) {
            if (sessionContext.currentHour >= timeWindow.startHour &&
                sessionContext.currentHour < timeWindow.endHour) {
                return {
                    allowed: false,
                    reason: timeWindow.reason || 'Anticipation disabled during this time',
                };
            }
        }
    }
    return { allowed: true };
}
/**
 * Learn from a completed utterance to improve signal detection
 */
export function learnFromUtterance(profile, input, config = DEFAULT_SIGNAL_LEARNER_CONFIG) {
    const intelligence = profile.anticipatoryIntelligence ?? { ...DEFAULT_ANTICIPATORY_INTELLIGENCE };
    // Extract potential opening phrases (first 5-15 words)
    const words = input.fullUtterance.trim().split(/\s+/);
    const potentialPhrases = [];
    // Create phrases of 3-7 words from the beginning
    for (let length = 3; length <= Math.min(7, words.length); length++) {
        potentialPhrases.push(words.slice(0, length).join(' ').toLowerCase());
    }
    // Check if any phrases match existing signals
    let foundMatch = false;
    for (const phrase of potentialPhrases) {
        const existingSignal = intelligence.signals.find((s) => s.phrase === phrase);
        if (existingSignal) {
            foundMatch = true;
            // Update existing signal
            existingSignal.observations++;
            existingSignal.lastObserved = new Date();
            if (existingSignal.anticipatedOutcome === input.actualOutcome) {
                existingSignal.correctPredictions++;
            }
            // Recalculate probability
            existingSignal.probability = existingSignal.correctPredictions / existingSignal.observations;
            // Add example context if we have room
            if (existingSignal.exampleContexts.length < config.maxExamplesPerSignal) {
                existingSignal.exampleContexts.push(input.fullUtterance.slice(0, 200));
            }
            // Update associated voice cues
            updateAssociatedVoiceCues(existingSignal, input.voiceCues);
            log.debug({
                phrase,
                observations: existingSignal.observations,
                probability: existingSignal.probability.toFixed(2),
            }, 'Updated existing anticipatory signal');
        }
    }
    // If no existing match and outcome is significant, consider adding new signal
    if (!foundMatch && input.actualOutcome !== 'unknown') {
        const bestPhrase = potentialPhrases.find((p) => p.length >= 10) ?? potentialPhrases[0];
        if (bestPhrase && intelligence.signals.length < config.maxSignalsPerUser) {
            // Check if this phrase is specific enough (not too common)
            if (!isPhraseTooGeneric(bestPhrase)) {
                const newSignal = {
                    id: `signal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    phrase: bestPhrase,
                    isRegex: false,
                    anticipatedOutcome: input.actualOutcome,
                    triggersCategories: input.activatedTriggers,
                    probability: 1.0, // Will be recalculated after more observations
                    observations: 1,
                    correctPredictions: 1,
                    exampleContexts: [input.fullUtterance.slice(0, 200)],
                    associatedVoiceCues: input.voiceCues.map((cue) => ({
                        ...cue,
                        typicalMeaning: input.actualOutcome,
                        reliability: 0.5, // Low initial reliability
                        observations: 1,
                    })),
                    firstObserved: new Date(),
                    lastObserved: new Date(),
                    userConfirmed: false,
                };
                intelligence.signals.push(newSignal);
                log.info({
                    phrase: bestPhrase,
                    outcome: input.actualOutcome,
                }, 'Learned new anticipatory signal');
            }
        }
    }
    // Update voice cue patterns
    for (const cue of input.voiceCues) {
        const existingCue = intelligence.voiceCues.find((c) => c.type === cue.type && c.direction === cue.direction);
        if (existingCue) {
            existingCue.observations++;
            // Update typical meaning based on frequency
            if (existingCue.typicalMeaning === input.actualOutcome) {
                existingCue.reliability = Math.min(existingCue.reliability + 0.05, 0.95);
            }
            else {
                existingCue.reliability = Math.max(existingCue.reliability - 0.02, 0.3);
            }
        }
        else {
            intelligence.voiceCues.push({
                ...cue,
                typicalMeaning: input.actualOutcome,
                reliability: 0.5,
                observations: 1,
            });
        }
    }
    intelligence.lastAnalyzedAt = new Date();
    return {
        ...profile,
        anticipatoryIntelligence: intelligence,
        updatedAt: new Date(),
    };
}
/**
 * Update associated voice cues for a signal
 */
function updateAssociatedVoiceCues(signal, newCues) {
    for (const cue of newCues) {
        const existing = signal.associatedVoiceCues.find((c) => c.type === cue.type && c.direction === cue.direction);
        if (existing) {
            existing.observations++;
            existing.intensity = (existing.intensity + cue.intensity) / 2; // Running average
            existing.reliability = Math.min(existing.reliability + 0.02, 0.9);
        }
        else if (signal.associatedVoiceCues.length < 5) {
            signal.associatedVoiceCues.push({
                ...cue,
                typicalMeaning: signal.anticipatedOutcome,
                reliability: 0.4,
                observations: 1,
            });
        }
    }
}
/**
 * Check if a phrase is too generic to be useful
 */
function isPhraseTooGeneric(phrase) {
    const genericPhrases = [
        'i was',
        'i am',
        'i have',
        'i think',
        'i want',
        'i need',
        'i like',
        'i know',
        'i see',
        'i got',
        'i had',
        'so i',
        'and i',
        'but i',
    ];
    const phraseLower = phrase.toLowerCase();
    return genericPhrases.some((g) => phraseLower === g || phraseLower.startsWith(g + ' '));
}
// ============================================================================
// ANTICIPATION EVENT RECORDING
// ============================================================================
/**
 * Record an anticipation event
 */
export function recordAnticipationEvent(profile, event, config = DEFAULT_SIGNAL_LEARNER_CONFIG) {
    const intelligence = profile.anticipatoryIntelligence ?? { ...DEFAULT_ANTICIPATORY_INTELLIGENCE };
    // Add event
    intelligence.recentEvents.push(event);
    // Prune old events
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.eventRetentionDays);
    intelligence.recentEvents = intelligence.recentEvents.filter((e) => e.timestamp >= cutoffDate);
    // Update signal based on outcome
    const signal = intelligence.signals.find((s) => s.id === event.signalId);
    if (signal) {
        if (event.predictionCorrect) {
            signal.correctPredictions++;
        }
        signal.probability = signal.correctPredictions / signal.observations;
    }
    // Recalculate overall accuracy
    const recentEvents = intelligence.recentEvents.filter((e) => e.userReaction !== 'unknown');
    if (recentEvents.length > 0) {
        const positiveReactions = recentEvents.filter((e) => e.userReaction === 'appreciated' || e.userReaction === 'continued' || e.predictionCorrect);
        intelligence.overallAccuracy = positiveReactions.length / recentEvents.length;
    }
    log.debug({
        signalId: event.signalId,
        reaction: event.userReaction,
        predictionCorrect: event.predictionCorrect,
        overallAccuracy: intelligence.overallAccuracy.toFixed(2),
    }, 'Recorded anticipation event');
    return {
        ...profile,
        anticipatoryIntelligence: intelligence,
        updatedAt: new Date(),
    };
}
/**
 * Get analytics for anticipatory intelligence
 */
export function getAnticipatoryAnalytics(intelligence, config = DEFAULT_SIGNAL_LEARNER_CONFIG) {
    const activeSignals = intelligence.signals.filter((s) => s.observations >= config.minObservations && s.probability >= config.minProbability);
    const outcomeDistribution = {
        vulnerability: 0,
        distress: 0,
        request: 0,
        celebration: 0,
        processing: 0,
        avoidance: 0,
        unknown: 0,
    };
    for (const signal of activeSignals) {
        outcomeDistribution[signal.anticipatedOutcome]++;
    }
    const reactionDistribution = {
        appreciated: 0,
        continued: 0,
        ignored: 0,
        corrected: 0,
        annoyed: 0,
        unknown: 0,
    };
    for (const event of intelligence.recentEvents) {
        reactionDistribution[event.userReaction]++;
    }
    const topSignals = [...activeSignals]
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10)
        .map((s) => ({
        phrase: s.phrase,
        outcome: s.anticipatedOutcome,
        probability: s.probability,
        observations: s.observations,
    }));
    return {
        totalSignalsLearned: intelligence.signals.length,
        activeSignals: activeSignals.length,
        totalAnticipationEvents: intelligence.recentEvents.length,
        overallAccuracy: intelligence.overallAccuracy,
        outcomeDistribution,
        topSignals,
        reactionDistribution,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { DEFAULT_ANTICIPATORY_INTELLIGENCE, } from './user-trigger-profile.types.js';
//# sourceMappingURL=anticipatory-signal-learner.js.map