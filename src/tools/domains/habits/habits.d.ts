/**
 * Habit Tracking Tool
 *
 * Daily habit tracking with streaks, accountability, and insights.
 *
 * Features:
 * - Multiple habit tracking
 * - Streak counting
 * - Daily check-ins
 * - Progress visualization
 * - Smart reminders
 */
import { llm } from '@livekit/agents';
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
export type HabitCategory = 'health' | 'fitness' | 'mindfulness' | 'productivity' | 'learning' | 'social' | 'finance' | 'other';
export interface Habit {
    id: string;
    userId: string;
    name: string;
    description?: string;
    category: HabitCategory;
    frequency: HabitFrequency;
    customDays?: number[];
    targetPerDay: number;
    reminderTime?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface HabitLog {
    id: string;
    habitId: string;
    userId: string;
    date: Date;
    completed: boolean;
    count: number;
    notes?: string;
}
declare function getUserHabitsFromCache(userId: string): Habit[];
declare function calculateStreak(habitId: string): number;
declare function getDueHabits(userId: string): Habit[];
export declare function createHabit(params: {
    userId: string;
    name: string;
    description?: string;
    category?: HabitCategory;
    frequency?: HabitFrequency;
    customDays?: number[];
    targetPerDay?: number;
    reminderTime?: string;
}): Promise<Habit>;
export declare function logHabit(params: {
    habitId: string;
    userId: string;
    count?: number;
    notes?: string;
}): HabitLog;
export declare function deleteHabit(habitId: string): boolean;
export { getDueHabits, calculateStreak, getUserHabitsFromCache as getUserHabits };
export declare function createHabitTools(): {
    addHabit: llm.FunctionTool<{
        name: string;
        category: "finance" | "productivity" | "health" | "learning" | "other" | "social" | "fitness" | "mindfulness";
        frequency: "weekly" | "daily" | "weekdays" | "weekends";
        targetPerDay: number;
        reminderTime?: string | undefined;
    }, unknown, string>;
    logHabit: llm.FunctionTool<{
        habitName: string;
        count?: number | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    getDueHabits: llm.FunctionTool<Record<string, never>, unknown, string>;
    getHabitStats: llm.FunctionTool<{
        habitName?: string | undefined;
    }, unknown, string>;
    getAllHabits: llm.FunctionTool<Record<string, never>, unknown, string>;
    removeHabit: llm.FunctionTool<{
        habitName: string;
        confirm: boolean;
    }, unknown, string>;
    habitCheckIn: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createHabitTools;
//# sourceMappingURL=habits.d.ts.map