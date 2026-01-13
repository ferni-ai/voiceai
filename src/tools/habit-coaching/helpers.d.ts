/**
 * Helper Functions for Habit Coaching
 *
 * Utility functions for habit diagnosis, motivation, and analysis.
 *
 * @module habit-coaching/helpers
 */
import type { HabitDiagnosis, MotivationalContent, MoodLog, MoodPatterns, SetbackLog } from './types.js';
/**
 * Generate friction tips for breaking bad habits
 */
export declare function generateFrictionTips(badHabit: string): string[];
/**
 * Detect patterns in setback logs
 */
export declare function detectSetbackPattern(setbacks: SetbackLog[]): string | null;
/**
 * Diagnose why a habit isn't working
 */
export declare function diagnoseHabitFailure(failurePoint: 'never_start' | 'start_then_stop' | 'inconsistent' | 'hate_it' | 'forget', currentCue?: string, currentReward?: string): HabitDiagnosis;
/**
 * Get motivational content based on type
 */
export declare function getMotivationalContent(type: string, context?: string, _struggle?: string): MotivationalContent;
/**
 * Analyze mood patterns over time
 */
export declare function analyzeMoodPatterns(moodLogs: MoodLog[]): MoodPatterns;
/**
 * Get encouragement based on progress
 */
export declare function getEncouragement(avgStreak: number, wins: number): string;
/**
 * Get tips based on current mood and energy
 */
export declare function getMoodBasedTip(mood: string, energy: string, _timeOfDay: string): string;
/**
 * Get encouragement message for challenge day
 */
export declare function getChallengeDayEncouragement(day: number): string;
/**
 * Check for challenge milestones
 */
export declare function checkChallengeMilestones(day: number, completedDays: number): string | null;
//# sourceMappingURL=helpers.d.ts.map