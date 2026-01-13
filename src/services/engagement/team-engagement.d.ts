/**
 * Team Engagement Service
 *
 * Enables multi-persona interactions, seasonal events, and persona evolution stories.
 * This creates the feeling of a supportive friend group rather than isolated advisors.
 *
 * FEATURES:
 *   - Team Huddles: Multiple personas comment on user's progress
 *   - Persona Evolution: Characters grow and change over time
 *   - Seasonal Events: Special moments tied to calendar
 *   - Anniversary Celebrations: Marking user milestones
 *   - Cross-Persona Banter: Characters referencing each other
 *
 * PERSISTENCE: All team engagement data is persisted to Firestore via the
 * unified persistence layer to survive server restarts.
 */
import type { UserProfile } from '../../types/user-profile.js';
export { HANDOFF_BANTER, getHandoffBanter, getSoftOpenBanter, ARRIVING_BANTER, getArrivingBanter, } from '../team-engagement/banter.js';
export { getIntelligentBanter, buildBanterContext, detectTimeOfDay, type BanterContext, type IntelligentBanterResult, getLLMDrivenBanter, buildLLMSoftOpenInstructions, buildLLMArrivingInstructions, type LLMBanterInstructions, } from '../team-engagement/intelligent-banter.js';
export interface TeamHuddle {
    id: string;
    userId: string;
    scheduledAt: Date;
    type: 'weekly' | 'monthly' | 'milestone' | 'special';
    participants: string[];
    topic?: string;
    completed: boolean;
    summary?: string;
}
export interface PersonaEvolutionEvent {
    id: string;
    personaId: string;
    eventType: 'life_event' | 'growth' | 'story_unlock' | 'mood_shift';
    title: string;
    description: string;
    occurredAt: Date;
    sharedWithUser: boolean;
    unlockCondition?: {
        type: 'relationship_stage' | 'conversation_count' | 'time_based' | 'topic_discussed';
        value: string | number;
    };
}
export interface SeasonalEvent {
    id: string;
    name: string;
    type: 'holiday' | 'anniversary' | 'seasonal' | 'special_day';
    startDate: Date;
    endDate: Date;
    personaResponses: Record<string, string[]>;
    userCelebrated: boolean;
}
export interface UserAnniversary {
    type: 'ferniday' | 'milestone' | 'birthday';
    date: Date;
    acknowledged: boolean;
    celebrationType?: 'small' | 'medium' | 'big';
}
export declare const PERSONA_EVOLUTION_STORIES: PersonaEvolutionEvent[];
export declare const TEAM_HUDDLE_SCRIPTS: {
    weekly: {
        intro: string[];
        transitions: string[];
        outro: string[];
    };
    personaComments: {
        ferni: {
            progress: string[];
            concern: string[];
        };
        'alex-chen': {
            productivity: string[];
            suggestion: string[];
        };
        'maya-santos': {
            habits: string[];
            encouragement: string[];
        };
        'jordan-taylor': {
            milestones: string[];
            future: string[];
        };
        'nayan-patel': {
            wisdom: string[];
            challenge: string[];
        };
        'peter-john': {
            patterns: string[];
            insight: string[];
        };
    };
};
export declare const SEASONAL_EVENTS: Record<string, Omit<SeasonalEvent, 'id' | 'startDate' | 'endDate' | 'userCelebrated'>>;
export declare const CROSS_PERSONA_REFERENCES: {
    ferni: {
        aboutAlex: string[];
        aboutMaya: string[];
        aboutJordan: string[];
        aboutNayan: string[];
        aboutPeter: string[];
    };
    'alex-chen': {
        aboutFerni: string[];
        aboutMaya: string[];
        aboutJordan: string[];
    };
    'maya-santos': {
        aboutFerni: string[];
        aboutAlex: string[];
    };
    'jordan-taylor': {
        aboutFerni: string[];
        aboutAlex: string[];
    };
    'peter-john': {
        aboutFerni: string[];
        aboutMaya: string[];
        aboutNayan: string[];
    };
};
export declare class TeamEngagementService {
    private huddles;
    private sharedEvolutions;
    private userAnniversaries;
    private persistenceStore;
    private initialized;
    /**
     * Initialize persistence
     */
    initialize(): Promise<void>;
    /**
     * Load user data from persistence
     */
    private loadUserData;
    /**
     * Persist user data to Firestore
     */
    private persistUserData;
    /**
     * Shutdown (flush all pending data)
     */
    shutdown(): Promise<void>;
    /**
     * Generate a team huddle for a user
     */
    generateTeamHuddle(userId: string, profile: UserProfile | null, type?: TeamHuddle['type']): Promise<{
        intro: string;
        comments: Array<{
            personaId: string;
            comment: string;
        }>;
        outro: string;
    }>;
    /**
     * Select which personas should comment in a huddle
     */
    private selectPersonasForHuddle;
    /**
     * Get unlocked evolution events for a user
     */
    getUnlockedEvolutions(userId: string, profile: UserProfile | null, personaId?: string): Promise<PersonaEvolutionEvent[]>;
    /**
     * Check if an evolution event should be unlocked
     */
    private checkUnlockCondition;
    /**
     * Mark an evolution event as shared
     */
    markEvolutionShared(userId: string, eventId: string): void;
    /**
     * Get seasonal event for today
     */
    getActiveSeasonalEvent(): SeasonalEvent | null;
    /**
     * Check for user anniversary (Ferniday)
     */
    checkFerniday(profile: UserProfile | null): UserAnniversary | null;
    /**
     * Get cross-persona reference for natural banter
     */
    getCrossPersonaReference(fromPersonaId: string, context?: string): string | null;
    /**
     * Format seasonal response for a persona
     */
    getSeasonalResponse(event: SeasonalEvent, personaId: string): string | null;
}
export declare function getTeamEngagementService(): TeamEngagementService;
export declare function resetTeamEngagementService(): void;
/**
 * Shutdown team engagement service (call on app shutdown)
 */
export declare function shutdownTeamEngagementService(): Promise<void>;
export default TeamEngagementService;
//# sourceMappingURL=team-engagement.d.ts.map