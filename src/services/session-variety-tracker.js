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
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'session-variety-tracker' });
// ============================================================================
// THEME MAPPINGS
// ============================================================================
/**
 * Keyword to theme mapping - ORDER MATTERS for detection
 * More specific keywords must come before generic ones
 * (e.g., "mint tea from Morocco" should match 'morocco' not 'tea')
 *
 * Comprehensive coverage to catch ALL repetitive content in quirks.json and other sources
 */
const KEYWORD_TO_THEME_ORDERED = [
    // =========================================================================
    // GLOBAL TRAVELER - Check FIRST (locations override drink/generic keywords)
    // =========================================================================
    ['japan', 'global_traveler'],
    ['japanese', 'global_traveler'],
    ['tokyo', 'global_traveler'],
    ['morocco', 'global_traveler'],
    ['marrakech', 'global_traveler'],
    ['salaam', 'global_traveler'], // Arabic greeting - Morocco connection
    ['wyoming', 'global_traveler'],
    ['tetons', 'global_traveler'],
    ['brazil', 'global_traveler'],
    ['portuguese', 'global_traveler'],
    ['scotland', 'global_traveler'],
    ['scottish', 'global_traveler'],
    ['mumbai', 'global_traveler'],
    ['india', 'global_traveler'],
    ['portugal', 'global_traveler'],
    ['alps', 'global_traveler'],
    ['passport', 'global_traveler'],
    ['four continents', 'global_traveler'],
    ['another country', 'global_traveler'],
    ['living abroad', 'global_traveler'],
    ['step off a plane', 'global_traveler'],
    ['time difference', 'global_traveler'],
    ['new country', 'global_traveler'],
    ['last trip', 'global_traveler'],
    // =========================================================================
    // WARM DRINKS - After locations so "mint tea from Morocco" isn't caught by "tea"
    // =========================================================================
    ['coffee', 'warm_drinks'],
    ['mint tea', 'warm_drinks'],
    ['tea', 'warm_drinks'],
    ['caffeine', 'warm_drinks'],
    ['refill', 'warm_drinks'],
    // =========================================================================
    // MUSIC TASTE
    // =========================================================================
    ['bon iver', 'music_taste'],
    ['sukiyaki', 'music_taste'],
    ['jazz', 'music_taste'],
    ['stevie wonder', 'music_taste'],
    ['miles davis', 'music_taste'],
    ['playlist', 'music_taste'],
    ['song', 'music_taste'],
    ['music', 'music_taste'],
    ['listening to', 'music_taste'],
    // =========================================================================
    // FAMILY LIFE
    // =========================================================================
    ['my wife', 'family_life'],
    ['wife', 'family_life'],
    ['eight kids', 'family_life'],
    ['kids', 'family_life'],
    ['children', 'family_life'],
    ['my brother', 'family_life'],
    ['brother', 'family_life'],
    ['proud dad', 'family_life'],
    ['family', 'family_life'],
    ['ski resort', 'family_life'], // Brother argument
    ['40 years', 'family_life'], // Brother argument
    // =========================================================================
    // PHYSICAL HABITS - Embodied presence
    // =========================================================================
    ['notebook', 'physical_habits'],
    ['write down', 'physical_habits'],
    ['paper notebook', 'physical_habits'],
    ['reading glasses', 'physical_habits'],
    ['glasses', 'physical_habits'],
    ['5 am', 'physical_habits'],
    ['5am', 'physical_habits'],
    ['wake up', 'physical_habits'],
    ['early riser', 'physical_habits'],
    ['bow', 'physical_habits'],
    ['stretch', 'physical_habits'],
    ['back', 'physical_habits'],
    ['chair', 'physical_habits'],
    ['sitting', 'physical_habits'],
    ['doodling', 'physical_habits'],
    ['making a list', 'physical_habits'],
    // =========================================================================
    // FOOD OPINIONS
    // =========================================================================
    ['street food', 'food_opinions'],
    ['cereal', 'food_opinions'],
    ['pineapple', 'food_opinions'],
    ['pizza', 'food_opinions'],
    ['ramen', 'food_opinions'],
    ['dinner', 'food_opinions'],
    ['lunch', 'food_opinions'],
    ['ate', 'food_opinions'],
    // =========================================================================
    // NATURE CONNECTION - Wyoming sky, weather, outdoors
    // =========================================================================
    ['sky', 'nature_connection'],
    ['weather', 'nature_connection'],
    ['sunrise', 'nature_connection'],
    ['sunset', 'nature_connection'],
    ['mountains', 'nature_connection'],
    ['stars', 'nature_connection'],
    ['clouds', 'nature_connection'],
    ['plant', 'nature_connection'],
    ['window', 'nature_connection'],
    ['outside', 'nature_connection'],
    // =========================================================================
    // PHILOSOPHICAL - Deeper meaning
    // =========================================================================
    ['meaning', 'philosophical'],
    ['purpose', 'philosophical'],
    ['presence', 'philosophical'],
    ['patience', 'philosophical'],
    ['mindfulness', 'philosophical'],
    ['ephemeral', 'philosophical'],
    // =========================================================================
    // VULNERABILITY - Deep sharing
    // =========================================================================
    ['tsunami', 'vulnerability'],
    ['grief', 'vulnerability'],
    ['2011', 'vulnerability'],
    ['survivor guilt', 'vulnerability'],
    ['loss', 'vulnerability'],
    ['hard conversation', 'vulnerability'],
    // =========================================================================
    // PROFESSIONAL - Coaching identity
    // =========================================================================
    ['coaching', 'professional'],
    ['coach', 'professional'],
    ['listening', 'professional'],
    ['breakthrough', 'professional'],
    ['team', 'professional'],
    // =========================================================================
    // QUIRKY INTERESTS - Endearing oddities
    // =========================================================================
    ['golf', 'quirky_interests'],
    ['disaster movies', 'quirky_interests'],
    ['flights', 'quirky_interests'],
    ['looking at flights', 'quirky_interests'],
    ['fishing', 'quirky_interests'],
    ['bookmarks', 'quirky_interests'],
    ['documentary', 'quirky_interests'],
    ['rabbit hole', 'quirky_interests'],
    ['old email', 'quirky_interests'],
    // =========================================================================
    // SENSORY MOMENT - Grounding experiences
    // =========================================================================
    ['light', 'sensory_moment'],
    ['voice changed', 'sensory_moment'],
    ['something lifted', 'sensory_moment'],
    ['holding something', 'sensory_moment'],
    ['smell', 'sensory_moment'],
    ['sound', 'sensory_moment'],
];
// ============================================================================
// SESSION VARIETY TRACKER
// ============================================================================
/**
 * Tracks variety within a session to prevent repetitive expressions
 */
export class SessionVarietyTracker {
    sessionStates = new Map();
    // Configuration
    config = {
        /** Max times a theme can be used per session */
        maxThemeUsagePerSession: 2,
        /** Min turns before a theme can be reused */
        themeReuseMinTurns: 5,
        /** Probability of avoiding recently-used themes */
        avoidanceWeight: 0.8,
    };
    /**
     * Get or create session state
     */
    getState(sessionId) {
        let state = this.sessionStates.get(sessionId);
        if (!state) {
            state = {
                usedThemes: new Set(),
                usedExpressionIds: new Set(),
                themeUsageCounts: new Map(),
                lastThemeUsed: null,
                turnCount: 0,
            };
            this.sessionStates.set(sessionId, state);
        }
        return state;
    }
    /**
     * Detect theme from content
     * Uses ordered keyword list so specific matches come before generic ones
     */
    detectTheme(content) {
        const lowerContent = content.toLowerCase();
        for (const [keyword, theme] of KEYWORD_TO_THEME_ORDERED) {
            if (lowerContent.includes(keyword)) {
                return theme;
            }
        }
        return null;
    }
    /**
     * Check if a theme should be avoided this session
     */
    shouldAvoidTheme(sessionId, theme) {
        const state = this.getState(sessionId);
        // Check usage count
        const usageCount = state.themeUsageCounts.get(theme) || 0;
        if (usageCount >= this.config.maxThemeUsagePerSession) {
            return true;
        }
        // Avoid if it was the last theme used (prevents back-to-back)
        if (state.lastThemeUsed === theme) {
            return true;
        }
        return false;
    }
    /**
     * Record that a theme/expression was used
     */
    recordUsage(sessionId, theme, expressionId) {
        const state = this.getState(sessionId);
        state.usedThemes.add(theme);
        state.themeUsageCounts.set(theme, (state.themeUsageCounts.get(theme) || 0) + 1);
        state.lastThemeUsed = theme;
        if (expressionId) {
            state.usedExpressionIds.add(expressionId);
        }
        log.debug({ sessionId, theme, expressionId }, 'Recorded variety usage');
    }
    /**
     * Record a turn (call at end of each turn)
     */
    recordTurn(sessionId) {
        const state = this.getState(sessionId);
        state.turnCount++;
        // Reset lastThemeUsed after a few turns to allow reuse
        if (state.turnCount % this.config.themeReuseMinTurns === 0) {
            state.lastThemeUsed = null;
        }
    }
    /**
     * Select from a pool of expressions with variety tracking
     */
    selectWithVariety(sessionId, pool, options = {}) {
        if (pool.length === 0)
            return null;
        const state = this.getState(sessionId);
        const count = options.count || 1;
        // Filter pool based on variety
        let candidates = pool.filter((expr) => {
            // Skip already-used expressions
            if (state.usedExpressionIds.has(expr.id)) {
                return false;
            }
            // Skip avoided themes (unless forced)
            if (!options.forceTheme && this.shouldAvoidTheme(sessionId, expr.theme)) {
                return false;
            }
            // Filter by emotional context if specified
            if (options.emotionalContext && expr.emotionalContext) {
                if (!expr.emotionalContext.includes(options.emotionalContext)) {
                    return false;
                }
            }
            return true;
        });
        // If no candidates after filtering, fall back to unused expressions only
        if (candidates.length === 0) {
            candidates = pool.filter((expr) => !state.usedExpressionIds.has(expr.id));
        }
        // If still no candidates, just use the full pool (better than nothing)
        if (candidates.length === 0) {
            log.debug({ sessionId, poolSize: pool.length }, 'All expressions used, resetting pool');
            candidates = pool;
        }
        // Apply weights
        const weightedCandidates = candidates.map((expr) => {
            let weight = expr.weight || 1.0;
            // Boost preferred themes
            if (options.preferThemes?.includes(expr.theme)) {
                weight *= 1.5;
            }
            // Reduce weight for recently-used themes (soft avoidance)
            if (state.usedThemes.has(expr.theme)) {
                weight *= 1 - this.config.avoidanceWeight;
            }
            return { expr, weight };
        });
        // Weighted random selection
        const totalWeight = weightedCandidates.reduce((sum, c) => sum + c.weight, 0);
        let random = Math.random() * totalWeight;
        for (const { expr, weight } of weightedCandidates) {
            random -= weight;
            if (random <= 0) {
                // Record usage
                this.recordUsage(sessionId, expr.theme, expr.id);
                return expr;
            }
        }
        // Fallback to first candidate
        const selected = candidates[0];
        this.recordUsage(sessionId, selected.theme, selected.id);
        return selected;
    }
    /**
     * Select multiple expressions with variety
     */
    selectMultipleWithVariety(sessionId, pool, count, options = {}) {
        const results = [];
        const usedInThisSelection = new Set();
        for (let i = 0; i < count && i < pool.length; i++) {
            // Filter out already selected in this batch
            const availablePool = pool.filter((e) => !usedInThisSelection.has(e.id));
            const selected = this.selectWithVariety(sessionId, availablePool, options);
            if (selected) {
                results.push(selected);
                usedInThisSelection.add(selected.id);
            }
        }
        return results;
    }
    /**
     * Get usage stats for a session
     */
    getStats(sessionId) {
        const state = this.getState(sessionId);
        return {
            usedThemes: Array.from(state.usedThemes),
            themeUsageCounts: Object.fromEntries(state.themeUsageCounts),
            usedExpressionCount: state.usedExpressionIds.size,
            turnCount: state.turnCount,
        };
    }
    /**
     * Clear session state
     */
    clearSession(sessionId) {
        this.sessionStates.delete(sessionId);
        log.debug({ sessionId }, 'Session variety state cleared');
    }
    /**
     * Clear all sessions (for testing)
     */
    clearAll() {
        this.sessionStates.clear();
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultTracker = null;
export function getSessionVarietyTracker() {
    if (!defaultTracker) {
        defaultTracker = new SessionVarietyTracker();
    }
    return defaultTracker;
}
export function resetSessionVarietyTracker() {
    defaultTracker = null;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    SessionVarietyTracker,
    getSessionVarietyTracker,
    resetSessionVarietyTracker,
};
//# sourceMappingURL=session-variety-tracker.js.map