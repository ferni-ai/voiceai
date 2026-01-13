/**
 * Speech Naturalizer Engine
 *
 * Makes AI speech sound more human through strategic imperfections.
 *
 * @module @ferni/conversation/speech-naturalizer/engine
 */
import type { DisfluencyConfig, NaturalizationContext, RandomOptions, ThinkingPattern } from './types.js';
export declare class SpeechNaturalizer {
    private config;
    private recentDisfluencies;
    private lastRepairTurn;
    constructor(config?: Partial<DisfluencyConfig>);
    /**
     * Add natural disfluencies to a response
     */
    naturalize(text: string, personaId: string, context?: NaturalizationContext): string;
    /**
     * Generate a self-correction/repair
     */
    generateRepair(originalStatement: string, correctedStatement: string, personaId: string, options?: RandomOptions): string;
    /**
     * Get a thinking-out-loud phrase
     *
     * Uses ThinkingPhraseCoordinator to prevent duplicate phrases.
     */
    getThinkingPhrase(personaId: string, type?: ThinkingPattern['type'], options?: RandomOptions): ThinkingPattern;
    /**
     * Generate a hedge appropriate to the statement
     */
    getHedge(personaId: string, strength?: 'soft' | 'medium' | 'strong', options?: RandomOptions): string;
    /**
     * Wrap text with uncertainty markers
     */
    addUncertainty(text: string, personaId: string, level: 'low' | 'medium' | 'high', options?: RandomOptions): string;
    /**
     * Reset tracking
     */
    reset(): void;
    private addOpeningFiller;
    private addHedge;
    private addThinkingPhrase;
}
export default SpeechNaturalizer;
//# sourceMappingURL=engine.d.ts.map