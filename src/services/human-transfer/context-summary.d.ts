/**
 * Context Summary Generator
 *
 * > "Better than human means a warm handoff, not a cold referral."
 *
 * Creates summaries for warm handoffs to human professionals.
 * The professional receives context so the user doesn't have to repeat themselves.
 *
 * @module services/human-transfer/context-summary
 */
import type { EscalationType, TransferSummary, TransferUrgency } from './types.js';
interface UserProfileData {
    preferredName?: string;
    pronouns?: string;
    age?: number;
    currentConcerns?: string[];
    relevantHistory?: string;
    boundaryTopics?: string[];
    communicationStyle?: string;
    triggers?: string[];
    whatHelps?: string[];
    alreadyTried?: string[];
    hasTherapist?: boolean;
    currentMedications?: boolean;
    supportSystem?: string[];
}
interface ConversationData {
    summaries: Array<{
        date: string;
        summary: string;
        topics: string[];
        mood?: string;
    }>;
    keyMoments?: string[];
    themes?: string[];
}
interface CrisisContextData {
    severity: number;
    signals: string[];
    urgency: TransferUrgency;
}
/**
 * Generate a warm handoff summary for human professionals
 */
export declare function generateTransferSummary(escalationType: EscalationType, userProfile: UserProfileData, conversations: ConversationData, crisisContext?: CrisisContextData): Promise<TransferSummary>;
/**
 * Generate a minimal summary when user wants less shared
 */
export declare function generateMinimalSummary(escalationType: EscalationType, urgency: TransferUrgency): TransferSummary;
/**
 * Generate a summary that only includes topic areas, no personal details
 */
export declare function generateTopicsOnlySummary(escalationType: EscalationType, urgency: TransferUrgency, topics: string[]): TransferSummary;
export declare const contextSummary: {
    generateTransferSummary: typeof generateTransferSummary;
    generateMinimalSummary: typeof generateMinimalSummary;
    generateTopicsOnlySummary: typeof generateTopicsOnlySummary;
};
export {};
//# sourceMappingURL=context-summary.d.ts.map