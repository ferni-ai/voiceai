/**
 * Ferni Dynamic Personality System
 *
 * ⚠️ LEGACY MODULE - Consider using the "Better Than Human" system instead:
 *    import { ferniPersonality } from './personality-integration.js';
 *
 * This module provides pool-based variety tracking for backward compatibility.
 * The new system in personality-integration.ts offers:
 *
 * 1. COMPOSITION not SELECTION - Expressions are built from building blocks
 * 2. 8-DIMENSIONAL CONTEXT - Time, emotion, momentum, relationship, voice...
 * 3. CROSS-SESSION LEARNING - Remembers what resonates with THIS user
 * 4. REAL-TIME NOTICING - Detects pauses, energy shifts, voice-text mismatch
 * 5. ADAPTIVE INTIMACY - Vulnerability calibrates to relationship depth
 *
 * For new code, use:
 *   const result = await ferniPersonality.processTurn(input);
 *   const response = ferniPersonality.applyToResponse(raw, result);
 *
 * @module personas/bundles/ferni/dynamic-personality
 */
import { type SelectionOptions, type ThemeCategory } from '../../../services/session-variety-tracker.js';
export interface DynamicExpressionResult {
    content: string;
    theme: ThemeCategory;
    id: string;
}
/**
 * Get a personality expression with variety tracking
 */
export declare function getExpression(sessionId: string, category: ThemeCategory, options?: SelectionOptions): DynamicExpressionResult | null;
/**
 * Get an expression from ANY category with variety tracking
 * Good for "caught doing" moments - varies what trait is surfaced
 */
export declare function getRandomExpression(sessionId: string, options?: SelectionOptions & {
    excludeCategories?: ThemeCategory[];
}): DynamicExpressionResult | null;
/**
 * Get a "caught doing" moment - what Ferni was doing before the call
 */
export declare function getCaughtDoingMoment(sessionId: string): string | null;
/**
 * Get a grounding/sensory moment
 */
export declare function getSensoryMoment(sessionId: string, emotion?: string): string | null;
/**
 * Get a music mention (when music is appropriate)
 */
export declare function getMusicMention(sessionId: string, emotion?: string): string | null;
/**
 * Get a traveler reference (when global perspective helps)
 */
export declare function getTravelerReference(sessionId: string): string | null;
/**
 * Get a vulnerability moment (use sparingly, only when appropriate)
 */
export declare function getVulnerabilityMoment(sessionId: string, emotion?: string): string | null;
/**
 * Record turn completion - call at end of each turn
 */
export declare function recordTurnComplete(sessionId: string): void;
/**
 * Get variety stats for debugging
 */
export declare function getVarietyStats(sessionId: string): {
    usedThemes: ThemeCategory[];
    themeUsageCounts: Record<ThemeCategory, number>;
    usedExpressionCount: number;
    turnCount: number;
};
/**
 * Clear session (for testing or session end)
 */
export declare function clearSessionVariety(sessionId: string): void;
declare const _default: {
    getExpression: typeof getExpression;
    getRandomExpression: typeof getRandomExpression;
    getCaughtDoingMoment: typeof getCaughtDoingMoment;
    getSensoryMoment: typeof getSensoryMoment;
    getMusicMention: typeof getMusicMention;
    getTravelerReference: typeof getTravelerReference;
    getVulnerabilityMoment: typeof getVulnerabilityMoment;
    recordTurnComplete: typeof recordTurnComplete;
    getVarietyStats: typeof getVarietyStats;
    clearSessionVariety: typeof clearSessionVariety;
};
export default _default;
export { ferniPersonality, processTurnPersonality, applyPersonalityToResponse, type PersonalityTurnInput, type PersonalityTurnResult, } from './personality-integration.js';
//# sourceMappingURL=dynamic-personality.d.ts.map