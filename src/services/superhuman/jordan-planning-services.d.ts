/**
 * Jordan's Superhuman Planning Services
 *
 * "Better Than Human" persistence layer for Jordan's event planning capabilities.
 * These services provide the superhuman memory that makes Jordan's planning transcendent.
 *
 * SERVICES:
 *   1. Event Pattern Memory - Patterns across all events
 *   2. Guest Intelligence - Permanent guest profiles
 *   3. Milestone Detection - Find forgotten celebrations
 *   4. Event Story Capture - What events MEANT
 *   5. Celebration Balance - Track joy gaps
 *   6. Anticipatory Sense - See transitions coming
 *   7. Planning Readiness - Cross-team assessment
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/event_patterns
 *   bogle_users/{userId}/guest_profiles
 *   bogle_users/{userId}/detected_milestones
 *   bogle_users/{userId}/event_meanings
 *   bogle_users/{userId}/celebrations
 *   bogle_users/{userId}/transition_signals
 */
export interface EventPattern {
    eventType: string;
    patternType: string;
    eventName: string;
    pattern: string;
    lesson?: string;
    recordedAt: string;
}
export interface GuestProfile {
    name: string;
    dietary?: string;
    accessibility?: string;
    note?: string;
    avoidSeatingWith?: string[];
    attendanceHistory?: string[];
    updatedAt: string;
}
export interface DetectedMilestone {
    type: string;
    description: string;
    date: string;
    recurring: boolean;
    recordedAt: string;
}
export interface EventMeaning {
    eventName: string;
    meaning?: string;
    memorableMoment?: string;
    lessonLearned?: string;
    recordedAt: string;
}
export interface Celebration {
    what: string;
    forWhom: 'self' | 'other' | 'both';
    size: 'micro' | 'small' | 'medium' | 'large';
    recordedAt: string;
}
export interface CelebrationBalance {
    total: number;
    forSelf: number;
    forOthers: number;
    bySize: {
        micro: number;
        small: number;
        medium: number;
        large: number;
    };
}
export interface TransitionSignal {
    type: string;
    signal: string;
    strength: 'weak' | 'moderate' | 'strong';
    recordedAt: string;
}
export interface AnticipatedTransition {
    type: string;
    signals: string[];
    strength: 'weak' | 'moderate' | 'strong';
    signalCount: number;
    lastSignalAt: string;
}
export interface PlanningReadiness {
    overall: 'green' | 'yellow' | 'red';
    financial: 'green' | 'yellow' | 'red';
    calendar: 'green' | 'yellow' | 'red';
    energy: 'green' | 'yellow' | 'red';
    emotional: 'green' | 'yellow' | 'red';
    concerns: string[];
    suggestions: string[];
}
export declare function recordEventPattern(userId: string, pattern: EventPattern): Promise<void>;
export declare function getEventPatterns(userId: string, eventType?: string, patternType?: string): Promise<EventPattern[]>;
export declare function recordGuestProfile(userId: string, guest: GuestProfile): Promise<void>;
export declare function getGuestProfiles(userId: string, guestName?: string): Promise<GuestProfile[]>;
export declare function recordMilestoneDetection(userId: string, milestone: DetectedMilestone): Promise<void>;
export declare function getDetectedMilestones(userId: string): Promise<DetectedMilestone[]>;
export declare function recordEventMeaning(userId: string, meaning: EventMeaning): Promise<void>;
export declare function getEventMeanings(userId: string, eventName?: string): Promise<EventMeaning[]>;
export declare function recordCelebration(userId: string, celebration: Celebration): Promise<void>;
export declare function getCelebrationBalance(userId: string): Promise<CelebrationBalance>;
export declare function recordTransitionSignal(userId: string, signal: TransitionSignal): Promise<void>;
export declare function getAnticipatedTransitions(userId: string): Promise<AnticipatedTransition[]>;
export declare function checkPlanningReadiness(userId: string, eventType: string): Promise<PlanningReadiness>;
export declare function buildJordanPlanningContext(userId: string): Promise<string>;
declare const _default: {
    recordEventPattern: typeof recordEventPattern;
    getEventPatterns: typeof getEventPatterns;
    recordGuestProfile: typeof recordGuestProfile;
    getGuestProfiles: typeof getGuestProfiles;
    recordMilestoneDetection: typeof recordMilestoneDetection;
    getDetectedMilestones: typeof getDetectedMilestones;
    recordEventMeaning: typeof recordEventMeaning;
    getEventMeanings: typeof getEventMeanings;
    recordCelebration: typeof recordCelebration;
    getCelebrationBalance: typeof getCelebrationBalance;
    recordTransitionSignal: typeof recordTransitionSignal;
    getAnticipatedTransitions: typeof getAnticipatedTransitions;
    checkPlanningReadiness: typeof checkPlanningReadiness;
    buildJordanPlanningContext: typeof buildJordanPlanningContext;
};
export default _default;
//# sourceMappingURL=jordan-planning-services.d.ts.map