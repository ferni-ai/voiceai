/**
 * Habit Coaching Storage - Persistence layer
 *
 * Handles loading and saving habit coach data using ProductivityStore.
 * Provides caching for performance.
 *
 * @module habit-coaching/storage
 */
import { getLogger } from '../../utils/safe-logger.js';
import { getProductivityStore, } from '../../services/stores/productivity-store.js';
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
// In-memory cache that syncs with ProductivityStore
const userCoachDataCache = new Map();
// ============================================================================
// DATA LOADING
// ============================================================================
/**
 * Get user's habit coach data - loads from ProductivityStore and caches
 */
export function getUserCoachData(userId) {
    // Check cache first
    if (userCoachDataCache.has(userId)) {
        return userCoachDataCache.get(userId);
    }
    const store = getProductivityStore();
    const profile = store.getHabitCoachProfile(userId);
    const enhancedHabits = store.getUserEnhancedHabits(userId);
    const habitStacks = store.getUserHabitStacks(userId);
    // Convert stored data to runtime format
    const data = {
        userId,
        lifeStage: (profile?.lifeStage || 'early_career'),
        domainPriorities: (profile?.domainPriorities || [
            'health',
            'career',
            'finance',
            'relationships',
        ]),
        enhancedHabits: enhancedHabits.map((h) => storedHabitToRuntime(h)),
        habitStacks: habitStacks.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            anchorHabit: s.anchorHabit,
            newHabits: s.newHabits,
            totalDuration: s.totalDuration,
            bestTimeOfDay: s.bestTimeOfDay,
        })),
        keystoneHabits: profile?.keystoneHabits || [],
        currentFocus: profile?.currentFocus
            ? {
                domain: profile.currentFocus.domain,
                goal: profile.currentFocus.goal,
                startDate: new Date(profile.currentFocus.startDate),
                habits: profile.currentFocus.habits,
            }
            : null,
    };
    userCoachDataCache.set(userId, data);
    return data;
}
// ============================================================================
// DATA SAVING
// ============================================================================
/**
 * Save user's habit coach profile to ProductivityStore
 */
export function saveUserCoachProfile(userId, data) {
    const store = getProductivityStore();
    const profile = {
        lifeStage: data.lifeStage,
        domainPriorities: data.domainPriorities,
        keystoneHabits: data.keystoneHabits,
        currentFocus: data.currentFocus
            ? {
                domain: data.currentFocus.domain,
                goal: data.currentFocus.goal,
                startDate: data.currentFocus.startDate.toISOString(),
                habits: data.currentFocus.habits,
            }
            : null,
        assessmentHistory: [], // Stored separately in weekly reflections
    };
    store.setHabitCoachProfile(userId, profile);
    getLogger().debug({ userId }, 'Saved habit coach profile');
}
/**
 * Save an enhanced habit to ProductivityStore
 */
export function saveEnhancedHabit(userId, habit) {
    const store = getProductivityStore();
    store.setEnhancedHabit(userId, runtimeHabitToStored(habit));
}
/**
 * Save a habit stack to ProductivityStore
 */
export function saveHabitStack(userId, stack) {
    const store = getProductivityStore();
    const stackData = {
        id: stack.id,
        name: stack.name,
        description: stack.description,
        anchorHabit: stack.anchorHabit,
        newHabits: stack.newHabits,
        totalDuration: stack.totalDuration,
        bestTimeOfDay: stack.bestTimeOfDay,
    };
    store.setHabitStack(userId, stackData);
}
/**
 * Save a weekly reflection to ProductivityStore
 */
export function saveWeeklyReflection(userId, reflection) {
    const store = getProductivityStore();
    const reflectionData = {
        id: `reflection_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date: new Date().toISOString(),
        wins: reflection.wins,
        challenges: reflection.challenges,
        insights: reflection.insights,
        adjustments: reflection.adjustments,
    };
    store.addWeeklyReflection(userId, reflectionData);
}
// ============================================================================
// DATA CONVERTERS
// ============================================================================
/**
 * Convert stored habit data to runtime format
 */
export function storedHabitToRuntime(stored) {
    return {
        id: stored.id,
        userId: stored.userId || '',
        name: stored.name,
        description: stored.description,
        domain: stored.domain,
        subdomain: stored.subdomain,
        currentLevel: stored.currentLevel,
        targetLevel: stored.targetLevel,
        levelStartDate: new Date(stored.levelStartDate),
        levelHistory: stored.levelHistory.map((l) => ({
            level: l.level,
            achievedAt: new Date(l.achievedAt),
        })),
        habitLoop: stored.habitLoop,
        stackedOnto: stored.stackedOnto,
        isAnchorFor: stored.isAnchorFor,
        isKeystone: stored.isKeystone,
        keystoneScore: stored.keystoneScore,
        cascadeEffects: stored.cascadeEffects,
        frequency: stored.frequency,
        customDays: stored.customDays,
        targetPerDay: stored.targetPerDay,
        currentStreak: stored.currentStreak,
        longestStreak: stored.longestStreak,
        totalCompletions: stored.totalCompletions,
        successRate: stored.successRate,
        reminderTime: stored.reminderTime,
        bestPerformanceTime: stored.bestPerformanceTime,
        isActive: stored.isActive,
        isPaused: stored.isPaused,
        pauseReason: stored.pauseReason,
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
        tags: stored.tags,
        notes: stored.notes,
    };
}
/**
 * Convert runtime habit to stored format
 */
export function runtimeHabitToStored(habit) {
    return {
        id: habit.id,
        name: habit.name,
        description: habit.description,
        domain: habit.domain,
        subdomain: habit.subdomain,
        currentLevel: habit.currentLevel,
        targetLevel: habit.targetLevel,
        levelStartDate: habit.levelStartDate.toISOString(),
        levelHistory: habit.levelHistory.map((l) => ({
            level: l.level,
            achievedAt: l.achievedAt.toISOString(),
        })),
        habitLoop: habit.habitLoop ?? {
            cue: { type: 'time', description: '', specificity: '' },
            routine: { behavior: habit.name, duration: 5, difficulty: 'easy' },
            reward: { intrinsic: 'Sense of accomplishment', celebration: '' },
        },
        stackedOnto: habit.stackedOnto,
        isAnchorFor: habit.isAnchorFor,
        isKeystone: habit.isKeystone,
        keystoneScore: habit.keystoneScore,
        cascadeEffects: habit.cascadeEffects,
        frequency: habit.frequency,
        customDays: habit.customDays,
        targetPerDay: habit.targetPerDay,
        currentStreak: habit.currentStreak,
        longestStreak: habit.longestStreak,
        totalCompletions: habit.totalCompletions,
        successRate: habit.successRate,
        reminderTime: habit.reminderTime,
        bestPerformanceTime: habit.bestPerformanceTime,
        isActive: habit.isActive,
        isPaused: habit.isPaused,
        pauseReason: habit.pauseReason,
        createdAt: habit.createdAt.toISOString(),
        updatedAt: habit.updatedAt.toISOString(),
        tags: habit.tags ?? [],
        notes: habit.notes,
    };
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
/**
 * Clear cached data for a user
 */
export function clearUserCache(userId) {
    userCoachDataCache.delete(userId);
    getLogger().debug({ userId }, '🧹 HabitCoaching user cache cleared');
}
/**
 * Clear all cached data
 */
export function clearAllCache() {
    userCoachDataCache.clear();
    getLogger().info('🧹 HabitCoaching all caches cleared');
}
/**
 * Update cached data
 */
export function updateCachedData(userId, data) {
    userCoachDataCache.set(userId, data);
}
/**
 * Get cache statistics for monitoring.
 */
export function getHabitCoachingStats() {
    return { users: userCoachDataCache.size, entries: userCoachDataCache.size };
}
/**
 * Register with SessionDataManager (call during initialization).
 */
export async function registerHabitCoachingWithSessionManager() {
    try {
        const { getSessionDataManager } = await import('../../services/session-data-manager.js');
        getSessionDataManager().registerService({
            name: 'HabitCoaching',
            clearUserData: clearUserCache,
            clearAllData: clearAllCache,
            getStats: getHabitCoachingStats,
        });
    }
    catch {
        // SessionDataManager may not be initialized yet
        getLogger().debug('SessionDataManager not available for HabitCoaching registration');
    }
}
//# sourceMappingURL=storage.js.map