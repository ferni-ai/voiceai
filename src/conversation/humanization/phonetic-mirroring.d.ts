/**
 * Phonetic Style Mirroring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Beyond vocabulary, mirror pronunciation patterns and casual speech forms.
 * When users say "gonna", agent says "gonna". When users say "going to",
 * agent says "going to". This creates subconscious rapport.
 *
 * **What we mirror:**
 * - Contractions vs. full forms (gonna/going to)
 * - Regional markers (y'all, you guys, folks)
 * - Filler preferences (um, uh, like)
 * - Tag questions (right?, you know?)
 *
 * @module @ferni/humanization/phonetic-mirroring
 */
export interface PhoneticProfile {
    /** Contraction style detected */
    contractionStyle: 'full' | 'contracted' | 'reduced' | 'mixed';
    /** Uses casual reductions (gonna, wanna) */
    usesReductions: boolean;
    /** Specific reductions detected */
    detectedReductions: string[];
    /** Regional markers detected */
    regionalMarkers: string[];
    /** Preferred filler sounds */
    fillerPreference: 'um' | 'uh' | 'like' | 'you know' | 'none';
    /** Uses tag questions */
    usesTagQuestions: boolean;
    /** Tag question style */
    tagQuestionStyle: string[];
    /** Sample count for confidence */
    sampleCount: number;
    /** Confidence in profile (0-1) */
    confidence: number;
}
export interface PhoneticMirroringConfig {
    /** Minimum samples before mirroring */
    minSamples: number;
    /** How aggressively to mirror (0-1) */
    mirroringStrength: number;
    /** Enable reduction mirroring */
    mirrorReductions: boolean;
    /** Enable regional marker mirroring */
    mirrorRegional: boolean;
    /** Enable tag question mirroring */
    mirrorTagQuestions: boolean;
}
export declare class PhoneticMirroringEngine {
    private profile;
    private config;
    private messageHistory;
    constructor(config?: Partial<PhoneticMirroringConfig>);
    /**
     * Analyze a user message and update profile
     */
    analyzeMessage(message: string): void;
    /**
     * Get current phonetic profile
     */
    getProfile(): PhoneticProfile;
    /**
     * Apply phonetic mirroring to response
     */
    mirror(response: string): {
        text: string;
        appliedMirrorings: string[];
    };
    /**
     * Check if user uses a specific reduction
     */
    usesReduction(reduction: string): boolean;
    /**
     * Get user's filler preference
     */
    getFillerPreference(): string | null;
    /**
     * Reset engine
     */
    reset(): void;
    private createInitialProfile;
    private rebuildProfile;
}
export declare function getPhoneticMirroringEngine(sessionId: string): PhoneticMirroringEngine;
export declare function resetPhoneticMirroringEngine(sessionId: string): void;
export declare function resetAllPhoneticMirroringEngines(): void;
export default PhoneticMirroringEngine;
//# sourceMappingURL=phonetic-mirroring.d.ts.map