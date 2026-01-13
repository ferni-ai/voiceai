/**
 * Inbound Call Context Builder
 *
 * Injects caller identity and context for INBOUND phone calls.
 * This enables Ferni to recognize callers by phone number and voice,
 * especially family members who call via sponsored identities.
 *
 * Injections:
 * - Caller identity (name, relationship)
 * - Recognition status (known/unknown)
 * - Voice verification status
 * - Personalized greeting guidance
 * - Sponsored identity context (if applicable)
 *
 * @module intelligence/context-builders/external/inbound-call-context
 */
import { type ContextBuilder } from '../index.js';
export interface InboundCallContext {
    /** Twilio Call SID */
    callSid: string;
    /** Caller's phone number (E.164) */
    callerPhone: string;
    /** Caller's display name (from identity lookup) */
    callerName?: string;
    /** User ID for the caller (sponsored ID or phone:xxx) */
    userId?: string;
    /** Sponsored identity ID (if caller is a sponsored family member) */
    sponsoredIdentityId?: string;
    /** Sponsor's user ID (the person who created this identity) */
    sponsorUserId?: string;
    /** Family member's own user ID for memory storage */
    familyUserId?: string;
    /** Whether this caller is known (has a profile) */
    isKnownCaller: boolean;
    /** Whether the caller has voice enrollment */
    isVoiceEnrolled: boolean;
    /** Relationship to sponsor (if sponsored) */
    relationship?: string;
    /** Notes from sponsor about this caller */
    notes?: string;
    /** Access level for this caller */
    accessLevel?: 'full' | 'limited' | 'supervised';
    /** Allowed personas for this caller */
    allowedPersonas?: string[];
}
/**
 * Store inbound call context for a session.
 * Called by the voice-agent-entry when handling an inbound call.
 */
export declare function setInboundCallContext(sessionId: string, context: InboundCallContext): void;
/**
 * Get inbound call context for a session.
 */
export declare function getInboundCallContext(sessionId: string): InboundCallContext | undefined;
/**
 * Clear inbound call context after call completes.
 */
export declare function clearInboundCallContext(sessionId: string): void;
export declare const inboundCallContextBuilder: ContextBuilder;
//# sourceMappingURL=inbound-call-context.d.ts.map