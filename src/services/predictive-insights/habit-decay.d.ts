/**
 * Habit Decay Early Warning
 *
 * > "Your morning meditation has gone from daily to 3x/week.
 * > That's often how habits unravel. Want to troubleshoot?"
 *
 * Detects habit frequency decline BEFORE complete abandonment,
 * catching the inflection point where intervention is still easy.
 *
 * @module PredictiveInsights/HabitDecay
 */
import type { HabitIntervention } from './types.js';
export interface HabitDecayWarning {
    userId: string;
    habitId: string;
    habitName: string;
    /** Current frequency (times per week) */
    currentFrequency: number;
    /** Previous frequency (times per week) */
    previousFrequency: number;
    /** Rate of decay (0-1, higher = faster decay) */
    decayRate: number;
    /** Estimated days until complete abandonment */
    daysUntilAbandonment: number;
    /** Human-friendly message */
    message: string;
    /** Suggestion */
    suggestion: string;
    /** Specific interventions that might help */
    interventions: HabitIntervention[];
    /** Confidence (0-1) */
    confidence: number;
    /** Should surface */
    shouldSurface: boolean;
}
interface HabitCompletion {
    date: Date;
    completed: boolean;
    duration?: number;
    notes?: string;
}
interface TrackedHabit {
    id: string;
    name: string;
    category: 'health' | 'productivity' | 'mindfulness' | 'social' | 'learning' | 'other';
    targetFrequency: number;
    completions: HabitCompletion[];
    createdAt: Date;
    currentStreak: number;
    longestStreak: number;
}
/**
 * Detect decaying habits for a user
 */
export declare function detectHabitDecay(userId: string): Promise<HabitDecayWarning[]>;
/**
 * Record a habit completion
 */
export declare function recordHabitCompletion(userId: string, habitId: string, completed: boolean, duration?: number, notes?: string): void;
/**
 * Add a habit to track
 */
export declare function addHabitToTrack(userId: string, habitId: string, name: string, category: TrackedHabit['category'], targetFrequency?: number): void;
/**
 * Get tracked habits for a user
 */
export declare function getTrackedHabits(userId: string): Array<{
    id: string;
    name: string;
    currentStreak: number;
    completionRate: number;
}>;
/**
 * Clear habit data for a user
 */
export declare function clearHabitData(userId: string): void;
declare const _default: {
    detectHabitDecay: typeof detectHabitDecay;
    recordHabitCompletion: typeof recordHabitCompletion;
    addHabitToTrack: typeof addHabitToTrack;
    getTrackedHabits: typeof getTrackedHabits;
    clearHabitData: typeof clearHabitData;
};
export default _default;
//# sourceMappingURL=habit-decay.d.ts.map