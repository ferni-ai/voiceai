/**
 * Maya's Superhuman Coaching Services
 *
 * "Better Than Human" persistence layer for Maya's habit coaching capabilities.
 * These services provide the superhuman memory that makes Maya's coaching transcendent.
 *
 * SERVICES:
 *   1. Habit DNA - Complete genetic profile of every habit
 *   2. Friction Mapper - Track where/when habits fail
 *   3. Tendency Profiler - Dynamic Four Tendencies assessment
 *   4. Keystone Detector - Find cascade habits
 *   5. Identity Tracker - "I am someone who..." evolution
 *   6. Setback Archaeologist - Pattern-match failures
 *   7. Habit Autopsy - Post-mortem for dead habits
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/habit_dna
 *   bogle_users/{userId}/friction_points
 *   bogle_users/{userId}/tendency_signals
 *   bogle_users/{userId}/keystone_observations
 *   bogle_users/{userId}/identity_statements
 *   bogle_users/{userId}/setback_patterns
 *   bogle_users/{userId}/habit_autopsies
 */
export interface HabitDNAEvent {
    event: 'started' | 'maintained' | 'struggled' | 'broke' | 'restarted' | 'mastered';
    context?: string;
    triggerOrBarrier?: string;
    emotionalState?: string;
    timeOfDay?: string;
    date: string;
}
export interface HabitDNA {
    habitName: string;
    events: HabitDNAEvent[];
    timesStarted: number;
    timesBroke: number;
    currentStreak: number;
    longestStreak: number;
    commonTriggers: string[];
    commonBarriers: string[];
    optimalConditions?: {
        bestTime?: string;
        bestContext?: string;
        bestMood?: string;
    };
}
export interface FrictionPoint {
    frictionType: 'time' | 'location' | 'energy' | 'social' | 'emotional' | 'environmental' | 'other';
    description: string;
    intensity: 'minor' | 'moderate' | 'major';
    recordedAt: string;
}
export interface TendencySignal {
    signal: string;
    context?: string;
    recordedAt: string;
}
export interface TendencyProfile {
    signals: TendencySignal[];
    primaryTendency: 'Upholder' | 'Questioner' | 'Obliger' | 'Rebel';
    confidence: number;
}
export interface KeystoneObservation {
    observation: string;
    primaryHabit: string;
    affectedHabits: string[];
    recordedAt: string;
}
export interface KeystoneHabit {
    primaryHabit: string;
    affectedHabits: string[];
    observations: KeystoneObservation[];
}
export interface IdentityStatement {
    statement: string;
    domain: string;
    confidence: 'aspiring' | 'emerging' | 'established' | 'core';
    recordedAt: string;
}
export interface SetbackPattern {
    habitName: string;
    whatHappened: string;
    whenItHappened?: string;
    emotionalTrigger?: string;
    recordedAt: string;
}
export interface HabitAutopsy {
    habitName: string;
    howLongItLasted?: string;
    causeOfDeath: string;
    lastRites?: string;
    lessonsLearned?: string;
    willResurrect?: boolean;
    recordedAt: string;
}
export declare function recordHabitDNA(userId: string, habitName: string, event: HabitDNAEvent): Promise<void>;
export declare function getHabitDNA(userId: string, habitName: string): Promise<HabitDNA | null>;
export declare function recordFrictionPoint(userId: string, habitName: string, friction: FrictionPoint): Promise<void>;
export declare function getFrictionPoints(userId: string, habitName?: string): Promise<(FrictionPoint & {
    habitName: string;
})[]>;
export declare function recordTendencySignal(userId: string, signal: TendencySignal): Promise<void>;
export declare function getTendencyProfile(userId: string): Promise<TendencyProfile | null>;
export declare function recordKeystoneObservation(userId: string, observation: KeystoneObservation): Promise<void>;
export declare function getKeystoneHabits(userId: string): Promise<KeystoneHabit[]>;
export declare function recordIdentityStatement(userId: string, statement: IdentityStatement): Promise<void>;
export declare function getIdentityEvolution(userId: string): Promise<IdentityStatement[]>;
export declare function recordSetbackPattern(userId: string, pattern: SetbackPattern): Promise<void>;
export declare function getSetbackPatterns(userId: string, habitName?: string): Promise<SetbackPattern[]>;
export declare function recordHabitAutopsy(userId: string, autopsy: HabitAutopsy): Promise<void>;
export declare function getHabitAutopsies(userId: string): Promise<HabitAutopsy[]>;
/**
 * Build comprehensive coaching context for Maya
 * This aggregates all coaching services into a context injection
 */
export declare function buildMayaCoachingContext(userId: string): Promise<string>;
declare const _default: {
    recordHabitDNA: typeof recordHabitDNA;
    getHabitDNA: typeof getHabitDNA;
    recordFrictionPoint: typeof recordFrictionPoint;
    getFrictionPoints: typeof getFrictionPoints;
    recordTendencySignal: typeof recordTendencySignal;
    getTendencyProfile: typeof getTendencyProfile;
    recordKeystoneObservation: typeof recordKeystoneObservation;
    getKeystoneHabits: typeof getKeystoneHabits;
    recordIdentityStatement: typeof recordIdentityStatement;
    getIdentityEvolution: typeof getIdentityEvolution;
    recordSetbackPattern: typeof recordSetbackPattern;
    getSetbackPatterns: typeof getSetbackPatterns;
    recordHabitAutopsy: typeof recordHabitAutopsy;
    getHabitAutopsies: typeof getHabitAutopsies;
    buildMayaCoachingContext: typeof buildMayaCoachingContext;
};
export default _default;
//# sourceMappingURL=maya-coaching-services.d.ts.map