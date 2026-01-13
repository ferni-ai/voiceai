/**
 * Context Integration for Simple Utilities
 *
 * Connects utilities to what Ferni already knows about the user:
 * - Life events and milestones
 * - Goals and habits
 * - Travel plans
 * - Relationships and important dates
 *
 * This transforms generic utilities into personalized help:
 * "90 days from now" → "90 days - that's right before your marathon!"
 */
export interface LifeContext {
    upcomingEvents: Array<{
        name: string;
        date: Date;
        type: 'milestone' | 'event' | 'deadline' | 'celebration';
        linkedGoal?: string;
    }>;
    activeGoals: Array<{
        name: string;
        targetDate?: Date;
        category: string;
    }>;
    importantPeople: Array<{
        name: string;
        relationship: string;
        birthday?: Date;
        anniversary?: Date;
        timezone?: string;
    }>;
    travelPlans: Array<{
        destination: string;
        startDate: Date;
        endDate: Date;
    }>;
    activeRoutines: Array<{
        name: string;
        schedule: string;
        linkedTimer?: {
            minutes: number;
            label: string;
        };
    }>;
}
/**
 * Load life context for a user from various services
 */
export declare function loadLifeContext(userId: string): Promise<LifeContext>;
/**
 * Enrich a countdown response with life context
 */
export declare function enrichCountdownWithContext(daysUntil: number, targetDate: Date, lifeContext: LifeContext): string | null;
/**
 * Enrich a timezone lookup with relationship context
 */
export declare function enrichTimezoneWithContext(city: string, lifeContext: LifeContext): string | null;
/**
 * Enrich a timer with habit context
 */
export declare function enrichTimerWithContext(minutes: number, label: string | undefined, lifeContext: LifeContext): string | null;
/**
 * Get upcoming birthdays from context
 */
export declare function getUpcomingBirthdays(lifeContext: LifeContext, withinDays?: number): Array<{
    name: string;
    relationship: string;
    daysUntil: number;
}>;
/**
 * Get upcoming anniversaries from context
 */
export declare function getUpcomingAnniversaries(lifeContext: LifeContext, withinDays?: number): Array<{
    name: string;
    daysUntil: number;
    years: number;
}>;
declare const _default: {
    loadLifeContext: typeof loadLifeContext;
    enrichCountdownWithContext: typeof enrichCountdownWithContext;
    enrichTimezoneWithContext: typeof enrichTimezoneWithContext;
    enrichTimerWithContext: typeof enrichTimerWithContext;
    getUpcomingBirthdays: typeof getUpcomingBirthdays;
    getUpcomingAnniversaries: typeof getUpcomingAnniversaries;
};
export default _default;
//# sourceMappingURL=context-integration.d.ts.map