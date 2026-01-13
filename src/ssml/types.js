/**
 * SSML Types - Single Source of Truth
 *
 * Type definitions for the SSML module.
 * This is the CANONICAL source for all SSML-related types.
 *
 * Other modules should import types from here:
 * ```typescript
 * import type { PronunciationEntry, CartesiaEmotion } from '../ssml/types.js';
 * ```
 *
 * @module ssml/types
 */
// =============================================================================
// CARTESIA EMOTION TYPES
// Full list of Cartesia Sonic-3 supported emotions
// @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
// =============================================================================
/**
 * All 60+ emotions supported by Cartesia Sonic-3 TTS
 * Use these values in <emotion value="..."/> tags
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 *
 * Primary emotions (best results): neutral, angry, excited, content, sad, scared
 */
export const CARTESIA_EMOTIONS = {
    // ==========================================================================
    // PRIMARY EMOTIONS (Most reliable, best training data)
    // ==========================================================================
    NEUTRAL: 'neutral',
    ANGRY: 'angry',
    EXCITED: 'excited',
    CONTENT: 'content',
    SAD: 'sad',
    SCARED: 'scared',
    // ==========================================================================
    // POSITIVE EMOTIONS - Joy & Enthusiasm
    // ==========================================================================
    HAPPY: 'happy',
    ENTHUSIASTIC: 'enthusiastic',
    ELATED: 'elated',
    EUPHORIC: 'euphoric',
    TRIUMPHANT: 'triumphant',
    AMAZED: 'amazed',
    SURPRISED: 'surprised',
    FLIRTATIOUS: 'flirtatious',
    JOKING: 'joking', // Also: 'comedic'
    CURIOUS: 'curious',
    PEACEFUL: 'peaceful',
    SERENE: 'serene',
    CALM: 'calm',
    GRATEFUL: 'grateful',
    AFFECTIONATE: 'affectionate',
    TRUST: 'trust',
    SYMPATHETIC: 'sympathetic',
    ANTICIPATION: 'anticipation',
    MYSTERIOUS: 'mysterious',
    // ==========================================================================
    // NEGATIVE EMOTIONS - Anger Spectrum
    // ==========================================================================
    MAD: 'mad',
    OUTRAGED: 'outraged',
    FRUSTRATED: 'frustrated',
    AGITATED: 'agitated',
    THREATENED: 'threatened',
    DISGUSTED: 'disgusted',
    CONTEMPT: 'contempt',
    ENVIOUS: 'envious',
    SARCASTIC: 'sarcastic',
    IRONIC: 'ironic',
    // ==========================================================================
    // NEGATIVE EMOTIONS - Sadness Spectrum
    // ==========================================================================
    DEJECTED: 'dejected',
    MELANCHOLIC: 'melancholic',
    DISAPPOINTED: 'disappointed',
    HURT: 'hurt',
    GUILTY: 'guilty',
    BORED: 'bored',
    TIRED: 'tired',
    REJECTED: 'rejected',
    NOSTALGIC: 'nostalgic',
    WISTFUL: 'wistful',
    APOLOGETIC: 'apologetic',
    HESITANT: 'hesitant',
    INSECURE: 'insecure',
    CONFUSED: 'confused',
    RESIGNED: 'resigned',
    // ==========================================================================
    // FEAR & ANXIETY SPECTRUM
    // ==========================================================================
    ANXIOUS: 'anxious',
    PANICKED: 'panicked',
    ALARMED: 'alarmed',
    // ==========================================================================
    // CONFIDENT & ASSERTIVE
    // ==========================================================================
    PROUD: 'proud',
    CONFIDENT: 'confident',
    DISTANT: 'distant',
    SKEPTICAL: 'skeptical',
    CONTEMPLATIVE: 'contemplative',
    DETERMINED: 'determined',
    // ==========================================================================
    // LEGACY ALIASES (for backwards compatibility)
    // ==========================================================================
    WARM: 'affectionate', // Alias → affectionate
    CARING: 'sympathetic', // Alias → sympathetic
    THOUGHTFUL: 'contemplative', // Alias → contemplative
};
/**
 * Array of all Cartesia emotion values for validation
 */
export const ALL_CARTESIA_EMOTIONS = Object.values(CARTESIA_EMOTIONS);
/**
 * Emotions that are directly supported by Cartesia's emotion tag
 * (subset that definitely work in <emotion value="..."/>)
 */
export const CARTESIA_SUPPORTED_EMOTIONS = [
    CARTESIA_EMOTIONS.ANGRY,
    CARTESIA_EMOTIONS.SAD,
    CARTESIA_EMOTIONS.SURPRISED,
    CARTESIA_EMOTIONS.CURIOUS,
    CARTESIA_EMOTIONS.AFFECTIONATE,
];
/**
 * Check if an emotion value is directly supported in Cartesia's emotion tag
 */
export function isCartesiaSupportedEmotion(emotion) {
    return CARTESIA_SUPPORTED_EMOTIONS.includes(emotion);
}
//# sourceMappingURL=types.js.map