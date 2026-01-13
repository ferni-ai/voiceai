/**
 * Voice Emotion → Entrance Enhancement
 *
 * Makes persona entrances respond to voice emotion signals.
 * When we detect stress/anxiety in their voice, we adjust the entrance
 * even if the text seems neutral.
 *
 * "Better than human" means hearing what they're NOT saying.
 *
 * @module personas/voice-emotion-entrances
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// VOICE EMOTION → ENTRANCE MAPPING
// ============================================================================
const VOICE_EMOTION_ADJUSTMENTS = {
    stressed: {
        overrideMood: 'stressed',
        preferredStyle: 'calm',
        toneAdjustments: { softer: true, warmer: true, calmer: true, morePresent: true },
        reason: 'Voice stress detected - leading with calm presence',
    },
    anxious: {
        overrideMood: 'stressed',
        preferredStyle: 'gentle',
        toneAdjustments: { softer: true, warmer: true, calmer: true, morePresent: true },
        reason: 'Anxiety in voice - using grounding entrance',
    },
    sad: {
        overrideMood: 'sad',
        preferredStyle: 'warm',
        toneAdjustments: { softer: true, warmer: true, calmer: false, morePresent: true },
        reason: 'Sadness detected in voice - leading with warmth',
    },
    fearful: {
        overrideMood: 'stressed',
        preferredStyle: 'calm',
        toneAdjustments: { softer: true, warmer: true, calmer: true, morePresent: true },
        reason: 'Fear in voice - prioritizing safety and calm',
    },
    angry: {
        preferredStyle: 'calm',
        toneAdjustments: { softer: false, warmer: false, calmer: true, morePresent: true },
        reason: 'Anger in voice - staying grounded',
    },
    excited: {
        overrideMood: 'excited',
        preferredStyle: 'energetic',
        toneAdjustments: { softer: false, warmer: true, calmer: false, morePresent: false },
        reason: 'Excitement in voice - matching energy',
    },
    surprised: {
        preferredStyle: 'warm',
        toneAdjustments: { softer: false, warmer: true, calmer: false, morePresent: true },
        reason: 'Surprise in voice - being present',
    },
    confused: {
        overrideMood: 'confused',
        preferredStyle: 'warm',
        toneAdjustments: { softer: true, warmer: true, calmer: false, morePresent: true },
        reason: 'Confusion in voice - being clear and supportive',
    },
    neutral: {
        preferredStyle: 'standard',
        toneAdjustments: { softer: false, warmer: false, calmer: false, morePresent: false },
        reason: 'Neutral voice - standard entrance',
    },
};
// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================
/**
 * Get entrance adjustment based on voice emotion
 */
export function getVoiceEmotionEntranceAdjustment(voiceContext) {
    const defaultAdjustment = {
        preferredStyle: 'standard',
        toneAdjustments: { softer: false, warmer: false, calmer: false, morePresent: false },
        reason: 'No voice emotion context',
    };
    // No voice context - use defaults
    if (!voiceContext.voiceEmotion) {
        return defaultAdjustment;
    }
    // Low confidence - minimal adjustment
    if (voiceContext.voiceConfidence && voiceContext.voiceConfidence < 0.4) {
        log.debug({ confidence: voiceContext.voiceConfidence }, 'Low voice confidence - minimal entrance adjustment');
        return defaultAdjustment;
    }
    // Get base adjustment
    const baseAdj = VOICE_EMOTION_ADJUSTMENTS[voiceContext.voiceEmotion];
    if (!baseAdj) {
        log.debug({ emotion: voiceContext.voiceEmotion }, 'Unknown voice emotion for entrance');
        return defaultAdjustment;
    }
    const adjustment = {
        ...defaultAdjustment,
        ...baseAdj,
        toneAdjustments: {
            ...defaultAdjustment.toneAdjustments,
            ...(baseAdj.toneAdjustments || {}),
        },
    };
    // Amplify based on arousal/valence
    if (voiceContext.arousal !== undefined && voiceContext.arousal > 0.7) {
        adjustment.toneAdjustments.morePresent = true;
        adjustment.reason += ' (high arousal)';
    }
    if (voiceContext.valence !== undefined && voiceContext.valence < -0.3) {
        adjustment.toneAdjustments.warmer = true;
        adjustment.toneAdjustments.softer = true;
        adjustment.preferredStyle =
            adjustment.preferredStyle === 'standard' ? 'warm' : adjustment.preferredStyle;
        adjustment.reason += ' (negative valence)';
    }
    // Voice quality signals
    if (voiceContext.hasVoiceStrain) {
        adjustment.overrideMood = 'stressed';
        adjustment.preferredStyle = 'calm';
        adjustment.toneAdjustments.calmer = true;
        adjustment.reason += ' (voice strain)';
    }
    if (voiceContext.hasVoiceTremor) {
        adjustment.overrideMood = 'stressed';
        adjustment.toneAdjustments.softer = true;
        adjustment.toneAdjustments.warmer = true;
        adjustment.reason += ' (voice tremor)';
    }
    // Speech rate deviation
    if (voiceContext.speechRateDeviation !== undefined) {
        if (voiceContext.speechRateDeviation > 30) {
            // Speaking much faster than normal - might be anxious/excited
            if (adjustment.preferredStyle !== 'energetic') {
                adjustment.toneAdjustments.calmer = true;
                adjustment.reason += ' (rapid speech)';
            }
        }
        else if (voiceContext.speechRateDeviation < -30) {
            // Speaking much slower than normal - might be sad/tired
            adjustment.toneAdjustments.morePresent = true;
            adjustment.reason += ' (slow speech)';
        }
    }
    log.debug({
        voiceEmotion: voiceContext.voiceEmotion,
        style: adjustment.preferredStyle,
        reason: adjustment.reason,
    }, '🎙️ Voice emotion entrance adjustment');
    return adjustment;
}
/**
 * Apply voice emotion adjustment to entrance result
 */
export function applyVoiceAdjustmentToEntrance(entrance, adjustment) {
    const modified = { ...entrance };
    // Don't modify if already calm support and adjustment is calm
    if (entrance.style === 'calm_support' && adjustment.preferredStyle === 'calm') {
        return entrance;
    }
    // Apply tone adjustments to the entrance text
    let entranceText = entrance.entrance;
    // Add warmer language if needed
    if (adjustment.toneAdjustments.warmer &&
        !entranceText.includes('glad') &&
        !entranceText.includes('good')) {
        // Prepend a warm acknowledgment for stressed users
        if (adjustment.preferredStyle === 'calm' || adjustment.preferredStyle === 'gentle') {
            entranceText = `Hey... ${entranceText.toLowerCase()}`;
        }
    }
    // Soften exclamation marks if needed
    if (adjustment.toneAdjustments.softer) {
        entranceText = entranceText.replace(/!/g, '.');
    }
    modified.entrance = entranceText;
    // Add voice awareness to components
    modified.components = {
        ...modified.components,
        warmthLevel: adjustment.preferredStyle,
    };
    return modified;
}
/**
 * Determine if voice emotion should override text-based mood
 */
export function shouldVoiceOverrideMood(textMood, voiceContext) {
    // Voice tremor or strain always overrides
    if (voiceContext.hasVoiceTremor || voiceContext.hasVoiceStrain) {
        return true;
    }
    // High confidence voice emotion that contradicts text
    if (voiceContext.voiceConfidence && voiceContext.voiceConfidence > 0.6) {
        const voiceEmotion = voiceContext.voiceEmotion?.toLowerCase();
        // Voice says stressed but text says neutral/excited
        if ((voiceEmotion === 'stressed' || voiceEmotion === 'anxious' || voiceEmotion === 'fearful') &&
            (textMood === 'neutral' || textMood === 'excited')) {
            return true;
        }
        // Voice says sad but text says neutral
        if (voiceEmotion === 'sad' && textMood === 'neutral') {
            return true;
        }
    }
    // High arousal with negative valence
    if (voiceContext.arousal !== undefined &&
        voiceContext.valence !== undefined &&
        voiceContext.arousal > 0.6 &&
        voiceContext.valence < -0.2) {
        return true;
    }
    return false;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const voiceEmotionEntrances = {
    getAdjustment: getVoiceEmotionEntranceAdjustment,
    applyToEntrance: applyVoiceAdjustmentToEntrance,
    shouldOverrideMood: shouldVoiceOverrideMood,
};
export default voiceEmotionEntrances;
//# sourceMappingURL=voice-emotion-entrances.js.map