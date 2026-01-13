/**
 * Habit Reminder Executor
 *
 * Maya's domain - triggers habit reminders in the background.
 * "BETTER THAN HUMAN" - We remember your commitments even when you forget.
 *
 * Features:
 * - Sends gentle nudges for habits
 * - Tracks streak status
 * - Adapts timing based on user patterns
 */
import type { ResultPriority } from '../result-types.js';
export interface HabitReminderRequest {
    userId: string;
    sessionId?: string;
    habitId: string;
    habitName: string;
    reminderType: 'gentle_nudge' | 'streak_warning' | 'celebration' | 'check_in';
    currentStreak?: number;
    scheduledTime?: string;
    context?: string;
    initiatedBy?: string;
    priority?: ResultPriority;
}
export interface HabitReminderResult {
    sent: boolean;
    habitId: string;
    habitName: string;
    reminderType: string;
    currentStreak?: number;
    message: string;
}
/**
 * Execute a habit reminder task.
 */
export declare function executeHabitReminder(request: HabitReminderRequest): Promise<HabitReminderResult>;
/**
 * Queue a habit reminder for background execution.
 */
export declare function queueHabitReminder(request: HabitReminderRequest): Promise<string>;
//# sourceMappingURL=habit-reminder-executor.d.ts.map