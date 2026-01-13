/**
 * Superhuman Memory → Personality Bridge
 *
 * "Better than human" means remembering at the RIGHT moment, in the RIGHT way.
 *
 * This module bridges the superhuman memory system with personality expressions:
 * - Proactive date callbacks ("I know this week is hard...")
 * - Topic absence detection ("You haven't mentioned X in a while...")
 * - Growth arc celebrations ("Look how far you've come!")
 * - Comfort pattern application (what helped before)
 * - Inside joke surfacing (relationship texture)
 *
 * @module personas/bundles/ferni/memory-personality-bridge
 */
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';
import type { ProactiveInsight } from '../../../intelligence/superhuman-memory.js';
export interface MemoryCallback {
    /** Type of callback */
    type: 'date' | 'absence' | 'growth' | 'comfort' | 'inside_joke' | 'pattern';
    /** The callback content */
    content: string;
    /** Natural phrasing for conversation */
    naturalPhrase: string;
    /** Priority (high = surface soon) */
    priority: 'high' | 'medium' | 'low';
    /** Best timing to surface */
    timing: 'greeting' | 'when_relevant' | 'closing' | 'anytime';
    /** Emotional tone to use */
    tone: 'celebratory' | 'gentle' | 'curious' | 'warm' | 'supportive';
    /** Theme this maps to */
    suggestedTheme: ThemeCategory;
    /** Source insight ID */
    sourceId?: string;
    /** Whether this has been delivered */
    delivered: boolean;
    /** When this was created */
    createdAt: Date;
}
export interface MemoryPersonalityContext {
    /** Pending callbacks for this user */
    pendingCallbacks: MemoryCallback[];
    /** Recently used callbacks (avoid repetition) */
    recentlyUsed: string[];
    /** Topics the user hasn't mentioned recently */
    absentTopics: string[];
    /** Known comfort patterns */
    comfortPatterns: string[];
    /** Growth markers to celebrate */
    growthMarkers: string[];
}
/**
 * Create a memory callback from a proactive insight
 */
export declare function createCallbackFromInsight(insight: ProactiveInsight): MemoryCallback;
/**
 * Create a date-aware callback
 */
export declare function createDateCallback(dateType: string, dateName: string, daysUntil: number): MemoryCallback;
/**
 * Create a topic absence callback
 */
export declare function createAbsenceCallback(topic: string, lastMentioned: Date): MemoryCallback;
/**
 * Create a growth celebration callback
 */
export declare function createGrowthCallback(area: string, progress: string): MemoryCallback;
/**
 * Create a comfort pattern callback
 */
export declare function createComfortCallback(pattern: string, context: string): MemoryCallback;
/**
 * Add a callback for a user
 */
export declare function addCallback(userId: string, callback: MemoryCallback): void;
/**
 * Get the best callback for current context
 */
export declare function getBestCallback(userId: string, currentTiming: MemoryCallback['timing'], currentMood?: string): MemoryCallback | null;
/**
 * Mark a callback as delivered
 */
export declare function markDelivered(userId: string, callback: MemoryCallback): void;
/**
 * Get pending callbacks count
 */
export declare function getPendingCount(userId: string): number;
/**
 * Clear all callbacks for a user
 */
export declare function clearCallbacks(userId: string): void;
/**
 * Convert a memory callback to an expression-compatible format
 */
export declare function callbackToExpression(callback: MemoryCallback): {
    content: string;
    theme: ThemeCategory;
    timing: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
};
/**
 * Get memory callbacks as personality context
 */
export declare function getMemoryPersonalityContext(userId: string): MemoryPersonalityContext;
export declare const memoryPersonalityBridge: {
    fromInsight: typeof createCallbackFromInsight;
    createDateCallback: typeof createDateCallback;
    createAbsenceCallback: typeof createAbsenceCallback;
    createGrowthCallback: typeof createGrowthCallback;
    createComfortCallback: typeof createComfortCallback;
    add: typeof addCallback;
    getBest: typeof getBestCallback;
    markDelivered: typeof markDelivered;
    getPendingCount: typeof getPendingCount;
    clear: typeof clearCallbacks;
    toExpression: typeof callbackToExpression;
    getContext: typeof getMemoryPersonalityContext;
};
export default memoryPersonalityBridge;
//# sourceMappingURL=memory-personality-bridge.d.ts.map