/**
 * Active Listening Module
 *
 * Implements sophisticated active listening behaviors:
 * - Rich, context-aware backchanneling
 * - Vocabulary mirroring
 * - Emotional echoing
 * - Clarifying questions
 * - Comfortable silence handling
 *
 * @module conversation/active-listening
 */
import type { Backchannel, BackchannelContext, ClarifyingQuestion, MirroredPhrase, SilenceBackchannelContext } from './types.js';
export type { Backchannel, BackchannelContext, ClarifyingQuestion, MirroredPhrase, SilenceBackchannelContext, SilenceEvaluation, } from './types.js';
export declare class ActiveListeningEngine {
    private recentBackchannels;
    private lastBackchannelTime;
    private extractedUserVocabulary;
    private userBackchannelPreference;
    private totalBackchannels;
    private positiveReactions;
    constructor();
    /**
     * Record user reaction to backchannel for frequency tuning
     */
    recordBackchannelReaction(wasPositive: boolean): void;
    /**
     * Get recommended wait time before next backchannel
     */
    getBackchannelCooldownMs(): number;
    /**
     * Get an appropriate backchannel for the context
     */
    getBackchannel(personaId: string, context: BackchannelContext): Backchannel | null;
    /**
     * Get a backchannel asynchronously with fresh LLM generation
     */
    getBackchannelAsync(personaId: string, context: BackchannelContext): Promise<Backchannel | null>;
    /**
     * Generate a mirrored phrase that echoes the user's vocabulary
     */
    mirrorUserVocabulary(userText: string, responseText: string): MirroredPhrase | null;
    /**
     * Generate an emotional echo phrase
     */
    generateEmotionalEcho(userEmotion: string, userText: string, intensity?: 'low' | 'medium' | 'high'): string;
    /**
     * Generate a clarifying question
     */
    generateClarifyingQuestion(type: ClarifyingQuestion['type'], context?: {
        topic?: string;
        previousStatement?: string;
    }): ClarifyingQuestion;
    /**
     * Evaluate if silence is comfortable in this context
     */
    evaluateSilence(silenceDurationMs: number, context: {
        userJustSharedPersonal?: boolean;
        userIsThinking?: boolean;
        emotionalIntensity?: 'high' | 'medium' | 'low';
    }): import("./types.js").SilenceEvaluation;
    /**
     * Get a gentle prompt for re-engaging after silence
     */
    getGentlePrompt(context?: {
        lastTopic?: string;
        userEmotion?: string;
    }): string;
    /**
     * Get a silence-aware backchannel
     */
    getSilenceBackchannel(personaId: string, context: SilenceBackchannelContext): Backchannel | null;
    /**
     * Reset the engine state
     */
    reset(): void;
    private buildSeedBase;
    private selectBackchannelType;
    private recordBackchannel;
}
export declare function getActiveListeningEngine(): ActiveListeningEngine;
export declare function resetActiveListeningEngine(): void;
export default ActiveListeningEngine;
//# sourceMappingURL=index.d.ts.map