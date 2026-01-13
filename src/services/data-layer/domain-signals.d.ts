/**
 * Domain Signals
 *
 * Records domain-specific signals for cross-domain correlation.
 * These signals are collected and analyzed by the unified intelligence system.
 *
 * TODO: Integrate with intelligence/unified-intelligence-api.ts
 *
 * @module services/data-layer/domain-signals
 */
export type CalendarSignalType = 'meeting_scheduled' | 'meeting_updated' | 'meeting_cancelled' | 'meeting_attended' | 'meeting_missed' | 'created' | 'updated' | 'deleted' | 'attended' | 'missed';
export interface CalendarSignalMetadata {
    title?: string;
    eventId?: string;
    eventTitle?: string;
    duration?: number;
    hasConflict?: boolean;
    isRecurring?: boolean;
    [key: string]: unknown;
}
/**
 * Record a calendar-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of calendar signal (e.g., 'meeting_scheduled')
 * @param metadata - Additional signal metadata
 */
export declare function recordCalendarSignal(userId: string, signalType: CalendarSignalType, metadata?: CalendarSignalMetadata): void;
export type FinancialSignalType = 'budget_set' | 'budget_updated' | 'spending_logged' | 'savings_progress' | 'savings_goal_progress' | 'goal_achieved' | 'subscription_added' | 'subscription_cancelled';
export interface FinancialSignalMetadata {
    category?: string;
    amount?: number;
    percentageChange?: number;
    budgetRemaining?: number;
    savingsProgress?: number;
    [key: string]: unknown;
}
/**
 * Record a financial-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of financial signal (e.g., 'budget_set', 'savings_goal_progress')
 * @param metadata - Additional signal metadata
 */
export declare function recordFinancialSignal(userId: string, signalType: FinancialSignalType, metadata?: FinancialSignalMetadata): void;
export interface HabitSignalData {
    type: 'completed' | 'missed' | 'streak_broken' | 'streak_milestone' | 'created' | 'paused';
    habitId?: string;
    habitName?: string;
    streakLength?: number;
    completionRate?: number;
}
/**
 * Record a habit-related signal
 */
export declare function recordHabitSignal(userId: string, data: HabitSignalData): void;
export interface TaskSignalData {
    taskId?: string;
    title?: string;
    completed?: boolean;
    category?: string;
    overdue?: boolean;
}
/**
 * Record a task-related signal
 */
export declare function recordTaskSignal(userId: string, signalType: 'created' | 'completed' | 'overdue' | 'updated' | 'deleted', metadata?: TaskSignalData): void;
export interface MilestoneSignalData {
    milestoneId?: string;
    title?: string;
    category?: string;
    daysUntil?: number;
    achieved?: boolean;
}
/**
 * Record a milestone-related signal
 */
export declare function recordMilestoneSignal(userId: string, signalType: 'created' | 'achieved' | 'approaching' | 'updated' | 'missed', metadata?: MilestoneSignalData): void;
export interface EmotionSignalMetadata {
    topic?: string;
    intensity?: number;
    timeOfDay?: string;
    context?: string;
}
/**
 * Record an emotion-related signal
 *
 * @param userId - User ID
 * @param emotion - The detected emotion (e.g., 'joy', 'stress', 'anxiety')
 * @param intensity - Intensity from 0 to 1
 * @param metadata - Additional context
 */
export declare function recordEmotionSignal(userId: string, emotion: string, intensity: number, metadata?: EmotionSignalMetadata): void;
export interface WellnessSignalData {
    type: 'mood_logged' | 'sleep_logged' | 'exercise_logged' | 'stress_detected' | 'energy_low';
    value?: string | number;
    trend?: 'improving' | 'declining' | 'stable';
}
/**
 * Record a wellness-related signal
 */
export declare function recordWellnessSignal(userId: string, data: WellnessSignalData): void;
export interface RelationshipSignalData {
    type: 'contact_added' | 'interaction_logged' | 'relationship_deepened' | 'conflict_detected';
    personName?: string;
    relationshipType?: string;
    interactionQuality?: 'positive' | 'neutral' | 'negative';
}
/**
 * Record a relationship-related signal
 */
export declare function recordRelationshipSignal(userId: string, data: RelationshipSignalData): void;
declare const _default: {
    recordCalendarSignal: typeof recordCalendarSignal;
    recordFinancialSignal: typeof recordFinancialSignal;
    recordHabitSignal: typeof recordHabitSignal;
    recordTaskSignal: typeof recordTaskSignal;
    recordMilestoneSignal: typeof recordMilestoneSignal;
    recordEmotionSignal: typeof recordEmotionSignal;
    recordWellnessSignal: typeof recordWellnessSignal;
    recordRelationshipSignal: typeof recordRelationshipSignal;
};
export default _default;
//# sourceMappingURL=domain-signals.d.ts.map