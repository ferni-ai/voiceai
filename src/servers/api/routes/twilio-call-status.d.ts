/**
 * Twilio Call Status Webhook Handler
 *
 * Receives status callbacks from Twilio for on-behalf calls:
 * - initiated: Call is being placed
 * - ringing: Phone is ringing
 * - in-progress: Call connected
 * - completed: Call ended normally
 * - busy: Line is busy
 * - no-answer: No one picked up
 * - failed: Call failed
 * - canceled: Call was canceled
 *
 * @module servers/api/routes/twilio-call-status
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { CallObjective, CallType } from '../../../tools/domains/telephony/call-on-behalf.js';
interface TwilioCallStatusPayload {
    CallSid: string;
    AccountSid: string;
    From: string;
    To: string;
    CallStatus: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed' | 'canceled';
    CallDuration?: string;
    Direction: 'outbound-api' | 'outbound-dial' | 'inbound';
    AnsweredBy?: 'human' | 'machine' | 'unknown';
    RecordingUrl?: string;
    RecordingSid?: string;
    RecordingDuration?: string;
    ErrorCode?: string;
    ErrorMessage?: string;
}
interface PendingCall {
    callId: string;
    userId: string;
    contactName: string;
    purpose: string;
    objective: CallObjective;
    callType: CallType;
    originalSessionId: string;
    startedAt: string;
}
/**
 * Track a new outbound call
 * Called by the orchestrator when initiating a call
 */
export declare function trackOutboundCall(twilioCallSid: string, context: PendingCall): void;
/**
 * Get pending call context
 */
export declare function getPendingCall(twilioCallSid: string): PendingCall | undefined;
/**
 * Remove completed call from tracking
 */
export declare function removePendingCall(twilioCallSid: string): void;
/**
 * Handle Twilio call status webhook
 *
 * POST /api/webhooks/call-status
 */
export declare function handleTwilioCallStatus(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
export type { TwilioCallStatusPayload };
//# sourceMappingURL=twilio-call-status.d.ts.map