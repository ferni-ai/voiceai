/**
 * Emotional Memory Evolution (Persona Bonding)
 *
 * > "Your best friend forgets how conversations felt. We don't."
 *
 * This system tracks how the PERSONA FEELS about this specific user over time.
 * Unlike human memory that fades and distorts, we maintain a growing emotional
 * bond that deepens authentically.
 *
 * Key capabilities:
 * - Track warmth, trust, protectiveness, admiration
 * - Store memorable emotional moments
 * - Generate bond-aware responses
 * - Surface emotional history appropriately
 *
 * @module @ferni/superhuman/emotional-memory
 *
 * @deprecated For new code, prefer using the unified interface:
 * ```typescript
 * import { getUnifiedEmotionalMemory } from '../../memory/emotional-memory-unified.js';
 * const memory = getUnifiedEmotionalMemory({ userId, personaId });
 * ```
 *
 * The unified interface coordinates this PERSONA bonding system with the
 * USER emotion tracking (intelligence/emotional-memory.ts).
 */
import type { EmotionalBond, RelationshipStage } from './types.js';
declare const BOND_MODIFIERS: {
    readonly vulnerability_shared: {
        readonly warmth: 0.08;
        readonly trust: 0.1;
        readonly protectiveness: 0.12;
    };
    readonly breakthrough_moment: {
        readonly warmth: 0.1;
        readonly admiration: 0.15;
    };
    readonly laughter_shared: {
        readonly warmth: 0.06;
        readonly trust: 0.03;
    };
    readonly struggle_shared: {
        readonly protectiveness: 0.1;
        readonly concern: 0.08;
        readonly warmth: 0.05;
    };
    readonly growth_shown: {
        readonly admiration: 0.12;
        readonly warmth: 0.08;
    };
    readonly trust_demonstrated: {
        readonly trust: 0.1;
        readonly warmth: 0.05;
    };
    readonly gratitude_expressed: {
        readonly warmth: 0.08;
    };
    readonly session_completed: {
        readonly warmth: 0.02;
        readonly trust: 0.01;
    };
    readonly deep_conversation: {
        readonly warmth: 0.06;
        readonly trust: 0.05;
    };
};
type BondEventType = keyof typeof BOND_MODIFIERS;
export declare class EmotionalMemoryEngine {
    private bond;
    private userId;
    private personaId;
    private lastPhraseType;
    private phrasesUsedThisSession;
    constructor(userId: string, existingBond?: EmotionalBond, personaId?: string);
    /**
     * Set the persona ID for content loading
     */
    setPersonaId(personaId: string): void;
    /**
     * Record a bond-affecting event
     */
    recordEvent(event: BondEventType, context?: {
        topic?: string;
        description?: string;
        intensity?: number;
    }): void;
    /**
     * Record that a session was completed
     */
    recordSessionEnd(): void;
    /**
     * Update concern level based on detected state
     */
    updateConcern(concernLevel: number): void;
    private recordEmotionalSnapshot;
    private recordRelationshipPeak;
    /**
     * Get a bond-appropriate phrase to inject into response
     * Returns null if no phrase is appropriate right now
     */
    getBondPhrase(context: {
        turnCount: number;
        topic?: string;
        wasVulnerable?: boolean;
        showedGrowth?: boolean;
    }): {
        phrase: string;
        type: string;
    } | null;
    /**
     * Get relationship-stage appropriate greeting modifier
     */
    getGreetingModifier(): string | null;
    /**
     * Get a memory callback phrase referencing past emotional moments
     */
    getEmotionalMemoryCallback(currentTopic?: string): string | null;
    /**
     * Get current relationship stage based on bond metrics
     */
    getRelationshipStage(): RelationshipStage;
    /**
     * Get current bond state
     */
    getBond(): EmotionalBond;
    /**
     * Get bond metrics for response guidance
     */
    getBondMetrics(): {
        warmth: number;
        trust: number;
        protectiveness: number;
        admiration: number;
        concern: number;
        stage: RelationshipStage;
    };
    /**
     * Export bond for persistence
     */
    export(): EmotionalBond;
    /**
     * Import bond from persistence
     */
    import(bond: EmotionalBond): void;
    /**
     * Reset for new user
     */
    reset(): void;
    private isSignificantEvent;
    private isPeakEvent;
    private eventToEmotion;
    private eventToPeakType;
    private getEligiblePhraseTypes;
    private selectPhraseType;
    private selectUnusedPhrase;
}
/**
 * Get or create an emotional memory engine for a user
 */
export declare function getEmotionalMemory(userId: string, existingBond?: EmotionalBond): EmotionalMemoryEngine;
/**
 * Clear emotional memory for a user
 */
export declare function clearEmotionalMemory(userId: string): void;
export default EmotionalMemoryEngine;
//# sourceMappingURL=emotional-memory.d.ts.map