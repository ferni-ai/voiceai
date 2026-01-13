/**
 * Humanization Generators Index
 *
 * Registry of all available humanization generators.
 * Each generator creates a specific type of humanization effect.
 *
 * @module @ferni/conversation/deep-humanization/generators
 */
export { generateMoodSignal } from './mood-signal.js';
export { generateSpontaneousThought } from './spontaneous-thought.js';
export { generatePhysicalPresence } from './physical-presence.js';
export { generateBreathSound } from './breath-sound.js';
export { generateExcitementInterruption } from './excitement-interruption.js';
export { generateLiveReaction } from './live-reaction.js';
export { generatePlayfulness } from './playfulness.js';
export { generateFirstTurnNotice } from './first-turn-notice.js';
import type { HumanizationContext, ConversationMood, HumanizationSignals, GeneratorResult, HumanizationType } from '../types.js';
/**
 * Generator registry entry
 */
export interface GeneratorEntry {
    type: HumanizationType;
    generate: (context: HumanizationContext, mood: ConversationMood, signals: HumanizationSignals) => Promise<GeneratorResult>;
    config: {
        cooldownTurns: number;
        maxPerSession: number;
        baseProbability: number;
    };
}
/**
 * Check if a generator can fire (respects cooldown and max per session)
 */
export declare function canFire(type: HumanizationType, turnCount: number): boolean;
/**
 * Record that a generator fired
 */
export declare function recordFired(type: HumanizationType, turnCount: number): void;
/**
 * Reset all generator state for a new session
 */
export declare function resetGenerators(): void;
/**
 * Get statistics about generator usage
 */
export declare function getGeneratorStats(): {
    cooldowns: Record<string, number>;
    counts: Record<string, number>;
};
//# sourceMappingURL=index.d.ts.map