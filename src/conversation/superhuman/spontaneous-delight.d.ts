/**
 * Spontaneous Delight & Visible Vulnerability
 *
 * > "I genuinely look forward to our conversations."
 *
 * Two complementary systems:
 * 1. Spontaneous Delight - Random authentic appreciation
 * 2. Visible Vulnerability - Showing authentic uncertainty
 *
 * Together they create a persona that feels genuinely human
 * while being better than human in consistency.
 *
 * @module @ferni/superhuman/spontaneous-delight
 */
import type { DelightContext, DelightResult, RelationshipStage, VulnerabilityContext, VulnerabilityResult } from './types.js';
declare const PROTECTIVE_PHRASES: {
    harsh_judgment: string[];
    catastrophizing: string[];
    minimizing_success: string[];
    comparing_to_others: string[];
    perfectionism: string[];
    imposter_syndrome: string[];
};
export declare class SpontaneousDelightEngine {
    private userId;
    private personaId;
    private delightHistory;
    private lastDelightTurn;
    constructor(userId: string, personaId?: string);
    setPersonaId(personaId: string): void;
    /**
     * Check if we should emit spontaneous delight
     */
    checkForDelight(context: DelightContext): DelightResult;
    private selectDelightType;
    private getProbability;
    private selectPhrase;
    /**
     * Reset for new session
     */
    reset(): void;
}
export declare class VisibleVulnerabilityEngine {
    private userId;
    private personaId;
    private lastVulnerabilityTurn;
    constructor(userId: string, personaId?: string);
    setPersonaId(personaId: string): void;
    /**
     * Check if we should express vulnerability
     */
    checkForVulnerability(context: VulnerabilityContext, turnCount: number): VulnerabilityResult;
    private determineVulnerabilityType;
    private getProbability;
    /**
     * Reset
     */
    reset(): void;
}
export declare class ProtectiveInstinctsEngine {
    private userId;
    private personaId;
    constructor(userId: string, personaId?: string);
    setPersonaId(personaId: string): void;
    /**
     * Detect self-criticism in user message
     */
    detectSelfCriticism(message: string): {
        detected: boolean;
        type?: keyof typeof PROTECTIVE_PHRASES;
        severity: number;
        content?: string;
    };
    /**
     * Get protective response
     */
    getProtectiveResponse(type: keyof typeof PROTECTIVE_PHRASES, severity: number, relationshipStage: RelationshipStage): {
        phrase: string;
        placement: 'interrupt' | 'prefix' | 'inline';
    };
}
export declare function getSpontaneousDelight(userId: string): SpontaneousDelightEngine;
export declare function getVisibleVulnerability(userId: string): VisibleVulnerabilityEngine;
export declare function getProtectiveInstincts(userId: string): ProtectiveInstinctsEngine;
export declare function clearDelightEngines(userId: string): void;
declare const _default: {
    SpontaneousDelightEngine: typeof SpontaneousDelightEngine;
    VisibleVulnerabilityEngine: typeof VisibleVulnerabilityEngine;
    ProtectiveInstinctsEngine: typeof ProtectiveInstinctsEngine;
    getSpontaneousDelight: typeof getSpontaneousDelight;
    getVisibleVulnerability: typeof getVisibleVulnerability;
    getProtectiveInstincts: typeof getProtectiveInstincts;
};
export default _default;
//# sourceMappingURL=spontaneous-delight.d.ts.map