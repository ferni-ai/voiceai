/**
 * Milestone Proactive System - Jordan's Engagement Engine
 *
 * Proactive features for milestone planning:
 * - Countdown tracking and urgency detection
 * - Automatic check-in suggestions
 * - Milestone reminder scheduling
 * - Progress encouragement
 *
 * Jordan doesn't just wait to be asked - Jordan reaches out
 * when milestones are approaching and celebrates progress!
 */
import { llm } from '@livekit/agents';
import { type LifeMilestone } from './life-firsts-tracker.js';
export type UrgencyLevel = 'relaxed' | 'normal' | 'attention' | 'urgent' | 'critical';
export interface MilestoneUrgency {
    milestoneId: string;
    milestoneName: string;
    daysUntil: number;
    urgency: UrgencyLevel;
    incompleteTasks: number;
    totalTasks: number;
    progressPercent: number;
    suggestedAction: string;
    urgencyMessage: string;
}
/**
 * Analyze all user milestones and determine urgency
 */
export declare function analyzeUserMilestones(userId: string): Promise<MilestoneUrgency[]>;
/**
 * Get a proactive check-in message for a milestone
 */
export declare function getProactiveCheckIn(milestone: LifeMilestone): string;
/**
 * Get the most urgent milestone that needs attention
 */
export declare function getMostUrgentMilestone(userId: string): Promise<MilestoneUrgency | null>;
/**
 * Generate a summary of all upcoming milestones
 */
export declare function getMilestonesSummary(userId: string): Promise<string>;
export declare function createMilestoneProactiveTools(): {
    checkMilestoneUrgency: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    getProactiveCheckIn: llm.FunctionTool<{
        milestoneName: string;
        userId: string;
    }, unknown, string>;
    getMilestoneCountdownMessage: llm.FunctionTool<{
        milestoneName: string;
        userId: string;
    }, unknown, string>;
    getSuggestedTasks: llm.FunctionTool<{
        milestoneName: string;
        count: number;
        userId: string;
    }, unknown, string>;
    celebrateMilestoneProgress: llm.FunctionTool<{
        milestoneName: string;
        userId: string;
    }, unknown, string>;
    getAllMilestonesSummary: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    checkBirthdayReminders: llm.FunctionTool<{
        userId: string;
        daysAhead: number;
    }, unknown, string>;
    checkMilestoneAnniversaries: llm.FunctionTool<{
        userId: string;
        daysAhead: number;
    }, unknown, string>;
    scheduleProactiveCheckIn: llm.FunctionTool<{
        milestoneName: string;
        checkInDate: string;
        userId: string;
        message?: string | undefined;
    }, unknown, string>;
};
export default createMilestoneProactiveTools;
//# sourceMappingURL=milestone-proactive.d.ts.map