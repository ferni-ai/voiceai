/**
 * World Awareness Service
 *
 * "Better Than Human" - Ferni already knows what's happening in the world.
 * No "let me check" moments. Background pre-fetching gives instant awareness.
 *
 * Capabilities:
 * - Weather in user's location (pre-fetched, cached)
 * - News headlines (general, tech, financial)
 * - Sports scores for user's favorite teams
 * - Trending topics and cultural moments
 * - Historical events for today
 * - Cultural calendar (holidays, events, awareness days)
 *
 * Architecture:
 * - Pre-warms cache on session start
 * - Refreshes in background during conversation
 * - Context builders pull from cache (never wait for API)
 *
 * @module WorldAwareness
 */
export interface UserInterests {
    /** Favorite sports teams to track */
    favoriteTeams: string[];
    /** Industries they care about */
    industries: string[];
    /** Topics they're interested in */
    topics: string[];
    /** Their home location for weather */
    location?: string;
    /** Timezone for cultural calendar */
    timezone?: string;
}
export interface WeatherContext {
    current: string;
    forecast?: string;
    location: string;
    fetchedAt: Date;
    /** Weather-based conversation starter */
    conversationHook?: string;
}
export interface NewsContext {
    general: string[];
    tech: string[];
    financial: string[];
    fetchedAt: Date;
    /** Most interesting headline for natural mention */
    topStory?: string;
}
export interface SportsContext {
    scores: Map<string, string>;
    fetchedAt: Date;
    /** Big game happening? */
    excitingGame?: string;
}
export interface CulturalContext {
    /** Today's holiday/observance */
    holiday?: HolidayInfo;
    /** Nearby holidays (within 7 days) */
    upcomingHolidays: HolidayInfo[];
    /** Historical event for today */
    historicalEvent?: string;
    /** Season-specific context */
    seasonalContext: string;
}
export interface HolidayInfo {
    name: string;
    date: Date;
    type: 'major' | 'minor' | 'cultural' | 'awareness' | 'fun';
    /** How to acknowledge it naturally */
    acknowledgment: string;
    /** Cultural sensitivity notes */
    sensitivity?: string;
}
export interface TrendingContext {
    topics: string[];
    fetchedAt: Date;
}
export interface WorldSnapshot {
    weather?: WeatherContext;
    news?: NewsContext;
    sports?: SportsContext;
    cultural: CulturalContext;
    trending?: TrendingContext;
    /** When this snapshot was assembled */
    assembledAt: Date;
    /** Is the data fresh enough to use? */
    isFresh: boolean;
}
/**
 * Pre-warm the world awareness cache for a user.
 * Call this at session start - runs in background, doesn't block.
 */
export declare function warmWorldCache(userId: string, interests?: Partial<UserInterests>): Promise<void>;
/**
 * Get the current world snapshot for a user.
 * Returns whatever we have cached - never blocks on API calls.
 */
export declare function getWorldSnapshot(userId: string): WorldSnapshot;
/**
 * Update user's interests (e.g., when they mention a favorite team)
 */
export declare function updateUserInterests(userId: string, interests: Partial<UserInterests>): void;
/**
 * Get a natural conversation starter based on world context.
 * Returns something Ferni can weave naturally into greeting.
 */
export declare function getConversationStarter(userId: string): string | null;
/**
 * Check if user has mentioned a sports team we should track
 */
export declare function detectTeamMention(text: string): string | null;
/**
 * Clean up cache when session ends
 */
export declare function clearUserCache(userId: string): void;
declare const _default: {
    warmWorldCache: typeof warmWorldCache;
    getWorldSnapshot: typeof getWorldSnapshot;
    getConversationStarter: typeof getConversationStarter;
    updateUserInterests: typeof updateUserInterests;
    detectTeamMention: typeof detectTeamMention;
    clearUserCache: typeof clearUserCache;
};
export default _default;
//# sourceMappingURL=index.d.ts.map