/**
 * Social Battery Tracker - Better Than Human Energy Management
 *
 * Tracks and predicts social energy levels:
 * - Current battery level based on recent social interactions
 * - Drain rate (how fast social events deplete energy)
 * - Recharge rate (how fast they recover alone)
 * - Warning when approaching depletion
 *
 * WHY IT'S SUPERHUMAN: No friend tracks your social capacity and warns
 * you before you overcommit. Ferni knows when you're "peopled out."
 *
 * @module services/superhuman/social-battery
 */
export type SocialEventType = 'large_gathering' | 'small_group' | 'one_on_one' | 'family' | 'work_meeting' | 'deep_conversation' | 'casual_chat' | 'conflict' | 'alone_time';
export interface SocialEvent {
    userId: string;
    type: SocialEventType;
    durationMinutes: number;
    energyImpact: number;
    timestamp: number;
    context?: string;
}
export interface SocialBatteryState {
    /** Current battery level 0-100 */
    currentLevel: number;
    /** Average drain per hour of social activity */
    drainRatePerHour: number;
    /** Average recharge per hour of alone time */
    rechargeRatePerHour: number;
    /** Hours of alone time needed to fully recharge */
    fullRechargeHours: number;
    /** Warning threshold (suggest declining invitations below this) */
    warningThreshold: number;
    /** Introvert/extrovert tendency (0 = extreme introvert, 1 = extreme extrovert) */
    socialTendency: number;
    /** Last updated */
    lastUpdated: number;
}
export interface SocialBatteryProfile {
    /** How draining are different event types for this person */
    eventCosts: Record<SocialEventType, number>;
    /** What's their baseline capacity (some people have bigger batteries) */
    maxCapacity: number;
    /** How fast do they recover */
    recoveryMultiplier: number;
    /** Peak social hours (when they handle social events best) */
    peakSocialHours: number[];
}
/**
 * Calculate current battery level based on recent events.
 */
export declare function calculateBatteryLevel(events: SocialEvent[], profile: SocialBatteryProfile, lastKnownLevel?: number): number;
/**
 * Determine social tendency from event history.
 */
export declare function calculateSocialTendency(events: SocialEvent[]): number;
/**
 * Record a social event.
 */
export declare function recordSocialEvent(userId: string, type: SocialEventType, durationMinutes: number, context?: string): Promise<void>;
/**
 * Load recent social events.
 */
export declare function loadSocialEvents(userId: string, daysBack?: number): Promise<SocialEvent[]>;
/**
 * Get or create social battery profile.
 */
export declare function getSocialBatteryProfile(userId: string): Promise<SocialBatteryProfile>;
/**
 * Get current social battery state.
 */
export declare function getSocialBatteryState(userId: string): Promise<SocialBatteryState>;
/**
 * Build context for LLM injection.
 */
export declare function buildSocialBatteryContext(userId: string): Promise<string>;
export declare const socialBattery: {
    record: typeof recordSocialEvent;
    load: typeof loadSocialEvents;
    getState: typeof getSocialBatteryState;
    getProfile: typeof getSocialBatteryProfile;
    calculateLevel: typeof calculateBatteryLevel;
    buildContext: typeof buildSocialBatteryContext;
};
//# sourceMappingURL=social-battery.d.ts.map