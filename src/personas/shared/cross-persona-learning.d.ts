/**
 * Cross-Persona Expression Learning
 *
 * When an expression gets positive engagement with one persona,
 * share that learning across the team (adapted to each persona's voice).
 *
 * "Better than human" means the whole team learns together.
 *
 * Example:
 *   Maya says "I notice you're being hard on yourself" → user responds positively
 *   → Jordan, Alex, Nayan all learn this pattern works
 *   → Each adapts it to their voice
 *
 * @module personas/shared/cross-persona-learning
 */
import type { ThemeCategory } from '../../services/session-variety-tracker.js';
export interface LearnedPattern {
    /** Unique ID */
    id: string;
    /** The pattern template (persona-agnostic) */
    template: string;
    /** Original expression that worked */
    originalExpression: string;
    /** Persona that discovered this */
    sourcePersona: string;
    /** Theme category */
    theme: ThemeCategory;
    /** Context where it worked */
    context: {
        emotionalState?: string;
        relationshipStage?: string;
        momentum?: string;
        timeOfDay?: string;
    };
    /** Engagement metrics */
    engagement: {
        positiveCount: number;
        negativeCount: number;
        neutralCount: number;
        score: number;
    };
    /** Per-persona adaptations */
    adaptations: Record<string, string>;
    /** When this was learned */
    learnedAt: Date;
    /** When this was last used */
    lastUsedAt: Date;
}
export interface PersonaVoice {
    /** Persona ID */
    personaId: string;
    /** Voice characteristics */
    warmth: number;
    formality: number;
    playfulness: number;
    directness: number;
    /** Common phrases/patterns */
    signaturePhrases: string[];
    /** Vocabulary tendencies */
    preferredWords: string[];
    avoidedWords: string[];
}
/**
 * Extract a reusable pattern from a successful expression
 */
export declare function extractPattern(expression: string): string;
/**
 * Adapt a pattern to a specific persona's voice
 */
export declare function adaptPatternToPersona(pattern: string, targetPersonaId: string): string;
/**
 * Record a successful expression and create a learned pattern
 */
export declare function learnFromExpression(expression: string, sourcePersona: string, theme: ThemeCategory, context: LearnedPattern['context'], engagement: 'positive' | 'negative' | 'neutral'): LearnedPattern | null;
/**
 * Record engagement with an existing pattern
 */
export declare function recordPatternEngagement(patternId: string, engagement: 'positive' | 'negative' | 'neutral'): void;
/**
 * Get best learned patterns for a persona and context
 */
export declare function getBestPatternsForPersona(personaId: string, theme?: ThemeCategory, context?: Partial<LearnedPattern['context']>, limit?: number): Array<{
    pattern: LearnedPattern;
    adaptation: string;
}>;
/**
 * Get all patterns learned from a specific persona
 */
export declare function getPatternsFromPersona(sourcePersonaId: string): LearnedPattern[];
/**
 * Get pattern statistics
 */
export declare function getPatternStats(): {
    totalPatterns: number;
    byPersona: Record<string, number>;
    byTheme: Record<string, number>;
    avgScore: number;
};
/**
 * Clear all learned patterns (for testing)
 */
export declare function clearAllPatterns(): void;
/**
 * Prune old or low-performing patterns
 */
export declare function prunePatterns(maxAgeMs?: number): number;
export declare const crossPersonaLearning: {
    extractPattern: typeof extractPattern;
    adaptPatternToPersona: typeof adaptPatternToPersona;
    learnFromExpression: typeof learnFromExpression;
    recordEngagement: typeof recordPatternEngagement;
    getBestPatternsForPersona: typeof getBestPatternsForPersona;
    getPatternsFromPersona: typeof getPatternsFromPersona;
    getStats: typeof getPatternStats;
    clear: typeof clearAllPatterns;
    prune: typeof prunePatterns;
    personaVoices: Record<string, PersonaVoice>;
};
export default crossPersonaLearning;
//# sourceMappingURL=cross-persona-learning.d.ts.map