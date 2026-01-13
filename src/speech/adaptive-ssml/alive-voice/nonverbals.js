/**
 * Future-Proof Nonverbal System
 *
 * Configuration for nonverbal sounds (laughter, sigh, etc.).
 * When Cartesia adds support for new sounds, just flip the 'supported' flag!
 *
 * @module speech/adaptive-ssml/alive-voice/nonverbals
 */
// =============================================================================
// NONVERBAL CONFIGURATION
// =============================================================================
/**
 * Nonverbal sound configuration.
 * When Cartesia adds support, just flip the 'supported' flag!
 */
export const NONVERBAL_CONFIG = {
    laughter: {
        supported: true,
        bracket: '[laughter]',
        fallback: 'haha',
        contexts: ['humor', 'joy', 'playful'],
    },
    sigh: {
        supported: false, // Flip to true when Cartesia adds support!
        bracket: '[sigh]',
        fallback: '', // Hmm or empty - sighs are hard to synthesize naturally
        contexts: ['empathy', 'heavy', 'relief'],
    },
    thinking: {
        supported: false,
        bracket: '[hmm]',
        fallback: 'Hmm...',
        contexts: ['contemplation', 'question', 'uncertainty'],
    },
    gasp: {
        supported: false,
        bracket: '[gasp]',
        fallback: 'Oh!',
        contexts: ['surprise', 'shock', 'realization'],
    },
    cough: {
        supported: false,
        bracket: '[cough]',
        fallback: '',
        contexts: ['clearing throat', 'pause'],
    },
};
// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
/**
 * Get the appropriate representation for a nonverbal sound.
 * Returns bracket notation if supported, fallback text otherwise.
 */
export function getNonverbal(type) {
    const config = NONVERBAL_CONFIG[type];
    return config.supported ? config.bracket : config.fallback;
}
/**
 * Check if a nonverbal is supported by Cartesia.
 */
export function isNonverbalSupported(type) {
    return NONVERBAL_CONFIG[type].supported;
}
//# sourceMappingURL=nonverbals.js.map