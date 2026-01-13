/**
 * Commitment Keeper - Better Than Human Service
 *
 * What no human friend can do: Never forget what you said you'd do.
 *
 * Tracks user commitments made during conversations and follows up
 * with care (not nagging). This is the foundation of "better than human"
 * accountability.
 *
 * @module services/superhuman/commitment-keeper
 */
import { validateCommitmentFeasibility, createCalendarBlocksForCommitment, buildCommitmentCalendarContext, type CommitmentFeasibility } from './commitment-calendar-integration.js';
export type CommitmentType = 'intention' | 'promise' | 'goal' | 'boundary' | 'conversation' | 'decision' | 'experiment';
export type CommitmentStatus = 'active' | 'completed' | 'deferred' | 'abandoned' | 'unclear';
export type FollowUpTone = 'curious' | 'supportive' | 'celebratory' | 'gentle' | 'patient';
export interface Commitment {
    id: string;
    userId: string;
    statement: string;
    summary: string;
    text: string;
    type: CommitmentType;
    topic?: string;
    emotionalWeight: number;
    personInvolved?: string;
    personaId?: string;
    createdAt: number;
    targetDate?: number;
    lastMentioned: number;
    followUpAfter: number;
    status: CommitmentStatus;
    followUpCount: number;
    lastFollowUp?: number;
    userReactionToFollowUp?: 'appreciated' | 'annoyed' | 'neutral';
    calendarEventIds?: string[];
    feasibilityScore?: number;
    duration?: number;
    frequency?: {
        times: number;
        period: string;
    };
    preferredTime?: string;
}
export interface CommitmentFollowUp {
    commitmentId: string;
    tone: FollowUpTone;
    message: string;
    shouldSurface: boolean;
    urgency: 'low' | 'normal' | 'high';
}
export interface CommitmentDetectionResult {
    detected: boolean;
    commitment?: Omit<Commitment, 'id' | 'createdAt' | 'lastMentioned' | 'followUpAfter' | 'status' | 'followUpCount'>;
    confidence: number;
}
export declare function detectCommitment(transcript: string, userId: string, context?: {
    topic?: string;
    personMentioned?: string;
    emotionalIntensity?: number;
}): CommitmentDetectionResult;
export declare function saveCommitment(commitment: Omit<Commitment, 'id'>, options?: {
    validateCalendar?: boolean;
    createCalendarBlocks?: boolean;
}): Promise<{
    commitment: Commitment;
    feasibility?: CommitmentFeasibility;
}>;
export declare function loadUserCommitments(userId: string): Promise<Commitment[]>;
export declare function updateCommitmentStatus(userId: string, commitmentId: string, status: CommitmentStatus, reaction?: 'appreciated' | 'annoyed' | 'neutral'): Promise<void>;
export declare function generateFollowUp(commitment: Commitment): CommitmentFollowUp | null;
export declare function getFollowUpsForUser(userId: string): Promise<CommitmentFollowUp[]>;
export declare function buildCommitmentContextForLLM(userId: string): Promise<string>;
export declare const buildCommitmentContext: typeof buildCommitmentContextForLLM;
/**
 * Find a commitment that matches a completed action.
 * Uses fuzzy matching on target person and action type.
 *
 * @param userId - User to search commitments for
 * @param actionType - Type of action (call, text, email, etc.)
 * @param target - Who the action was directed at (e.g., "Mom", "John")
 * @param withinDays - Only match commitments created within this many days (default: 14)
 */
export declare function findMatchingCommitment(userId: string, actionType: string, target?: string, withinDays?: number): Promise<Commitment | null>;
/**
 * Hook called when an action completes.
 * Automatically closes matching commitments.
 *
 * This is the key integration point between actions and commitments:
 * - If action has commitmentId, directly update that commitment
 * - Otherwise, use smart matching to find related commitment
 *
 * @param userId - User who completed the action
 * @param actionType - Type of action (call, text, email, etc.)
 * @param target - Who the action was directed at
 * @param commitmentId - Optional explicit commitment ID
 * @param success - Whether the action succeeded
 */
export declare function onActionCompleted(params: {
    userId: string;
    actionType: string;
    target?: string;
    commitmentId?: string;
    success: boolean;
    resultSummary?: string;
}): Promise<void>;
export declare const commitmentKeeper: {
    detect: typeof detectCommitment;
    save: typeof saveCommitment;
    load: typeof loadUserCommitments;
    updateStatus: typeof updateCommitmentStatus;
    getFollowUps: typeof getFollowUpsForUser;
    buildContext: typeof buildCommitmentContextForLLM;
    validateFeasibility: typeof validateCommitmentFeasibility;
    createCalendarBlocks: typeof createCalendarBlocksForCommitment;
    buildCalendarContext: typeof buildCommitmentCalendarContext;
    findMatchingCommitment: typeof findMatchingCommitment;
    onActionCompleted: typeof onActionCompleted;
};
//# sourceMappingURL=commitment-keeper.d.ts.map