/**
 * Voice Emotion Matching
 *
 * Adjusts TTS response characteristics based on detected user emotion.
 * This creates empathetic responses where the agent's voice tone
 * naturally matches or appropriately responds to the user's emotional state.
 *
 * Cartesia voice controls:
 * - speed: "slowest", "slow", "normal", "fast", "fastest" or -1.0 to 1.0
 * - emotion: Cartesia supports emotion controls via voice embedding modifications
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// EMOTION RESPONSE MAPPING
// ============================================================================
/**
 * How the agent should respond to different user emotions
 *
 * Philosophy:
 * - Sad/anxious users → Slower, warmer, more pauses (calming)
 * - Happy/excited users → Match their energy (celebrate with them)
 * - Neutral → Balanced, default response
 * - Angry/frustrated → Calm but not condescending
 */
const EMOTION_RESPONSES = {
    // Positive emotions - match the energy!
    happy: {
        speedAdjust: 0.1, // Slightly faster
        volumeAdjust: 1.1,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'high', pause: 'less' },
    },
    excited: {
        speedAdjust: 0.2, // More energy
        volumeAdjust: 1.15,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'high', pause: 'less' },
    },
    // Negative emotions - slow down, add warmth
    sad: {
        speedAdjust: -0.2, // Slower
        volumeAdjust: 0.9,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
        responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
    },
    anxious: {
        speedAdjust: -0.15,
        volumeAdjust: 0.95,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'medium', pause: 'more' },
    },
    worried: {
        speedAdjust: -0.1,
        volumeAdjust: 0.95,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'medium', pause: 'more' },
    },
    frustrated: {
        speedAdjust: -0.1,
        volumeAdjust: 1.0,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'medium', pause: 'normal' },
    },
    angry: {
        speedAdjust: -0.15,
        volumeAdjust: 0.95,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
    },
    // Neutral states
    neutral: {
        speedAdjust: 0,
        volumeAdjust: 1.0,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
    },
    curious: {
        speedAdjust: 0,
        volumeAdjust: 1.0,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
    },
    // Special states
    tired: {
        speedAdjust: -0.2,
        volumeAdjust: 0.9,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
        responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
    },
    confident: {
        speedAdjust: 0.05,
        volumeAdjust: 1.05,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
    },
};
/**
 * Register a custom emotion response
 * FIX BUG #voice-13: Allow extending emotion responses at runtime
 */
export function registerEmotionResponse(emotion, response) {
    EMOTION_RESPONSES[emotion.toLowerCase()] = response;
}
/**
 * Get all registered emotion types
 */
export function getRegisteredEmotions() {
    return Object.keys(EMOTION_RESPONSES);
}
/**
 * Check if an emotion type is registered
 */
export function isEmotionRegistered(emotion) {
    return emotion.toLowerCase() in EMOTION_RESPONSES;
}
/**
 * Get voice modulation parameters based on detected user emotion
 *
 * @param voiceEmotion - Voice emotion analysis result
 * @param tremorOptions - Optional voice tremor data for "Better than Human" sensitivity
 */
export function getEmotionModulation(voiceEmotion, tremorOptions) {
    // Default to neutral if no emotion detected
    if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
        const baseResponse = { ...EMOTION_RESPONSES.neutral };
        // 🎭 BETTER THAN HUMAN: Even without clear emotion, respond to voice tremor
        // Trembling voice = user is stressed, even if they sound "neutral"
        if (tremorOptions?.intensity === 'pronounced' || tremorOptions?.intensity === 'noticeable') {
            return {
                speedAdjust: -0.15, // Slow down
                volumeAdjust: 0.9, // Softer
                ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
                responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
                matchedEmotion: 'stressed_tremor',
                confidence: tremorOptions.intensity === 'pronounced' ? 0.8 : 0.6,
            };
        }
        return {
            ...baseResponse,
            matchedEmotion: 'neutral',
            confidence: 0,
        };
    }
    const emotion = voiceEmotion.primary.toLowerCase();
    const response = EMOTION_RESPONSES[emotion] || EMOTION_RESPONSES.neutral;
    // Scale adjustments by confidence
    const confidenceScale = voiceEmotion.confidence;
    let speedAdjust = response.speedAdjust * confidenceScale;
    let volumeAdjust = 1 + (response.volumeAdjust - 1) * confidenceScale;
    let ssmlHints = { ...response.ssmlHints };
    const responseStyle = { ...response.responseStyle };
    // 🎭 BETTER THAN HUMAN: Voice tremor overrides - user may be MORE stressed than emotion shows
    // When voice trembles, they need extra gentleness regardless of detected emotion
    if (tremorOptions?.intensity === 'pronounced') {
        // Pronounced tremor = significant stress - go extra gentle
        speedAdjust = Math.min(speedAdjust, -0.2); // At least 20% slower
        volumeAdjust = Math.min(volumeAdjust, 0.85); // Definitely softer
        ssmlHints = { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' };
        responseStyle.warmth = 'high';
        responseStyle.pause = 'more';
        getLogger().debug({ emotion, tremorIntensity: tremorOptions.intensity }, '🎭 Voice tremor override: applying extra-gentle delivery');
    }
    else if (tremorOptions?.intensity === 'noticeable') {
        // Noticeable tremor = some stress - gentle up a bit
        speedAdjust = Math.min(speedAdjust, -0.1); // At least 10% slower
        volumeAdjust = Math.min(volumeAdjust, 0.95); // Slightly softer
        if (ssmlHints.prosodyVolume !== 'soft') {
            ssmlHints.prosodyVolume = 'medium'; // Don't be loud
        }
        responseStyle.warmth = 'high';
    }
    return {
        speedAdjust,
        volumeAdjust,
        ssmlHints,
        responseStyle,
        matchedEmotion: emotion,
        confidence: voiceEmotion.confidence,
    };
}
/**
 * Convert emotion modulation to SSML wrapper
 * Wraps the response text in Cartesia-compatible SSML tags to match user emotion
 *
 * Uses Cartesia Sonic-3 compatible tags:
 * - <speed ratio="X"> for pace (0.6-1.2)
 * - <volume ratio="X"> for loudness (0.5-1.5)
 * - <emotion value="X"> for tone (affectionate, sad, curious, etc.)
 */
export function wrapWithEmotionProsody(text, modulation) {
    // Only apply if there's meaningful modulation
    if (modulation.confidence < 0.4) {
        return text;
    }
    const { ssmlHints, responseStyle, volumeAdjust } = modulation;
    let result = text;
    // Apply warmth as emotion tag (Cartesia: affectionate for high warmth)
    if (responseStyle.warmth === 'high') {
        result = `<emotion value="affectionate">${result}</emotion>`;
    }
    // Apply volume adjustment (Cartesia uses <volume ratio="X">)
    if (ssmlHints.prosodyVolume === 'soft' || volumeAdjust < 0.95) {
        const volumeRatio = volumeAdjust < 0.95 ? volumeAdjust.toFixed(2) : '0.85';
        result = `<volume ratio="${volumeRatio}">${result}</volume>`;
    }
    // Apply speed adjustment (Cartesia uses <speed ratio="X">)
    if (ssmlHints.prosodyRate === 'slow') {
        result = `<speed ratio="0.85">${result}</speed>`;
    }
    else if (ssmlHints.prosodyRate === 'fast') {
        result = `<speed ratio="1.1">${result}</speed>`;
    }
    // Log if we made changes
    if (result !== text) {
        getLogger().debug({
            emotion: modulation.matchedEmotion,
            confidence: modulation.confidence,
            warmth: responseStyle.warmth,
            rate: ssmlHints.prosodyRate,
            volume: ssmlHints.prosodyVolume,
        }, '🎭 Applying emotion prosody to response');
    }
    return result;
}
/**
 * Apply human listening SSML adjustments to text.
 * Called after emotion prosody to layer in cognitive/emotional state awareness.
 *
 * This responds to:
 * - Cognitive overload → Slower, more pauses
 * - Distress signals → Softer, gentler delivery
 * - Disengagement → Normal pace (don't slow down boring content)
 */
export function applyHumanListeningAdjustments(text, suggestions) {
    // Skip if no meaningful adjustments
    const hasSpeedChange = suggestions.speedMultiplier < 0.98 || suggestions.speedMultiplier > 1.02;
    const hasVolumeChange = suggestions.volumeLevel !== 'normal';
    if (!hasSpeedChange && !hasVolumeChange) {
        return text;
    }
    let result = text;
    // Apply volume adjustment
    if (suggestions.volumeLevel === 'softer') {
        // Cartesia volume ratio: 0.7 for softer delivery
        result = `<volume ratio="0.85">${result}</volume>`;
    }
    // Apply speed adjustment
    if (hasSpeedChange) {
        // Cartesia speed ratio: typically 0.8-1.2
        const speedRatio = Math.max(0.8, Math.min(1.15, suggestions.speedMultiplier)).toFixed(2);
        result = `<speed ratio="${speedRatio}">${result}</speed>`;
    }
    // Log the adjustment
    if (result !== text) {
        getLogger().debug({
            speedMultiplier: suggestions.speedMultiplier,
            volumeLevel: suggestions.volumeLevel,
        }, '🎧 Applying human listening SSML adjustments');
    }
    return result;
}
/**
 * Get contextual suggestion for response tone based on emotion
 * This can be injected into the LLM prompt to influence word choice
 */
export function getEmotionGuidance(modulation) {
    if (modulation.confidence < 0.5) {
        return null;
    }
    const { matchedEmotion, responseStyle } = modulation;
    const guidelines = {
        sad: `[The user sounds sad. Respond with extra warmth and empathy. Take your time. Use gentler language.]`,
        anxious: `[The user sounds anxious. Be calm and reassuring. Speak slower. Offer concrete help.]`,
        frustrated: `[The user sounds frustrated. Acknowledge their feelings. Be direct and helpful. Don't be overly cheerful.]`,
        angry: `[The user sounds upset. Stay calm and professional. Validate their feelings. Focus on solutions.]`,
        happy: `[The user sounds happy! Match their energy. Feel free to be more enthusiastic.]`,
        excited: `[The user is excited! Share their enthusiasm. Be energetic and positive.]`,
        tired: `[The user sounds tired. Be concise and considerate. Don't overwhelm them with information.]`,
        worried: `[The user sounds worried. Be reassuring and clear. Offer specific help.]`,
    };
    return guidelines[matchedEmotion] || null;
}
/**
 * Apply emotion-aware adjustments to Cartesia TTS speed parameter
 */
export function adjustTTSSpeed(baseSpeed, modulation) {
    // Clamp to Cartesia's valid range: -1.0 to 1.0
    const adjusted = baseSpeed + modulation.speedAdjust;
    return Math.max(-1.0, Math.min(1.0, adjusted));
}
// ============================================================================
// EXPORTS
// ============================================================================
export { EMOTION_RESPONSES };
//# sourceMappingURL=emotion-matching.js.map