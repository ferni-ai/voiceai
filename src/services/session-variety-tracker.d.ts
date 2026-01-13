/**
 * Session Variety Tracker
 *
 * Prevents repetitive personality expressions by tracking themes mentioned
 * per session. Ferni's core identity stays consistent, but HOW he expresses
 * it varies naturally - like a real person who loves coffee but doesn't
 * mention it every conversation.
 *
 * Philosophy: Static personality files define WHO Ferni is.
 * This tracker ensures he expresses himself dynamically, not repetitively.
 *
 * @module services/session-variety-tracker
 */
/**
 * Theme categories that group related personality expressions
 * These map multiple specific mentions to a single theme
 */
export type ThemeCategory = 'warm_drinks' | 'global_traveler' | 'music_taste' | 'family_life' | 'physical_habits' | 'food_opinions' | 'nature_connection' | 'philosophical' | 'vulnerability' | 'professional' | 'quirky_interests' | 'sensory_moment' | 'celebration' | 'adventure' | 'family_milestones' | 'life_transitions' | 'wisdom' | 'mortality_awareness' | 'communication_wisdom' | 'professional_insight' | 'productivity' | 'nutrition' | 'market_history' | 'analytical_process' | 'behavioral_finance' | 'long_term_thinking' | 'investment_philosophy' | 'wealth_philosophy';
/**
 * A specific personality expression with its theme
 */
export interface PersonalityExpression {
    id: string;
    theme: ThemeCategory;
    content: string;
    weight?: number;
    emotionalContext?: string[];
}
/**
 * Selection options for variety-aware selection
 */
export interface SelectionOptions {
    /** Force this theme even if used (for follow-ups) */
    forceTheme?: ThemeCategory;
    /** Only consider expressions matching this emotion */
    emotionalContext?: string;
    /** Boost weight for these themes */
    preferThemes?: ThemeCategory[];
    /** How many items to select */
    count?: number;
}
/**
 * Tracks variety within a session to prevent repetitive expressions
 */
export declare class SessionVarietyTracker {
    private sessionStates;
    private readonly config;
    /**
     * Get or create session state
     */
    private getState;
    /**
     * Detect theme from content
     * Uses ordered keyword list so specific matches come before generic ones
     */
    detectTheme(content: string): ThemeCategory | null;
    /**
     * Check if a theme should be avoided this session
     */
    shouldAvoidTheme(sessionId: string, theme: ThemeCategory): boolean;
    /**
     * Record that a theme/expression was used
     */
    recordUsage(sessionId: string, theme: ThemeCategory, expressionId?: string): void;
    /**
     * Record a turn (call at end of each turn)
     */
    recordTurn(sessionId: string): void;
    /**
     * Select from a pool of expressions with variety tracking
     */
    selectWithVariety<T extends PersonalityExpression>(sessionId: string, pool: T[], options?: SelectionOptions): T | null;
    /**
     * Select multiple expressions with variety
     */
    selectMultipleWithVariety<T extends PersonalityExpression>(sessionId: string, pool: T[], count: number, options?: Omit<SelectionOptions, 'count'>): T[];
    /**
     * Get usage stats for a session
     */
    getStats(sessionId: string): {
        usedThemes: ThemeCategory[];
        themeUsageCounts: Record<ThemeCategory, number>;
        usedExpressionCount: number;
        turnCount: number;
    };
    /**
     * Clear session state
     */
    clearSession(sessionId: string): void;
    /**
     * Clear all sessions (for testing)
     */
    clearAll(): void;
}
export declare function getSessionVarietyTracker(): SessionVarietyTracker;
export declare function resetSessionVarietyTracker(): void;
declare const _default: {
    SessionVarietyTracker: typeof SessionVarietyTracker;
    getSessionVarietyTracker: typeof getSessionVarietyTracker;
    resetSessionVarietyTracker: typeof resetSessionVarietyTracker;
};
export default _default;
//# sourceMappingURL=session-variety-tracker.d.ts.map