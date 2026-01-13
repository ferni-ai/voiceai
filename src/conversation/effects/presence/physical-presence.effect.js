/**
 * Physical Presence Effect
 *
 * Generates cues that make the agent feel physically present.
 * These are the small gestures and body language that humans do naturally.
 *
 * @module @ferni/conversation/effects/presence/physical-presence
 */
import { getPersonaTuning } from '../../humanization-tuning.js';
// ============================================================================
// PHYSICAL PRESENCE LIBRARIES
// ============================================================================
const PRESENCE_CUES = {
    attentive: ['*leans in*', '*looks at you*', '*meets your eyes*', '*turns toward you*'],
    thoughtful: ['*tilts head*', '*pauses to think*', '*considers*', '*reflects*'],
    warm: ['*smiles warmly*', '*nods encouragingly*', '*softens*', '*gentle look*'],
    supportive: ['*reaches out*', '*sits closer*', '*steadies*', '*present*'],
    energetic: ['*sits up*', '*brightens*', '*animates*', '*lights up*'],
    settling: ['*settles back*', '*relaxes*', '*exhales*', '*grounds*'],
};
// ============================================================================
// EFFECT IMPLEMENTATION
// ============================================================================
/**
 * Create physical presence effect for a persona
 */
export function createPhysicalPresenceEffect(personaId) {
    const tuning = getPersonaTuning(personaId);
    const config = tuning.presence.physicalPresence;
    return {
        id: 'physical_presence',
        name: 'Physical Presence',
        capability: 'presence',
        placement: 'prefix',
        config: {
            probability: config.probability,
            cooldownTurns: config.cooldownTurns,
            maxPerSession: config.maxPerSession,
        },
        isApplicable(context) {
            // Apply in emotional moments, breakthrough moments, or periodically
            return (context.mood.inEmotionalMoment ||
                context.signals.isBreakthrough ||
                context.signals.userSharedVulnerability ||
                context.turnNumber % 5 === 0);
        },
        generate(context) {
            const { mood, signals, turnNumber } = context;
            // Choose presence type based on context
            let type;
            if (signals.userSharedVulnerability || mood.inEmotionalMoment) {
                type = 'supportive';
            }
            else if (signals.isBreakthrough || signals.userTriggeredSurprise) {
                type = 'energetic';
            }
            else if (mood.engagement > 0.8) {
                type = 'attentive';
            }
            else if (turnNumber > 15 || mood.energy < 0.5) {
                type = 'settling';
            }
            else if (mood.energy > 0.7) {
                type = 'warm';
            }
            else {
                type = 'thoughtful';
            }
            const cues = PRESENCE_CUES[type];
            // Deterministic selection
            const seed = `${context.sessionId}:${turnNumber}:presence`;
            const index = simpleHash(seed) % cues.length;
            const content = cues[index];
            return {
                content,
                ssml: content,
                metadata: { presenceType: type },
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
//# sourceMappingURL=physical-presence.effect.js.map