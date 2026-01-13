/**
 * VoiceAnalyzer Adapter
 *
 * Adapts existing voice emotion code to the VoiceAnalyzer interface.
 * This bridges the v2 personality system with existing voice processing.
 *
 * @module personality/infrastructure/adapters/voice-analyzer-adapter
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'VoiceAnalyzerAdapter' });
/**
 * Map arousal/valence to primary emotions
 */
function mapToEmotion(arousal, valence) {
    // High arousal, positive valence = joy
    if (arousal > 0.6 && valence > 0.3) {
        return { primary: 'joy', granular: arousal > 0.8 ? 'ecstatic' : 'happy' };
    }
    // High arousal, negative valence = fear/anger
    if (arousal > 0.6 && valence < -0.3) {
        if (arousal > 0.8) {
            return { primary: 'fear', granular: 'terrified' };
        }
        return { primary: 'anger', granular: 'frustrated' };
    }
    // Low arousal, negative valence = sadness
    if (arousal < 0.4 && valence < -0.2) {
        return { primary: 'sadness', granular: arousal < 0.2 ? 'devastated' : 'sad' };
    }
    // Low arousal, positive valence = calm/content
    if (arousal < 0.4 && valence > 0.2) {
        return { primary: 'joy', granular: 'content' };
    }
    // Moderate arousal, slightly negative = anxiety
    if (arousal > 0.4 && arousal < 0.7 && valence < 0) {
        return { primary: 'fear', granular: 'anxious' };
    }
    // Default
    return { primary: 'neutral', granular: 'calm' };
}
/**
 * VoiceAnalyzerAdapter - Implements VoiceAnalyzer using existing voice processing
 *
 * This is a lightweight adapter that provides reasonable defaults and
 * integrates with existing voice emotion detection where available.
 */
export class VoiceAnalyzerAdapter {
    /**
     * Analyze voice for emotional content
     */
    async analyzeEmotion(features) {
        try {
            // Estimate arousal from energy and speaking rate
            const arousal = this.estimateArousal(features);
            // Estimate valence from pitch variation and voice quality
            const valence = this.estimateValence(features);
            // Map to emotion
            const { primary, granular } = mapToEmotion(arousal, valence);
            // Calculate confidence based on available features
            const confidence = this.calculateConfidence(features);
            // Determine tone
            const tone = await this.classifyTone(features);
            return {
                emotion: primary,
                granular,
                confidence,
                tone,
                pace: this.classifyPace(features),
                source: 'voice',
            };
        }
        catch (error) {
            log.warn({ error }, 'Failed to analyze voice emotion, returning neutral');
            return {
                emotion: 'neutral',
                granular: null,
                confidence: 0.3,
                tone: 'neutral',
                pace: 'normal',
                source: 'voice',
            };
        }
    }
    /**
     * Analyze voice for stress indicators
     */
    async analyzeStress(features) {
        const indicators = [];
        let stressLevel = 0;
        // High jitter indicates stress
        if (features.jitter && features.jitter > 0.02) {
            indicators.push('Voice instability (jitter)');
            stressLevel += 0.2;
        }
        // High shimmer indicates stress
        if (features.shimmer && features.shimmer > 0.05) {
            indicators.push('Amplitude instability (shimmer)');
            stressLevel += 0.15;
        }
        // Fast speaking rate can indicate anxiety
        if (features.speakingRate && features.speakingRate > 180) {
            indicators.push('Rapid speech');
            stressLevel += 0.15;
        }
        // Many pauses can indicate processing stress
        if (features.pauseCount && features.pauseDuration) {
            const avgPause = features.pauseDuration / features.pauseCount;
            if (avgPause > 1000) {
                indicators.push('Long pauses');
                stressLevel += 0.1;
            }
        }
        // High pitch variation
        if (features.pitchVariation && features.pitchVariation > 50) {
            indicators.push('High pitch variation');
            stressLevel += 0.15;
        }
        // Low energy can indicate exhaustion/burnout stress
        if (features.energyLevel && features.energyLevel < -20) {
            indicators.push('Low vocal energy');
            stressLevel += 0.1;
        }
        return {
            stressLevel: Math.min(1, stressLevel),
            indicators,
            trend: 'stable', // Would need historical data
            confidence: this.calculateConfidence(features) * 0.8,
        };
    }
    /**
     * Classify a silence
     */
    async classifySilence(durationMs, context) {
        // Very short silences = processing
        if (durationMs < 3000) {
            return {
                type: 'processing',
                confidence: 0.7,
                recommendedResponse: 'wait',
            };
        }
        // After emotional content, longer silences are emotional
        if (context.precedingEmotion && ['sadness', 'fear'].includes(context.precedingEmotion)) {
            return {
                type: 'emotional',
                confidence: 0.75,
                recommendedResponse: 'hold_space',
                suggestedPhrase: "Take your time. I'm here.",
            };
        }
        // In deep phase, silences might be contemplative
        if (context.conversationPhase === 'deep') {
            return {
                type: 'contemplative',
                confidence: 0.65,
                recommendedResponse: 'wait',
            };
        }
        // Long silence in opening might be uncomfortable
        if (context.conversationPhase === 'opening' && durationMs > 8000) {
            return {
                type: 'uncomfortable',
                confidence: 0.6,
                recommendedResponse: 'gentle_prompt',
                suggestedPhrase: "What's on your mind?",
            };
        }
        // Default to invitational
        if (durationMs > 10000) {
            return {
                type: 'invitational',
                confidence: 0.5,
                recommendedResponse: 'gentle_prompt',
                suggestedPhrase: "I'm here when you're ready.",
            };
        }
        return {
            type: 'processing',
            confidence: 0.5,
            recommendedResponse: 'wait',
        };
    }
    /**
     * Analyze breath patterns
     */
    async analyzeBreath(features) {
        // Infer breath pattern from pauses and voice quality
        let pattern = 'normal';
        let emotionalIndicator;
        // Many short pauses = shallow breathing
        if (features.pauseCount && features.speechDuration) {
            const pauseRatio = features.pauseCount / (features.speechDuration / 1000);
            if (pauseRatio > 0.3) {
                pattern = 'shallow';
                emotionalIndicator = 'Anxiety or stress';
            }
        }
        // Long pauses between sentences = sighing
        if (features.pauseDuration && features.pauseCount) {
            const avgPause = features.pauseDuration / features.pauseCount;
            if (avgPause > 2000) {
                pattern = 'sighing';
                emotionalIndicator = 'Sadness or exhaustion';
            }
        }
        // Low energy with slow rate = deep/contemplative breathing
        if (features.energyLevel && features.energyLevel < -10 && features.speakingRate && features.speakingRate < 120) {
            pattern = 'deep';
            emotionalIndicator = 'Contemplation or calm';
        }
        return {
            pattern,
            shouldSync: pattern === 'normal' || pattern === 'deep',
            emotionalIndicator,
        };
    }
    /**
     * Detect if voice is breaking
     */
    async detectVoiceBreaking(features) {
        let breakingScore = 0;
        // High jitter + high shimmer = voice breaking
        if (features.jitter && features.jitter > 0.03)
            breakingScore += 0.3;
        if (features.shimmer && features.shimmer > 0.08)
            breakingScore += 0.3;
        // Low voice quality
        if (features.voiceQuality && features.voiceQuality < 0.5)
            breakingScore += 0.2;
        // High pitch variation in short bursts
        if (features.pitchVariation && features.pitchVariation > 80)
            breakingScore += 0.2;
        const isBreaking = breakingScore >= 0.4;
        const severity = breakingScore >= 0.8 ? 'severe' : breakingScore >= 0.6 ? 'moderate' : 'mild';
        return {
            isBreaking,
            confidence: Math.min(0.9, breakingScore + 0.3),
            severity,
        };
    }
    /**
     * Get voice tone classification
     */
    async classifyTone(features) {
        // Check for breaking first
        const breaking = await this.detectVoiceBreaking(features);
        if (breaking.isBreaking)
            return 'breaking';
        // Rising pitch pattern
        if (features.pitchVariation && features.pitchVariation > 30) {
            if (features.pitchMean && features.pitchMean > 200) {
                return 'rising';
            }
        }
        // Falling pitch (often indicates sadness)
        if (features.pitchMean && features.pitchMean < 150 && features.energyLevel && features.energyLevel < -10) {
            return 'falling';
        }
        // Flat (monotone, exhaustion)
        if (features.pitchVariation && features.pitchVariation < 15) {
            return 'flat';
        }
        // Warm (positive energy, moderate everything)
        if (features.voiceQuality && features.voiceQuality > 0.7 && features.energyLevel && features.energyLevel > 0) {
            return 'warm';
        }
        return 'neutral';
    }
    /**
     * Compare current voice to baseline
     */
    async compareToBaseline(currentFeatures, baselineFeatures) {
        const deviations = [];
        // Compare pitch
        if (currentFeatures.pitchMean && baselineFeatures.pitchMean) {
            const pitchDiff = Math.abs(currentFeatures.pitchMean - baselineFeatures.pitchMean);
            if (pitchDiff > 30) {
                deviations.push(currentFeatures.pitchMean > baselineFeatures.pitchMean
                    ? 'Higher pitch than usual'
                    : 'Lower pitch than usual');
            }
        }
        // Compare speaking rate
        if (currentFeatures.speakingRate && baselineFeatures.speakingRate) {
            const rateDiff = Math.abs(currentFeatures.speakingRate - baselineFeatures.speakingRate);
            if (rateDiff > 30) {
                deviations.push(currentFeatures.speakingRate > baselineFeatures.speakingRate
                    ? 'Speaking faster than usual'
                    : 'Speaking slower than usual');
            }
        }
        // Compare energy
        if (currentFeatures.energyLevel && baselineFeatures.energyLevel) {
            const energyDiff = Math.abs(currentFeatures.energyLevel - baselineFeatures.energyLevel);
            if (energyDiff > 10) {
                deviations.push(currentFeatures.energyLevel > baselineFeatures.energyLevel
                    ? 'More vocal energy than usual'
                    : 'Less vocal energy than usual');
            }
        }
        const significantChange = deviations.length >= 2;
        let suggestedInterpretation;
        if (significantChange) {
            if (deviations.some((d) => d.includes('faster')) && deviations.some((d) => d.includes('Higher'))) {
                suggestedInterpretation = 'May be excited or anxious';
            }
            else if (deviations.some((d) => d.includes('slower')) && deviations.some((d) => d.includes('Less'))) {
                suggestedInterpretation = 'May be tired or sad';
            }
        }
        return { deviations, significantChange, suggestedInterpretation };
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    estimateArousal(features) {
        let arousal = 0.5; // Default moderate
        // Speaking rate affects arousal
        if (features.speakingRate) {
            if (features.speakingRate > 180)
                arousal += 0.2;
            else if (features.speakingRate > 150)
                arousal += 0.1;
            else if (features.speakingRate < 100)
                arousal -= 0.2;
            else if (features.speakingRate < 120)
                arousal -= 0.1;
        }
        // Energy level
        if (features.energyLevel) {
            arousal += features.energyLevel / 100; // Normalize to ~0.2 range
        }
        // Pitch variation
        if (features.pitchVariation) {
            if (features.pitchVariation > 50)
                arousal += 0.15;
            else if (features.pitchVariation < 20)
                arousal -= 0.1;
        }
        return Math.max(0, Math.min(1, arousal));
    }
    estimateValence(features) {
        let valence = 0; // Default neutral
        // Voice quality is positive indicator
        if (features.voiceQuality) {
            valence += (features.voiceQuality - 0.5) * 0.4;
        }
        // High jitter/shimmer are negative
        if (features.jitter && features.jitter > 0.02)
            valence -= 0.2;
        if (features.shimmer && features.shimmer > 0.05)
            valence -= 0.15;
        // Moderate pitch variation is positive
        if (features.pitchVariation) {
            if (features.pitchVariation > 20 && features.pitchVariation < 50) {
                valence += 0.1;
            }
            else if (features.pitchVariation < 15) {
                valence -= 0.15; // Monotone is negative
            }
        }
        return Math.max(-1, Math.min(1, valence));
    }
    calculateConfidence(features) {
        let featureCount = 0;
        if (features.pitchMean !== undefined)
            featureCount++;
        if (features.pitchVariation !== undefined)
            featureCount++;
        if (features.speakingRate !== undefined)
            featureCount++;
        if (features.energyLevel !== undefined)
            featureCount++;
        if (features.jitter !== undefined)
            featureCount++;
        if (features.shimmer !== undefined)
            featureCount++;
        if (features.voiceQuality !== undefined)
            featureCount++;
        // More features = higher confidence, max 0.9
        return Math.min(0.9, 0.3 + featureCount * 0.1);
    }
    classifyPace(features) {
        if (!features.speakingRate)
            return 'normal';
        if (features.speakingRate > 200)
            return 'rapid';
        if (features.speakingRate > 170)
            return 'fast';
        if (features.speakingRate < 100)
            return 'hesitant';
        if (features.speakingRate < 130)
            return 'slow';
        return 'normal';
    }
}
/**
 * Get singleton instance
 */
let instance = null;
export function getVoiceAnalyzerAdapter() {
    if (!instance) {
        instance = new VoiceAnalyzerAdapter();
    }
    return instance;
}
//# sourceMappingURL=voice-analyzer-adapter.js.map