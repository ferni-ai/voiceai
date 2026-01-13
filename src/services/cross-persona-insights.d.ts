/**
 * Cross-Persona Insights Service
 *
 * Enables personas to share insights with each other that get injected
 * during handoffs or proactively surfaced during conversations.
 *
 * > "What Peter sees in the numbers, Maya needs to know about habits.
 *    What Maya sees in the patterns, Jordan needs to know about goals."
 *
 * INSIGHT TYPES:
 *
 * 1. HANDOFF INSIGHTS - Passed when transferring to another persona
 *    - Peter → Maya: "Stress spending detected - habit support needed"
 *    - Maya → Jordan: "Keystone habit driving momentum - great time for new goal"
 *    - Jordan → Nayan: "Major life transition in progress"
 *
 * 2. PROACTIVE INSIGHTS - Surfaced during conversations
 *    - "Peter noticed something about your spending patterns..."
 *    - "Maya wants to celebrate a habit milestone!"
 *    - "Jordan has a timeline update for your goal..."
 *
 * 3. CROSS-TEAM BRIEFINGS - Background context for any persona
 *    - Current streaks, goals in progress, recent patterns
 *
 * @module services/cross-persona-insights
 */
export type InsightPriority = 'critical' | 'high' | 'normal' | 'low';
export type InsightSource = 'peter' | 'maya' | 'jordan' | 'nayan' | 'ferni' | 'system';
export type InsightTarget = InsightSource | 'all';
export interface CrossPersonaInsight {
    id: string;
    source: InsightSource;
    target: InsightTarget;
    priority: InsightPriority;
    content: string;
    category: string;
    createdAt: number;
    expiresAt: number;
    /** If true, surface proactively. If false, only on handoff. */
    proactive: boolean;
    /** If true, remove after surfacing once */
    oneTime: boolean;
    /** Additional context data */
    metadata?: Record<string, unknown>;
}
export interface InsightBriefing {
    /** Insights from other personas for the current persona */
    incomingInsights: CrossPersonaInsight[];
    /** Quick summary of cross-team status */
    teamStatus: TeamStatusSummary;
    /** Proactive discoveries to potentially surface */
    proactiveDiscoveries: string[];
}
export interface TeamStatusSummary {
    /** Current habit health (from Maya) */
    habitHealth: {
        activeHabits: number;
        totalStreakDays: number;
        keystoneActive: boolean;
        atRiskCount: number;
    };
    /** Current goal status (from Jordan) */
    goalStatus: {
        activeGoals: number;
        nearingCompletion: number;
        totalSaved: number;
    };
    /** Financial health (from Peter) */
    financialHealth: {
        budgetUsedPercent: number;
        recentStressTriggers: number;
        savingsOnTrack: boolean;
    };
}
/**
 * Add an insight to be shared with another persona
 */
export declare function addCrossPersonaInsight(userId: string, insight: Omit<CrossPersonaInsight, 'id' | 'createdAt' | 'expiresAt'>): CrossPersonaInsight;
/**
 * Options for getInsightsForPersona (legacy API support)
 */
interface GetInsightsOptions {
    includeAcknowledged?: boolean;
    maxAge?: number;
    minConfidence?: number;
}
/**
 * Get insights targeted at a specific persona
 * Supports both new API (2 args) and legacy API (3 args with options)
 */
export declare function getInsightsForPersona(userId: string, personaId: string, options?: GetInsightsOptions): SurfaceInsightItem[];
/**
 * Get proactive insights that should be surfaced
 */
export declare function getProactiveInsights(userId: string): CrossPersonaInsight[];
/**
 * Mark an insight as consumed (for one-time insights)
 */
export declare function consumeInsight(userId: string, insightId: string): void;
/**
 * Clear expired insights
 */
export declare function clearExpiredInsights(userId: string): number;
/**
 * Generate a cross-team status summary for any persona
 */
export declare function generateTeamStatus(userId: string): Promise<TeamStatusSummary>;
/**
 * Scan for cross-persona insights that should be generated
 * This runs periodically to detect patterns and create shareable insights
 *
 * Thresholds are intentionally LOW to generate insights frequently -
 * users should see team activity to feel the "six minds working together" promise.
 */
export declare function scanForCrossPersonaInsights(userId: string): Promise<void>;
/**
 * Build a complete insight briefing for a persona during handoff
 */
export declare function buildInsightBriefingForHandoff(userId: string, targetPersonaId: string): Promise<InsightBriefing>;
/**
 * Format insight briefing as prompt injection
 */
export declare function formatInsightBriefingForPrompt(briefing: InsightBriefing): string;
export type PersonaId = InsightSource | 'alex-chen' | 'nayan-patel' | 'maya-santos' | 'peter-john' | 'jordan-taylor';
/**
 * Record an insight (legacy API - flexible arguments)
 */
export declare function recordInsight(userId: string, source: string, contentOrOptions: string | {
    category?: string;
    content: string;
    summary?: string;
    confidence?: number;
    priority?: string;
    evidence?: string;
    expiresInDays?: number;
    surfaceInNextConversation?: boolean;
}): CrossPersonaInsight;
/**
 * Load insights for a user from persistence and scan for new ones
 */
export declare function loadInsights(userId: string): Promise<void>;
/**
 * Surface insight item - wrapper type for backwards compatibility
 */
interface SurfaceInsightItem {
    insight: {
        id: string;
        category: string;
        summary: string;
        sourcePersona: string;
    };
    relevanceScore: number;
}
/**
 * Get insights to surface (legacy API - returns wrapped items with old shape)
 */
export declare function getInsightsToSurface(userId: string, personaId?: string, _limit?: number): SurfaceInsightItem[];
/**
 * Acknowledge an insight (legacy API - returns Promise)
 */
export declare function acknowledgeInsight(userId: string, insightId: string, _personaId?: string): Promise<void>;
/**
 * Build insight context for injection (legacy API - takes options)
 */
export declare function buildInsightContext(userId: string, personaId: string, _options?: {
    maxInsights?: number;
}): string;
declare const _default: {
    addCrossPersonaInsight: typeof addCrossPersonaInsight;
    getInsightsForPersona: typeof getInsightsForPersona;
    getProactiveInsights: typeof getProactiveInsights;
    consumeInsight: typeof consumeInsight;
    clearExpiredInsights: typeof clearExpiredInsights;
    generateTeamStatus: typeof generateTeamStatus;
    scanForCrossPersonaInsights: typeof scanForCrossPersonaInsights;
    buildInsightBriefingForHandoff: typeof buildInsightBriefingForHandoff;
    formatInsightBriefingForPrompt: typeof formatInsightBriefingForPrompt;
    recordInsight: typeof recordInsight;
    loadInsights: typeof loadInsights;
    getInsightsToSurface: typeof getInsightsToSurface;
    acknowledgeInsight: typeof acknowledgeInsight;
    buildInsightContext: typeof buildInsightContext;
};
export default _default;
//# sourceMappingURL=cross-persona-insights.d.ts.map