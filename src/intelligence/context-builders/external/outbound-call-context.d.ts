/**
 * Outbound Call Context Builder
 *
 * Injects awareness into agents during outbound calls made ON BEHALF of users.
 * This is the critical bridge between the call orchestrator and the agent -
 * without it, the agent wouldn't know why it's calling or what to accomplish.
 *
 * Injections:
 * - Call purpose and objective
 * - Call script with greeting and guidelines
 * - Compliance requirements (AI disclosure, recording consent)
 * - Must-confirm and must-not-do guardrails
 *
 * @module intelligence/context-builders/external/outbound-call-context
 */
import { type ContextBuilder } from '../index.js';
interface OutboundCallContext {
    callId: string;
    recipientName: string;
    recipientPhone: string;
    purpose: string;
    callType: 'healthcare' | 'restaurant' | 'business' | 'personal';
    objective: string;
    script: string;
    complianceScript: string;
    mustConfirm: string[];
    mustNotDo: string[];
    informationToGather: string[];
    userName: string;
    originalSessionId: string;
}
/**
 * Store outbound call context for a room/session
 * Called by the on-behalf-call-orchestrator when spawning an agent
 */
export declare function setOutboundCallContext(roomOrSessionId: string, context: OutboundCallContext): void;
/**
 * Get outbound call context for a room/session
 */
export declare function getOutboundCallContext(roomOrSessionId: string): OutboundCallContext | undefined;
/**
 * Clear outbound call context after call completes
 */
export declare function clearOutboundCallContext(roomOrSessionId: string): void;
export declare const outboundCallContextBuilder: ContextBuilder;
export {};
//# sourceMappingURL=outbound-call-context.d.ts.map