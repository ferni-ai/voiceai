/**
 * Call Executor
 *
 * Ferni's domain - makes phone calls on user's behalf.
 * "BETTER THAN HUMAN" - We make the calls you've been putting off.
 *
 * This executor connects to the existing on-behalf-calls system
 * and ensures results are captured via the unified result capture.
 */
import type { ResultPriority } from '../result-types.js';
export interface CallRequest {
    userId: string;
    sessionId?: string;
    contactName: string;
    contactPhone?: string;
    contactId?: string;
    objective: string;
    context?: string;
    script?: string;
    maxDuration?: number;
    initiatedBy?: string;
    priority?: ResultPriority;
}
export interface CallResult {
    success: boolean;
    callId: string;
    contactName: string;
    status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
    outcome: string;
    objectiveAchieved: boolean;
    callbackRequired: boolean;
    callbackTime?: string;
    actionItems?: string[];
    duration?: number;
}
/**
 * Execute a phone call on user's behalf.
 */
export declare function executeCall(request: CallRequest): Promise<CallResult>;
/**
 * Queue a call for background execution.
 */
export declare function queueCall(request: CallRequest): Promise<string>;
//# sourceMappingURL=call-executor.d.ts.map