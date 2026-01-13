/**
 * Milestone-Calendar Coordinator - Better Than Human Service
 *
 * What no human friend can do: Coordinate milestone planning with calendar
 * awareness at the same time, considering capacity and optimal windows.
 *
 * This service bridges life planning (milestones) with communication (calendar)
 * to provide:
 * - Calendar-aware milestone planning
 * - Optimal time windows for milestone work
 * - Conflict detection between milestones and commitments
 * - Capacity assessment for new milestones
 *
 * @module services/superhuman/milestone-calendar-coordinator
 */
export interface TimeWindow {
    date: Date;
    startHour: number;
    endHour: number;
    durationHours: number;
    quality: 'ideal' | 'good' | 'acceptable' | 'constrained';
    reason: string;
}
export interface MilestoneConflict {
    milestoneId: string;
    milestoneName: string;
    targetDate: Date;
    conflictType: 'heavy_calendar' | 'other_milestone' | 'commitment' | 'capacity';
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggestion: string;
}
export interface CapacityAssessment {
    userId: string;
    assessedAt: Date;
    currentLoad: 'light' | 'moderate' | 'heavy' | 'overloaded';
    activeMilestones: number;
    calendarLoadPercent: number;
    canTakeNewMilestone: boolean;
    recommendation: string;
    optimalStartDate?: Date;
}
export interface MilestoneTimeBlock {
    milestoneId: string;
    milestoneName: string;
    suggestedBlocks: Array<{
        date: Date;
        startHour: number;
        durationHours: number;
        purpose: 'planning' | 'execution' | 'review';
    }>;
    totalHoursNeeded: number;
    hoursAvailable: number;
    feasibility: 'easy' | 'moderate' | 'challenging' | 'unlikely';
}
export interface SimpleMilestone {
    id: string;
    name: string;
    targetDate: Date;
    importance: 'high' | 'medium' | 'low';
    estimatedHours?: number;
}
/**
 * Find optimal time windows for milestone work in the next N days.
 */
export declare function findOptimalMilestoneWindows(userId: string, options?: {
    daysAhead?: number;
    minDurationHours?: number;
    preferMornings?: boolean;
}): Promise<TimeWindow[]>;
/**
 * Suggest time blocks for a specific milestone.
 */
export declare function suggestTimeBlocks(userId: string, milestone: SimpleMilestone): Promise<MilestoneTimeBlock>;
/**
 * Detect conflicts between milestones and calendar.
 */
export declare function detectMilestoneConflicts(userId: string, milestones: SimpleMilestone[]): Promise<MilestoneConflict[]>;
/**
 * Assess capacity for taking on a new milestone.
 */
export declare function getCapacityForNewMilestone(userId: string, activeMilestones: SimpleMilestone[]): Promise<CapacityAssessment>;
/**
 * Generate a coordination summary for milestone ↔ calendar handoff.
 */
export declare function getCoordinationContext(userId: string, milestones: SimpleMilestone[]): Promise<string>;
//# sourceMappingURL=milestone-calendar-coordinator.d.ts.map