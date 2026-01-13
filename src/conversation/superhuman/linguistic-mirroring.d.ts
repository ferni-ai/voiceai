/**
 * Linguistic Mirroring
 *
 * > "They just... get me."
 *
 * Subconsciously matches user's vocabulary, energy, and communication style.
 * Unlike humans who mirror awkwardly or inconsistently, we do it perfectly
 * and imperceptibly.
 *
 * Key capabilities:
 * - Vocabulary matching (their words, not ours)
 * - Energy/verbosity matching
 * - Metaphor domain adoption
 * - Formality calibration
 *
 * @module @ferni/superhuman/linguistic-mirroring
 */
import type { LinguisticProfile, MirroringResult } from './types.js';
export declare class LinguisticMirroringEngine {
    private profile;
    private userId;
    private messageSamples;
    constructor(userId: string, existingProfile?: Partial<LinguisticProfile>);
    /**
     * Analyze a user message to learn their linguistic patterns
     */
    analyzeMessage(message: string): void;
    /**
     * Apply linguistic mirroring to a response
     */
    applyMirroring(response: string): MirroringResult;
    /**
     * Get energy-appropriate response length guidance
     */
    getResponseLengthGuidance(): {
        min: number;
        max: number;
        target: number;
    };
    /**
     * Check if response energy matches user
     */
    checkEnergyMatch(response: string, userMessage: string): {
        matches: boolean;
        suggestion?: string;
    };
    private learnVocabulary;
    private learnVerbosity;
    private learnMetaphorDomains;
    private learnComfortFillers;
    private learnFormality;
    private learnContractions;
    private learnSentenceComplexity;
    private applyVocabularyMirroring;
    private applyContractionMirroring;
    private applyFormalityMirroring;
    private addComfortFillers;
    /**
     * Get current linguistic profile
     */
    getProfile(): LinguisticProfile;
    /**
     * Get preferred term for a standard term
     */
    getPreferredTerm(standard: string): string;
    /**
     * Export for persistence
     */
    export(): Omit<LinguisticProfile, 'preferredTerms'> & {
        preferredTerms: [string, string][];
    };
    /**
     * Import from persistence
     */
    import(data: Omit<LinguisticProfile, 'preferredTerms'> & {
        preferredTerms: [string, string][];
    }): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getLinguisticMirroring(userId: string, existingProfile?: Partial<LinguisticProfile>): LinguisticMirroringEngine;
export declare function clearLinguisticMirroring(userId: string): void;
export default LinguisticMirroringEngine;
//# sourceMappingURL=linguistic-mirroring.d.ts.map