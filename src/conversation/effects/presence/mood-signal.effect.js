/**
 * Mood Signal Effect
 *
 * Generates subtle mood indicators that show the agent's emotional state.
 * These are small cues that make the agent feel ALIVE, not robotic.
 *
 * @module @ferni/conversation/effects/presence/mood-signal
 */
import { getPersonaTuning } from '../../humanization-tuning.js';
// ============================================================================
// MOOD SIGNAL LIBRARIES
// ============================================================================
const ENERGY_SIGNALS = {
    high: ['I love this!', 'This is so great!', 'Okay, okay—', 'Oh, I have thoughts!'],
    medium: ['That makes sense.', 'Hmm, interesting...', 'I hear you.', 'Yeah.'],
    low: ['*settles in*', '*takes a breath*', '*nods slowly*', 'I hear you.'],
    subdued: ['*quietly*', '*softly*', '*gently*', '...'],
};
const ENGAGEMENT_SIGNALS = {
    high: ['*leans forward*', '*eyes light up*', '*smiles*'],
    medium: ['*nods*', '*listening*', '*mm-hmm*'],
    low: ['*thoughtfully*', '*pauses*', '*considers*'],
};
const LATE_SESSION_SIGNALS = [
    'We have been going for a bit, huh?',
    'This has been a lot to cover.',
    'Wow, we have dug deep today.',
];
// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================
/**
 * Create mood signal effect for a persona
 */
export function createMoodSignalEffect(personaId) {
    const tuning = getPersonaTuning(personaId);
    const config = tuning.presence.moodSignal;
    return {
        id: 'mood_signal',
        name: 'Mood Signal',
        capability: 'presence',
        placement: 'prefix',
        config: {
            probability: config.probability,
            cooldownTurns: config.cooldownTurns,
            maxPerSession: config.maxPerSession,
        },
        isApplicable(context) {
            // Always applicable - mood signals can happen anytime
            // But vary by context in generate()
            return context.turnNumber >= 2;
        },
        generate(context) {
            const { mood, turnNumber } = context;
            // Pick signal based on current mood
            let signals;
            // Late session awareness
            if (turnNumber > 20 && mood.energy < 0.5) {
                signals = LATE_SESSION_SIGNALS;
            }
            else {
                // Energy-based signals
                const energyKey = mood.energy > 0.75
                    ? 'high'
                    : mood.energy > 0.5
                        ? 'medium'
                        : mood.energy > 0.35
                            ? 'low'
                            : 'subdued';
                signals = ENERGY_SIGNALS[energyKey];
            }
            // Sometimes add engagement signal
            if (mood.engagement > 0.7) {
                const engagementKey = mood.engagement > 0.8 ? 'high' : 'medium';
                signals = [...signals, ...ENGAGEMENT_SIGNALS[engagementKey]];
            }
            // Deterministic selection
            const seed = `${context.sessionId}:${turnNumber}:mood`;
            const index = simpleHash(seed) % signals.length;
            const content = signals[index];
            return {
                content,
                ssml: content,
                metadata: { energyLevel: mood.energy, engagement: mood.engagement },
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
//# sourceMappingURL=mood-signal.effect.js.map