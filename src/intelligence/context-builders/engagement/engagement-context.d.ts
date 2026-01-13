/**
 * Engagement Context Builder
 *
 * Integrates all engagement features into conversation context:
 * - Daily rituals
 * - Memory callbacks
 * - Team dynamics
 * - Seasonal events
 * - Persona evolution stories
 *
 * This is the "brain" that decides what engagement opportunities to surface.
 */
import type { UserProfile } from '../../../types/user-profile.js';
export interface EngagementContext {
    opportunities: EngagementOpportunity[];
    promptAddition: string;
    hasActiveRitual: boolean;
    hasMemoryCallback: boolean;
    hasSeasonalEvent: boolean;
    hasTeamHuddle: boolean;
    hasEvolutionStory: boolean;
}
export interface EngagementOpportunity {
    type: 'daily_ritual' | 'memory_callback' | 'seasonal_event' | 'team_huddle' | 'persona_evolution' | 'cross_reference' | 'streak_at_risk' | 'anniversary' | 'prediction_due';
    priority: number;
    content: string;
    personaId?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Build complete engagement context for a conversation turn
 */
export declare function buildEngagementContext(userId: string, profile: UserProfile | null, personaId: string, turnCount: number, options?: {
    includeRituals?: boolean;
    includeMemory?: boolean;
    includeTeam?: boolean;
    includeSeasonal?: boolean;
}): Promise<EngagementContext>;
/**
 * Enhance a standard greeting with engagement elements
 */
export declare function enhanceGreetingWithEngagement(baseGreeting: string, userId: string, profile: UserProfile | null, personaId: string): Promise<string>;
export default buildEngagementContext;
//# sourceMappingURL=engagement-context.d.ts.map