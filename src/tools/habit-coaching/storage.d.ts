/**
 * Habit Coaching Storage - Persistence layer
 *
 * Handles loading and saving habit coach data using ProductivityStore.
 * Provides caching for performance.
 *
 * @module habit-coaching/storage
 */
import { type EnhancedHabitData } from '../../services/stores/productivity-store.js';
import type { LifeDomain, LifeStage, HabitStack, EnhancedHabit } from './types.js';
export interface UserHabitCoachData {
    userId: string;
    lifeStage: LifeStage;
    domainPriorities: LifeDomain[];
    enhancedHabits: EnhancedHabit[];
    habitStacks: HabitStack[];
    keystoneHabits: string[];
    currentFocus: {
        domain: LifeDomain;
        goal: string;
        startDate: Date;
        habits: string[];
    } | null;
}
/**
 * Get user's habit coach data - loads from ProductivityStore and caches
 */
export declare function getUserCoachData(userId: string): UserHabitCoachData;
/**
 * Save user's habit coach profile to ProductivityStore
 */
export declare function saveUserCoachProfile(userId: string, data: UserHabitCoachData): void;
/**
 * Save an enhanced habit to ProductivityStore
 */
export declare function saveEnhancedHabit(userId: string, habit: EnhancedHabit): void;
/**
 * Save a habit stack to ProductivityStore
 */
export declare function saveHabitStack(userId: string, stack: HabitStack): void;
/**
 * Save a weekly reflection to ProductivityStore
 */
export declare function saveWeeklyReflection(userId: string, reflection: {
    wins: string[];
    challenges: string[];
    insights: string[];
    adjustments: string[];
}): void;
/**
 * Convert stored habit data to runtime format
 */
export declare function storedHabitToRuntime(stored: EnhancedHabitData): EnhancedHabit;
/**
 * Convert runtime habit to stored format
 */
export declare function runtimeHabitToStored(habit: EnhancedHabit): EnhancedHabitData;
/**
 * Clear cached data for a user
 */
export declare function clearUserCache(userId: string): void;
/**
 * Clear all cached data
 */
export declare function clearAllCache(): void;
/**
 * Update cached data
 */
export declare function updateCachedData(userId: string, data: UserHabitCoachData): void;
/**
 * Get cache statistics for monitoring.
 */
export declare function getHabitCoachingStats(): {
    users: number;
    entries: number;
};
/**
 * Register with SessionDataManager (call during initialization).
 */
export declare function registerHabitCoachingWithSessionManager(): Promise<void>;
//# sourceMappingURL=storage.d.ts.map