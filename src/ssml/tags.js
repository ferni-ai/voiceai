/**
 * SSML Tag Helpers
 *
 * Helper functions for generating valid Cartesia Sonic-3 SSML tags.
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 *
 * @module ssml/tags
 */
import { EMOTION_KEYWORDS } from './constants.js';
import { CARTESIA_EMOTIONS, CARTESIA_SUPPORTED_EMOTIONS } from './types.js';
// =============================================================================
// VALUE CLAMPING
// =============================================================================
/**
 * Clamp speed to Cartesia's valid range (0.6 - 1.5)
 */
export function clampSpeed(speed) {
    return Math.max(0.6, Math.min(1.5, speed));
}
/**
 * Clamp volume to Cartesia's valid range (0.5 - 2.0)
 */
export function clampVolume(volume) {
    return Math.max(0.5, Math.min(2.0, volume));
}
// =============================================================================
// TAG GENERATION
// =============================================================================
/**
 * Generate SSML speed tag with clamped value
 * @param ratio - Speed ratio (will be clamped to 0.6-1.5)
 */
export function speedTag(ratio) {
    const clamped = clampSpeed(ratio);
    return `<speed ratio="${clamped.toFixed(2)}"/>`;
}
/**
 * Generate SSML volume tag with clamped value
 * @param ratio - Volume ratio (will be clamped to 0.5-2.0)
 */
export function volumeTag(ratio) {
    const clamped = clampVolume(ratio);
    return `<volume ratio="${clamped.toFixed(1)}"/>`;
}
/**
 * Generate SSML break tag
 * @param time - Time in ms or s (e.g., "500ms", "1s", "1.5s")
 */
export function breakTag(time) {
    // Validate time format (e.g., "500ms", "1s", "1.5s")
    if (!/^\d+(\.\d+)?(ms|s)$/.test(time)) {
        return `<break time="500ms"/>`;
    }
    return `<break time="${time}"/>`;
}
/**
 * Generate SSML emotion tag (only for Cartesia-supported emotions)
 * Returns empty string if emotion is not directly supported
 * @param emotion - Emotion value
 */
export function emotionTag(emotion) {
    if (CARTESIA_SUPPORTED_EMOTIONS.includes(emotion)) {
        return `<emotion value="${emotion}"/>`;
    }
    return '';
}
/**
 * Generate SSML spell tag for letter-by-letter pronunciation
 * @param text - Text to spell out (typically acronyms)
 */
export function spellTag(text) {
    // Only wrap if it looks like something to spell out
    if (/^[A-Z0-9]{2,10}$/.test(text)) {
        return `<spell>${text}</spell>`;
    }
    return text;
}
// =============================================================================
// EMOTION MAPPING
// =============================================================================
/**
 * Map detected emotions to Cartesia-supported emotions
 * Falls back to 'neutral' for unsupported emotions
 */
export function mapToCartesiaEmotion(detected) {
    const mapping = {
        // Direct mappings
        angry: CARTESIA_EMOTIONS.ANGRY,
        sad: CARTESIA_EMOTIONS.SAD,
        surprised: CARTESIA_EMOTIONS.SURPRISED,
        curious: CARTESIA_EMOTIONS.CURIOUS,
        affectionate: CARTESIA_EMOTIONS.AFFECTIONATE,
        // Extended mappings (to supported emotions)
        frustrated: CARTESIA_EMOTIONS.ANGRY,
        disappointed: CARTESIA_EMOTIONS.SAD,
        shocked: CARTESIA_EMOTIONS.SURPRISED,
        interested: CARTESIA_EMOTIONS.CURIOUS,
        loving: CARTESIA_EMOTIONS.AFFECTIONATE,
        caring: CARTESIA_EMOTIONS.AFFECTIONATE,
        warm: CARTESIA_EMOTIONS.AFFECTIONATE,
        excited: CARTESIA_EMOTIONS.SURPRISED,
        enthusiastic: CARTESIA_EMOTIONS.SURPRISED,
        worried: CARTESIA_EMOTIONS.SAD,
        anxious: CARTESIA_EMOTIONS.SAD,
        happy: CARTESIA_EMOTIONS.AFFECTIONATE,
        joyful: CARTESIA_EMOTIONS.AFFECTIONATE,
        grateful: CARTESIA_EMOTIONS.AFFECTIONATE,
        // Neutral states (no emotion tag needed)
        neutral: CARTESIA_EMOTIONS.NEUTRAL,
        calm: CARTESIA_EMOTIONS.CALM,
        thoughtful: CARTESIA_EMOTIONS.THOUGHTFUL,
        confident: CARTESIA_EMOTIONS.CONFIDENT,
    };
    return mapping[detected.toLowerCase()] || CARTESIA_EMOTIONS.NEUTRAL;
}
/**
 * Get contextual emotion based on text content and base emotion
 * Analyzes text for emotional cues and returns appropriate Cartesia emotion
 */
export function getContextualEmotion(text, baseEmotion) {
    const lowerText = text.toLowerCase();
    // Check for emotional context clues (longer phrases first)
    if (/\b(unfortunately|sadly|regret|sorry to|i'm afraid)\b/i.test(lowerText)) {
        return CARTESIA_EMOTIONS.SAD;
    }
    if (/\b(great news|wonderful|fantastic|exciting|thrilled)\b/i.test(lowerText)) {
        return CARTESIA_EMOTIONS.SURPRISED;
    }
    if (/\b(hmm|interesting|tell me more|i wonder|what if)\b/i.test(lowerText)) {
        return CARTESIA_EMOTIONS.CURIOUS;
    }
    if (/\b(i understand|i hear you|that's tough|i'm here|you're not alone)\b/i.test(lowerText)) {
        return CARTESIA_EMOTIONS.AFFECTIONATE;
    }
    if (/\b(annoying|frustrating|ridiculous|unacceptable)\b/i.test(lowerText)) {
        return CARTESIA_EMOTIONS.ANGRY;
    }
    // Fall back to mapped base emotion
    return mapToCartesiaEmotion(baseEmotion);
}
/**
 * Detect emotion from text using keyword analysis
 * Returns the dominant emotion found in the text
 */
export function detectEmotionFromKeywords(text) {
    const lowerText = text.toLowerCase();
    const emotionCounts = {};
    // Count emotion keyword matches
    for (const [keyword, emotion] of Object.entries(EMOTION_KEYWORDS)) {
        if (lowerText.includes(keyword)) {
            emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        }
    }
    // Find dominant emotion
    let maxCount = 0;
    let dominantEmotion = 'neutral';
    for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion;
        }
    }
    return mapToCartesiaEmotion(dominantEmotion);
}
//# sourceMappingURL=tags.js.map