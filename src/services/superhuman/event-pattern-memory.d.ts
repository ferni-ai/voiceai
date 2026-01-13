/**
 * Event Pattern Memory Service
 *
 * "Your wedding planner doesn't remember your sister's graduation party 3 years ago."
 *
 * This service tracks patterns across ALL events over years:
 * - Budget tendencies (overruns, splurge categories, regret categories)
 * - Guest dynamics (chronic decliners, conflict pairs, reliability)
 * - Emotional patterns (pre-event anxiety, post-event letdown)
 * - Vendor preferences (loved vendors, vendors to avoid)
 *
 * Better Than Human: Perfect memory across all life events, forever.
 *
 * @module services/superhuman/event-pattern-memory
 */
export interface BudgetPattern {
    /** Average percentage over/under budget (positive = overrun) */
    averageOverrunPercent: number;
    /** Categories where user consistently overspends */
    splurgeCategories: string[];
    /** Categories where user regrets underspending */
    regretCategories: string[];
    /** Categories where user stays on budget */
    disciplinedCategories: string[];
    /** Total events analyzed */
    eventsAnalyzed: number;
}
export interface GuestDynamics {
    /** Guests who almost always decline */
    chronicDecliners: Array<{
        name: string;
        declineRate: number;
    }>;
    /** Guests who RSVP yes but cancel last minute */
    lastMinuteCancelers: Array<{
        name: string;
        cancelRate: number;
    }>;
    /** Pairs of guests who should NOT be seated together */
    conflictPairs: Array<{
        person1: string;
        person2: string;
        reason: string;
    }>;
    /** Pairs who energize each other */
    dynamicDuos: Array<{
        person1: string;
        person2: string;
        context: string;
    }>;
    /** Guests the user regretted not inviting */
    regrettedOmissions: Array<{
        name: string;
        event: string;
        reason: string;
    }>;
    /** Guests who always add value */
    reliableStars: Array<{
        name: string;
        strength: string;
    }>;
}
export interface EmotionalPattern {
    /** Does user typically get anxious 2 weeks before events? */
    twoWeeksOutAnxiety: boolean;
    /** Does user typically feel let down after events? */
    postEventLetdown: boolean;
    /** Planning tasks that energize the user */
    energizingTasks: string[];
    /** Planning tasks that drain the user */
    drainingTasks: string[];
    /** Typical stress peak (days before event) */
    stressPeakDaysBefore: number;
    /** Coping strategies that worked */
    effectiveCopingStrategies: string[];
}
export interface VendorPreference {
    name: string;
    category: string;
    sentiment: 'loved' | 'neutral' | 'avoid';
    reason: string;
    lastUsed: string;
    eventType?: string;
}
export interface EventOutcome {
    eventId: string;
    eventName: string;
    eventType: string;
    eventDate: string;
    budget: number;
    actualSpent: number;
    guestCountPlanned: number;
    guestCountActual: number;
    /** Category breakdown of spending */
    categorySpending: Record<string, {
        budgeted: number;
        actual: number;
    }>;
    /** Guest attendance outcomes */
    guestOutcomes: Array<{
        name: string;
        invited: boolean;
        rsvp: 'yes' | 'no' | 'maybe' | 'no_response';
        attended: boolean;
        canceledLastMinute?: boolean;
    }>;
    /** Vendors used */
    vendors: VendorPreference[];
    /** Post-event reflections */
    reflections: {
        whatWorked: string[];
        whatWouldChange: string[];
        unexpectedJoys: string[];
        unexpectedChallenges: string[];
        emotionalJourney?: string;
    };
    /** User's emotional state during planning */
    emotionalTimeline?: Array<{
        daysBefore: number;
        emotion: string;
        notes?: string;
    }>;
    createdAt: string;
}
export interface EventPatternProfile {
    userId: string;
    budgetPatterns: BudgetPattern;
    guestDynamics: GuestDynamics;
    emotionalPatterns: EmotionalPattern;
    vendorPreferences: VendorPreference[];
    eventHistory: EventOutcome[];
    lastUpdated: string;
}
declare function loadEventPatternProfile(userId: string): Promise<EventPatternProfile | null>;
/**
 * Record an event outcome for pattern learning
 */
export declare function recordEventOutcome(userId: string, outcome: EventOutcome): Promise<void>;
/**
 * Record a guest conflict observation
 */
export declare function recordGuestConflict(userId: string, person1: string, person2: string, reason: string): Promise<void>;
/**
 * Record a regretted omission (didn't invite someone, regretted it)
 */
export declare function recordRegrettedOmission(userId: string, name: string, event: string, reason: string): Promise<void>;
/**
 * Record a vendor experience
 */
export declare function recordVendorExperience(userId: string, vendor: VendorPreference): Promise<void>;
/**
 * Get event pattern insights for planning a new event
 */
export declare function getEventPatternInsights(userId: string, eventType?: string): Promise<{
    budgetWarnings: string[];
    guestRecommendations: string[];
    emotionalPrepTips: string[];
    vendorRecommendations: string[];
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildEventPatternContext(userId: string): Promise<string>;
export declare const eventPatternMemory: {
    recordEventOutcome: typeof recordEventOutcome;
    recordGuestConflict: typeof recordGuestConflict;
    recordRegrettedOmission: typeof recordRegrettedOmission;
    recordVendorExperience: typeof recordVendorExperience;
    getEventPatternInsights: typeof getEventPatternInsights;
    buildEventPatternContext: typeof buildEventPatternContext;
    loadEventPatternProfile: typeof loadEventPatternProfile;
};
export default eventPatternMemory;
//# sourceMappingURL=event-pattern-memory.d.ts.map