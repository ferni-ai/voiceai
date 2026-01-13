/**
 * Commitment-Calendar Integration
 *
 * Validates commitments against calendar reality and creates calendar blocks.
 * This is "better than human" because no assistant:
 * - Validates if you actually have time for a commitment
 * - Auto-creates calendar blocks for commitments
 * - Warns when calendar changes conflict with commitments
 *
 * @module superhuman/commitment-calendar-integration
 */
import { type CalendarEvent, type TimeSlot } from '../calendar/calendar-service.js';
import type { Commitment } from './commitment-keeper.js';
export interface CommitmentFeasibility {
    feasible: boolean;
    score: number;
    conflicts: string[];
    suggestedSlots: TimeSlot[];
    suggestion: string | null;
    alternativeCommitment: string | null;
}
export interface CommitmentConflict {
    commitmentId: string;
    commitmentText: string;
    conflictingEvent: Partial<CalendarEvent>;
    severity: 'blocked' | 'reduced' | 'at_risk';
    suggestion: string;
}
export interface CommitmentCalendarBlock {
    commitmentId: string;
    eventIds: string[];
    blockedMinutesTotal: number;
}
/**
 * Validate if a commitment is feasible given the user's calendar
 *
 * This is the core "better than human" function - we check if the user
 * actually has time for what they're committing to.
 */
export declare function validateCommitmentFeasibility(userId: string, commitment: Commitment | {
    text: string;
    type?: string;
    frequency?: {
        times: number;
        period: string;
    };
    duration?: number;
}): Promise<CommitmentFeasibility>;
/**
 * Find available time slots for a commitment
 */
export declare function findTimeForCommitment(userId: string, commitment: Commitment | {
    duration?: number;
    preferredTime?: string;
}): Promise<TimeSlot[]>;
/**
 * Create calendar blocks for a commitment
 */
export declare function createCalendarBlocksForCommitment(userId: string, commitment: Commitment | {
    text: string;
    id?: string;
    duration?: number;
}, slots: TimeSlot[]): Promise<CommitmentCalendarBlock>;
/**
 * Check if a new calendar event conflicts with existing commitments
 */
export declare function checkCommitmentConflicts(userId: string, newEvent: Partial<CalendarEvent>, commitments: Commitment[]): Promise<CommitmentConflict[]>;
/**
 * Handler for calendar changes that might affect commitments
 *
 * If commitments are not provided, will fetch them from the commitment keeper.
 */
export declare function onCalendarChange(userId: string, change: {
    type: 'created' | 'updated' | 'deleted';
    event: Partial<CalendarEvent>;
}, commitments?: Commitment[]): Promise<CommitmentConflict[]>;
/**
 * Build context for LLM about commitment-calendar status
 */
export declare function buildCommitmentCalendarContext(userId: string, commitment: Commitment | {
    text: string;
}): Promise<string>;
export declare const commitmentCalendarIntegration: {
    validateFeasibility: typeof validateCommitmentFeasibility;
    findTime: typeof findTimeForCommitment;
    createBlocks: typeof createCalendarBlocksForCommitment;
    checkConflicts: typeof checkCommitmentConflicts;
    onCalendarChange: typeof onCalendarChange;
    buildContext: typeof buildCommitmentCalendarContext;
};
export default commitmentCalendarIntegration;
//# sourceMappingURL=commitment-calendar-integration.d.ts.map