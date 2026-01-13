/**
 * Breath Sound Effect
 *
 * Adds subtle breathing sounds, sighs, and micro-sounds that make
 * the agent feel physically present and alive.
 *
 * @module @ferni/conversation/effects/presence/breath-sound
 */
import { getPersonaTuning } from '../../humanization-tuning.js';
// ============================================================================
// BREATH SOUND LIBRARIES
// ============================================================================
const BREATH_SOUNDS = {
    /** Processing heavy emotional content */
    processingHeavy: ['*deep breath*', '*exhales slowly*', '*takes a breath*', '*sighs softly*'],
    /** Recognition/acknowledgment */
    recognition: ['*mmm*', '*ah*', '*mm-hmm*'],
    /** Content acknowledgment */
    contentAcknowledgment: ['*nods*', '*hmm*', '*ah*'],
    /** Amused/engaged */
    amused: ['*soft chuckle*', '*hmm*', '*light laugh*'],
};
// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================
/**
 * Create breath sound effect for a persona
 */
export function createBreathSoundEffect(personaId) {
    const tuning = getPersonaTuning(personaId);
    const config = tuning.presence.breathSound;
    return {
        id: 'breath_sound',
        name: 'Breath Sound',
        capability: 'presence',
        placement: 'prefix',
        config: {
            probability: config.probability,
            cooldownTurns: config.cooldownTurns,
            maxPerSession: config.maxPerSession,
        },
        isApplicable(context) {
            // Apply in emotional moments or at regular intervals
            return (context.mood.inEmotionalMoment ||
                context.mood.engagement > 0.8 ||
                context.turnNumber % 4 === 0);
        },
        generate(context) {
            let phrases;
            if (context.mood.inEmotionalMoment) {
                phrases = BREATH_SOUNDS.processingHeavy;
            }
            else if (context.mood.engagement > 0.8) {
                phrases = [...BREATH_SOUNDS.amused, ...BREATH_SOUNDS.recognition];
            }
            else {
                phrases = BREATH_SOUNDS.contentAcknowledgment;
            }
            // Deterministic selection based on context
            const seed = `${context.sessionId}:${context.turnNumber}:breath`;
            const index = simpleHash(seed) % phrases.length;
            const phrase = phrases[index];
            return {
                content: phrase,
                ssml: `<break time="100ms"/>${phrase}<break time="100ms"/>`,
                metadata: { category: context.mood.inEmotionalMoment ? 'heavy' : 'light' },
            };
        },
    };
}
// ============================================================================
// UTILITY
// ============================================================================
function simpleHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
}
//# sourceMappingURL=breath-sound.effect.js.map