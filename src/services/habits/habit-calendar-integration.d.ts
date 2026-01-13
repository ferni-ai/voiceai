/**
 * Habit-Calendar Integration
 *
 * Correlates habits with calendar patterns for Maya's coaching.
 * This is "better than human" because no coach can:
 * - Track that you skip workouts on busy days
 * - Suggest shorter habits when calendar is packed
 * - Celebrate completing habits on overloaded days
 *
 * @module habits/habit-calendar-integration
 */
export interface HabitCalendarInsight {
    habitId: string;
    habitName: string;
    missedOnHeavyDays: boolean;
    completionRateOnHeavyDays: number;
    completionRateOnLightDays: number;
    calendarCorrelation: 'strong' | 'moderate' | 'weak' | 'none';
    suggestedAdaptation: {
        type: 'shorter_version' | 'different_time' | 'reschedule' | 'none';
        description: string;
        alternativeDuration?: number;
        alternativeTime?: string;
    };
    celebrationContext: {
        wasOnBusyDay: boolean;
        meetingsAroundHabit: number;
        extraPraiseDeserved: boolean;
        celebrationMessage: string | null;
    } | null;
}
export interface HabitRecommendation {
    habitId: string;
    habitName: string;
    suggestion: string;
    reason: string;
    adaptationType: 'shorter' | 'reschedule' | 'skip_ok' | 'normal';
    suggestedDuration?: number;
    suggestedTime?: string;
}
export interface HabitCompletionWithContext {
    habitId: string;
    completedAt: Date;
    calendarContext: {
        dayMeetingHours: number;
        wasOverloaded: boolean;
        hadBackToBack: boolean;
    };
}
interface HabitData {
    id: string;
    name: string;
    duration?: number;
    completedDates?: string[];
    frequency?: 'daily' | 'weekly' | 'weekdays';
}
/**
 * Get calendar-aware insights for a habit
 */
export declare function getHabitCalendarInsights(userId: string, habit: HabitData, completionHistory?: Array<{
    date: Date;
    completed: boolean;
}>): Promise<HabitCalendarInsight>;
/**
 * Get recommendations for tomorrow's habits based on calendar
 */
export declare function getTomorrowHabitRecommendations(userId: string, habits: HabitData[]): Promise<HabitRecommendation[]>;
/**
 * Build Maya coaching context with calendar awareness
 */
export declare function buildHabitCalendarContext(userId: string, habits: HabitData[]): Promise<string>;
/**
 * Convenience function for context builders that need habit-calendar context.
 * Automatically fetches user habits and builds the context.
 */
export declare function getHabitCalendarContextForBuilder(userId: string): Promise<string | null>;
export declare const habitCalendarIntegration: {
    getInsights: typeof getHabitCalendarInsights;
    getTomorrowRecommendations: typeof getTomorrowHabitRecommendations;
    buildContext: typeof buildHabitCalendarContext;
    getContextForBuilder: typeof getHabitCalendarContextForBuilder;
};
export default habitCalendarIntegration;
//# sourceMappingURL=habit-calendar-integration.d.ts.map