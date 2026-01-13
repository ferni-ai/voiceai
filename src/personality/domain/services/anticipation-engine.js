/**
 * AnticipationEngine Domain Service
 *
 * SUPERHUMAN CORE: Predicts emotions BEFORE they're fully expressed.
 *
 * "They understand me before I finish"
 *
 * This is pure domain logic - no I/O, no infrastructure dependencies.
 *
 * @module personality/domain/services/anticipation-engine
 */
import { AnticipatedEmotion, } from '../model/value-objects/anticipated-emotion.js';
/**
 * Speech patterns that indicate upcoming emotions
 */
const SPEECH_PATTERN_SIGNALS = [
    // Reflective/sad openers
    {
        pattern: /^(i've been thinking|i was wondering|i keep thinking)/i,
        emotion: 'sadness',
        granular: 'melancholy',
        confidence: 0.65,
        reasoning: 'Reflective phrase suggests processing something difficult',
    },
    {
        pattern: /^(remember when|it reminds me of|thinking back)/i,
        emotion: 'sadness',
        granular: 'nostalgic',
        confidence: 0.6,
        reasoning: 'Nostalgic opener often leads to bittersweet emotions',
    },
    // Excitement openers
    {
        pattern: /^(guess what|oh my god|you won't believe)/i,
        emotion: 'joy',
        granular: 'ecstatic',
        confidence: 0.75,
        reasoning: 'Exclamatory opening indicates excitement',
    },
    {
        pattern: /^(so i just|i finally|it happened)/i,
        emotion: 'joy',
        granular: 'relieved',
        confidence: 0.6,
        reasoning: 'Achievement language suggests positive news',
    },
    // Vulnerability openers
    {
        pattern: /^(i need to tell you|this is hard|i've never told)/i,
        emotion: 'fear',
        granular: 'vulnerable',
        confidence: 0.8,
        reasoning: 'Vulnerability framing indicates upcoming disclosure',
    },
    {
        pattern: /^(can i tell you something|between us|this is personal)/i,
        emotion: 'trust',
        granular: 'calm', // Use 'calm' as default for trust without specific granular
        confidence: 0.7,
        reasoning: 'Trust-seeking language indicates vulnerability incoming',
    },
    // Anger openers
    {
        pattern: /^(i can't believe|are you kidding|seriously)/i,
        emotion: 'anger',
        granular: 'frustrated',
        confidence: 0.7,
        reasoning: 'Disbelief language often precedes frustration',
    },
    {
        pattern: /^(they always|they never|every time)/i,
        emotion: 'anger',
        granular: 'resentful',
        confidence: 0.65,
        reasoning: 'Absolute language indicates building resentment',
    },
    // Fear/anxiety openers
    {
        pattern: /^(i'm worried|what if|i'm scared)/i,
        emotion: 'fear',
        granular: 'anxious',
        confidence: 0.8,
        reasoning: 'Direct fear expression',
    },
    {
        pattern: /^(i don't know if|i'm not sure i can|maybe i shouldn't)/i,
        emotion: 'fear',
        granular: 'nervous',
        confidence: 0.6,
        reasoning: 'Uncertainty language suggests underlying anxiety',
    },
    // Processing openers
    {
        pattern: /^(it's just that|the thing is|i mean)/i,
        emotion: 'neutral',
        granular: 'calm', // Use 'calm' as default for neutral
        confidence: 0.4,
        reasoning: 'Processing language - needs more context',
    },
];
/**
 * Voice tone emotion mapping
 */
const VOICE_TONE_MAP = {
    breaking: { emotion: 'sadness', granular: 'overwhelmed', confidence: 0.85 },
    falling: { emotion: 'sadness', granular: 'melancholy', confidence: 0.65 },
    rising: { emotion: 'anticipation', granular: 'nervous', confidence: 0.55 },
    flat: { emotion: 'neutral', granular: 'exhausted', confidence: 0.6 },
};
/**
 * AnticipationEngine - Pure Domain Service
 *
 * Analyzes partial input to predict emotions before fully expressed.
 * No I/O dependencies - takes data in, returns predictions.
 *
 * @example
 * ```typescript
 * const engine = new AnticipationEngine();
 *
 * const anticipated = engine.anticipateFromContext({
 *   partialTranscript: "I've been thinking about...",
 *   voiceTone: 'falling',
 * }, historicalPatterns);
 *
 * if (anticipated?.shouldPrepareEmpathy) {
 *   // Start showing contemplative micro-expression
 * }
 * ```
 */
export class AnticipationEngine {
    /**
     * Anticipate emotion from partial context
     */
    anticipateFromContext(context, historicalPatterns) {
        const candidates = [];
        // 1. Check speech patterns
        if (context.partialTranscript) {
            const speechAnticipation = this.anticipateFromSpeechPattern(context.partialTranscript);
            if (speechAnticipation) {
                candidates.push(speechAnticipation);
            }
        }
        // 2. Check voice tone
        if (context.voiceTone) {
            const toneAnticipation = this.anticipateFromVoiceTone(context.voiceTone);
            if (toneAnticipation) {
                candidates.push(toneAnticipation);
            }
        }
        // 3. Check breath pattern
        if (context.breathPattern) {
            const breathAnticipation = this.anticipateFromBreathPattern(context.breathPattern);
            if (breathAnticipation) {
                candidates.push(breathAnticipation);
            }
        }
        // 4. Check historical patterns
        if (context.topics || context.currentTime || context.mentionedPeople) {
            const patternAnticipation = this.anticipateFromHistoricalPatterns(context, historicalPatterns);
            if (patternAnticipation) {
                candidates.push(patternAnticipation);
            }
        }
        // No anticipations
        if (candidates.length === 0)
            return null;
        // Combine anticipations
        return this.combineAnticipations(candidates);
    }
    /**
     * Anticipate from speech patterns
     */
    anticipateFromSpeechPattern(partialTranscript) {
        const normalized = partialTranscript.trim().toLowerCase();
        for (const signal of SPEECH_PATTERN_SIGNALS) {
            if (signal.pattern.test(normalized)) {
                return AnticipatedEmotion.fromPartialSpeech(partialTranscript, signal.emotion, signal.granular ?? null, signal.confidence, signal.reasoning);
            }
        }
        return null;
    }
    /**
     * Anticipate from voice tone
     */
    anticipateFromVoiceTone(tone) {
        const mapping = VOICE_TONE_MAP[tone];
        if (!mapping)
            return null;
        return AnticipatedEmotion.fromVoiceTone(tone, mapping.emotion, mapping.confidence, mapping.granular);
    }
    /**
     * Anticipate from breath pattern
     */
    anticipateFromBreathPattern(pattern) {
        const breathEmotionMap = {
            sighing: { emotion: 'sadness', granular: 'melancholy', confidence: 0.5 },
            shallow: { emotion: 'fear', granular: 'anxious', confidence: 0.55 },
            held: { emotion: 'fear', granular: 'nervous', confidence: 0.6 },
        };
        const mapping = breathEmotionMap[pattern];
        if (!mapping)
            return null;
        return AnticipatedEmotion.create({
            emotion: mapping.emotion,
            granular: mapping.granular ?? undefined,
            confidence: mapping.confidence >= 0.6 ? 'likely' : 'possible',
            signals: ['breath_pattern'],
            reasoning: `${pattern} breathing suggests ${mapping.emotion}`,
        });
    }
    /**
     * Anticipate from historical patterns
     */
    anticipateFromHistoricalPatterns(context, patterns) {
        // Find matching patterns
        const matchingPatterns = patterns.filter((p) => p.matchesTriggers({
            topics: context.topics,
            currentTime: context.currentTime,
            mentionedPeople: context.mentionedPeople,
        }));
        if (matchingPatterns.length === 0)
            return null;
        // Take highest confidence pattern
        const bestMatch = matchingPatterns.reduce((best, current) => (current.confidence > best.confidence ? current : best), matchingPatterns[0]);
        return AnticipatedEmotion.fromPattern(bestMatch.id, bestMatch.resultingEmotion, bestMatch.resultingGranular, bestMatch.confidence, `Historical pattern: ${bestMatch.description}`);
    }
    /**
     * Combine multiple anticipations into one
     */
    combineAnticipations(anticipations) {
        if (anticipations.length === 1)
            return anticipations[0];
        // Start with highest confidence
        let result = anticipations.reduce((best, current) => (current.confidenceScore > best.confidenceScore ? current : best), anticipations[0]);
        // Combine with others if they agree
        for (const other of anticipations) {
            if (other !== result) {
                result = result.combineWith(other);
            }
        }
        return result;
    }
    /**
     * Forecast emotional trajectory over coming days
     *
     * SUPERHUMAN: Predict emotions days in advance based on patterns
     */
    forecastEmotionalTrajectory(patterns, upcomingEvents, currentState) {
        const forecasts = [];
        for (const event of upcomingEvents) {
            // Check if any pattern matches this event's topics
            const matchingPattern = patterns.find((p) => p.triggers.some((trigger) => event.topics.some((topic) => topic.toLowerCase().includes(trigger.toLowerCase()) ||
                trigger.toLowerCase().includes(topic.toLowerCase()))));
            if (matchingPattern) {
                forecasts.push({
                    date: event.date,
                    event: event.description,
                    predictedEmotion: matchingPattern.resultingEmotion,
                    confidence: matchingPattern.confidence * 0.8, // Reduce confidence for future
                    reasoning: `Based on pattern "${matchingPattern.description}"`,
                });
            }
            // Check temporal patterns
            const temporalPatterns = patterns.filter((p) => p.patternType === 'temporal');
            for (const pattern of temporalPatterns) {
                if (pattern.matchesTriggers({ currentTime: event.date })) {
                    forecasts.push({
                        date: event.date,
                        event: event.description,
                        predictedEmotion: pattern.resultingEmotion,
                        confidence: pattern.confidence * 0.7,
                        reasoning: `Temporal pattern: ${pattern.description}`,
                    });
                }
            }
        }
        // Deduplicate by date
        const seen = new Set();
        return forecasts.filter((f) => {
            const key = `${f.date.toDateString()}-${f.event}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    /**
     * Calculate optimal time to surface an insight
     *
     * SUPERHUMAN: Know when they're most receptive
     */
    calculateOptimalSurfacingTime(insight, patterns, currentState) {
        // Don't surface during crisis
        if (currentState.isCrisisLevel) {
            return {
                shouldSurfaceNow: false,
                reason: 'User is in crisis - focus on immediate support',
            };
        }
        // Don't surface during high negative intensity
        if (currentState.isNegative && currentState.intensity > 0.7) {
            return {
                shouldSurfaceNow: false,
                reason: 'User is processing strong negative emotions',
            };
        }
        // Check if insight topics match current negative patterns
        const negativeTrigger = patterns.some((p) => ['fear', 'sadness', 'anger'].includes(p.resultingEmotion) &&
            p.triggers.some((t) => insight.topics.some((topic) => topic.toLowerCase().includes(t.toLowerCase()))));
        if (negativeTrigger && insight.emotionalWeight > 0.5) {
            return {
                shouldSurfaceNow: false,
                reason: 'This topic triggers negative emotions - wait for better time',
            };
        }
        // Positive state = good time
        if (currentState.isPositive || currentState.primary === 'neutral') {
            return {
                shouldSurfaceNow: true,
                reason: 'User is in receptive emotional state',
            };
        }
        return {
            shouldSurfaceNow: false,
            reason: 'Waiting for more optimal moment',
        };
    }
}
//# sourceMappingURL=anticipation-engine.js.map