/**
 * Context Assembler - Unified Intelligence Level 2
 *
 * "Knows what matters RIGHT NOW"
 *
 * Assembles a unified context window from multiple data sources,
 * prioritizing what's most relevant for the current conversation turn.
 *
 * Data Sources:
 * - Calendar/schedule
 * - Recent conversation topics
 * - Emotional patterns
 * - Active commitments
 * - Relationship data
 * - Capacity/stress indicators
 *
 * @module intelligence/context-assembler
 */
import type { PersonaConfig } from '../../personas/types.js';
/**
 * Immediate context about the current moment
 */
export interface ImmediateContext {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
    dayOfWeek: string;
    isWeekend: boolean;
    hour: number;
    currentMood?: string;
    recentActivity?: string;
    isLateNight: boolean;
}
/**
 * Today's context
 */
export interface TodayContext {
    agenda: string[];
    upcomingMeetings: number;
    hasImportantEvent: boolean;
    eventHighlight?: string;
}
/**
 * Recent conversation context
 */
export interface RecentContext {
    topicsDiscussed: string[];
    emotionalPatterns: string[];
    openThreads: string[];
    lastSessionSummary?: string;
}
/**
 * Relationship context with Ferni
 */
export interface RelationshipContext {
    trustLevel: number;
    sessionCount: number;
    daysSinceFirstContact: number;
    activeCommitments: string[];
    relationshipMilestone?: string;
}
/**
 * Capacity/bandwidth context
 */
export interface CapacityContext {
    bandwidth: 'low' | 'medium' | 'high';
    stressIndicators: string[];
    burnoutRisk: 'low' | 'moderate' | 'high' | 'critical';
    energyLevel?: 'depleted' | 'low' | 'moderate' | 'high' | 'energized';
}
/**
 * Full context window assembled for a turn
 */
export interface ContextWindow {
    immediate: ImmediateContext;
    activeDomains: string[];
    today: TodayContext;
    recent: RecentContext;
    relationship: RelationshipContext;
    capacity: CapacityContext;
    seasonal?: string;
    narrative?: string;
}
/**
 * Options for context assembly
 */
export interface AssemblyOptions {
    userId: string;
    sessionId?: string;
    voiceEmotion?: {
        primary?: string;
        valence?: string;
        energy?: number;
    };
    calendarEvents?: Array<{
        title: string;
        startTime: Date;
        isImportant?: boolean;
    }>;
    recentTopics?: string[];
    forceRefresh?: boolean;
}
/**
 * Assemble a unified context window for a conversation turn.
 *
 * This is the main entry point - call this once per turn to get
 * everything Ferni needs to know about the current moment.
 */
export declare function assembleContext(options: AssemblyOptions): Promise<ContextWindow>;
/**
 * Select and prioritize context for a specific turn.
 *
 * Not all context is relevant for every turn. This function
 * filters and prioritizes based on current conversation needs.
 */
export declare function selectContextForTurn(context: ContextWindow, currentTopic: string, persona?: PersonaConfig): ContextWindow;
/**
 * Format context window for LLM injection
 */
export declare function formatAssembledContextForPrompt(context: ContextWindow): string;
/**
 * Clear context cache for a user
 */
export declare function clearContextCache(userId?: string): void;
/**
 * Invalidate cache when significant changes occur
 */
export declare function invalidateContext(userId: string): void;
export declare const contextAssembler: {
    assemble: typeof assembleContext;
    select: typeof selectContextForTurn;
    format: typeof formatAssembledContextForPrompt;
    clearCache: typeof clearContextCache;
    invalidate: typeof invalidateContext;
};
//# sourceMappingURL=context-assembler.d.ts.map