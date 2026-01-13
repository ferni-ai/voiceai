/**
 * Guest Intelligence System
 *
 * "A human planner doesn't remember that your cousin is vegan and your dad needs wheelchair access."
 *
 * This service maintains permanent memory of guest profiles:
 * - Dietary restrictions and allergies
 * - Accessibility needs
 * - Gift preferences (what they give, what they like)
 * - Seating preferences and social dynamics
 * - Relationship mapping (groups, conflicts, bonds)
 * - Attendance patterns and reliability
 *
 * Better Than Human: Perfect memory of every guest's needs, forever.
 *
 * @module services/superhuman/guest-intelligence
 */
export interface GuestProfile {
    /** Guest's name (primary identifier) */
    name: string;
    /** Alternative names/nicknames */
    aliases: string[];
    /** Relationship to user */
    relationship: string;
    /** Contact info if known */
    email?: string;
    phone?: string;
    /** Dietary needs */
    dietary: {
        restrictions: string[];
        allergies: string[];
        preferences: string[];
        notes?: string;
    };
    /** Accessibility requirements */
    accessibility: {
        mobilityNeeds: string[];
        sensoryNeeds: string[];
        otherNeeds: string[];
        notes?: string;
    };
    /** Gift intelligence */
    gifting: {
        typicalGiftStyle: string;
        averageGiftValue?: number;
        preferencesReceiving: string[];
        avoidGiving: string[];
    };
    /** Social preferences */
    social: {
        seatingPreferences: string[];
        socialStyle: 'introvert' | 'extrovert' | 'ambivert' | 'unknown';
        conversations: string[];
        triggers: string[];
        strengths: string[];
    };
    /** Attendance history */
    attendance: {
        invitedCount: number;
        attendedCount: number;
        declinedCount: number;
        lastMinuteCancelCount: number;
        lastInvited?: string;
        lastAttended?: string;
    };
    /** Metadata */
    createdAt: string;
    updatedAt: string;
    notes: string[];
}
export interface GuestRelationship {
    /** First person in relationship */
    person1: string;
    /** Second person in relationship */
    person2: string;
    /** Type of relationship */
    type: 'conflict' | 'strong_bond' | 'family' | 'colleagues' | 'friends' | 'romantic' | 'unknown';
    /** Strength of relationship (-5 to +5, negative = conflict) */
    strength: number;
    /** Context/reason */
    context: string;
    /** Last updated */
    updatedAt: string;
}
export interface GuestGroup {
    /** Group name */
    name: string;
    /** Members of the group */
    members: string[];
    /** Group type */
    type: 'family' | 'friends' | 'work' | 'school' | 'neighborhood' | 'club' | 'other';
    /** Notes */
    notes?: string;
}
export interface SeatingRecommendation {
    guest: string;
    recommendedNear: Array<{
        guest: string;
        reason: string;
    }>;
    recommendedAway: Array<{
        guest: string;
        reason: string;
    }>;
    tablePreferences: string[];
}
export interface GuestIntelligenceProfile {
    userId: string;
    guests: Record<string, GuestProfile>;
    relationships: GuestRelationship[];
    groups: GuestGroup[];
    lastUpdated: string;
}
declare function loadGuestIntelligence(userId: string): Promise<GuestIntelligenceProfile | null>;
/**
 * Get or create a guest profile
 */
export declare function getGuestProfile(userId: string, guestName: string): Promise<GuestProfile | null>;
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
/**
 * Create or update a guest profile
 */
export declare function upsertGuestProfile(userId: string, guestName: string, updates: DeepPartial<Omit<GuestProfile, 'name' | 'createdAt' | 'updatedAt'>>): Promise<GuestProfile>;
/**
 * Record dietary information for a guest
 */
export declare function recordGuestDietary(userId: string, guestName: string, dietary: DeepPartial<GuestProfile['dietary']>): Promise<void>;
/**
 * Record accessibility needs for a guest
 */
export declare function recordGuestAccessibility(userId: string, guestName: string, accessibility: DeepPartial<GuestProfile['accessibility']>): Promise<void>;
/**
 * Record a relationship between two guests
 */
export declare function recordGuestRelationship(userId: string, person1: string, person2: string, type: GuestRelationship['type'], strength: number, context: string): Promise<void>;
/**
 * Create or update a guest group
 */
export declare function upsertGuestGroup(userId: string, groupName: string, members: string[], type: GuestGroup['type'], notes?: string): Promise<void>;
/**
 * Get seating recommendations for a guest list
 */
export declare function getSeatingRecommendations(userId: string, guestList: string[]): Promise<SeatingRecommendation[]>;
/**
 * Get all dietary requirements for a guest list
 */
export declare function getGuestListDietary(userId: string, guestList: string[]): Promise<{
    vegetarian: string[];
    vegan: string[];
    glutenFree: string[];
    allergies: Array<{
        guest: string;
        allergies: string[];
    }>;
    other: Array<{
        guest: string;
        restrictions: string[];
    }>;
}>;
/**
 * Predict attendance for a guest list
 */
export declare function predictAttendance(userId: string, guestList: string[]): Promise<{
    likely: Array<{
        guest: string;
        rate: number;
    }>;
    unlikely: Array<{
        guest: string;
        rate: number;
        reason: string;
    }>;
    unknown: string[];
    expectedCount: {
        min: number;
        max: number;
        expected: number;
    };
}>;
/**
 * Get a summary of guest intelligence for a guest list
 */
export declare function getGuestListSummary(userId: string, guestList: string[]): Promise<string>;
/**
 * Build context string for LLM injection
 */
export declare function buildGuestIntelligenceContext(userId: string, currentGuestList?: string[]): Promise<string>;
export declare const guestIntelligence: {
    getGuestProfile: typeof getGuestProfile;
    upsertGuestProfile: typeof upsertGuestProfile;
    recordGuestDietary: typeof recordGuestDietary;
    recordGuestAccessibility: typeof recordGuestAccessibility;
    recordGuestRelationship: typeof recordGuestRelationship;
    upsertGuestGroup: typeof upsertGuestGroup;
    getSeatingRecommendations: typeof getSeatingRecommendations;
    getGuestListDietary: typeof getGuestListDietary;
    predictAttendance: typeof predictAttendance;
    getGuestListSummary: typeof getGuestListSummary;
    buildGuestIntelligenceContext: typeof buildGuestIntelligenceContext;
    loadGuestIntelligence: typeof loadGuestIntelligence;
};
export default guestIntelligence;
//# sourceMappingURL=guest-intelligence.d.ts.map