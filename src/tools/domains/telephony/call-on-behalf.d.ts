/**
 * Call On Behalf Tool
 *
 * Enables agents to make phone calls ON BEHALF of users to third parties.
 * This is different from calling THE USER - here the agent calls a doctor,
 * restaurant, family member, etc. and handles the conversation autonomously.
 *
 * Flow:
 * 1. User says "Call my doctor to reschedule my appointment"
 * 2. Semantic router routes to this tool
 * 3. Tool resolves contact, builds script, initiates call
 * 4. Agent joins call with full context via outbound-call-context builder
 * 5. Agent handles conversation, captures outcome
 * 6. Original session notified of result
 *
 * @module tools/domains/telephony/call-on-behalf
 */
import { z } from 'zod';
import type { ToolContext, Tool } from '../../registry/types.js';
export type CallType = 'business' | 'personal' | 'emergency';
export type CallObjective = 'reschedule' | 'cancel' | 'new_appointment' | 'inquiry' | 'reservation' | 'check_in' | 'deliver_message' | 'general';
export interface OnBehalfCallRequest {
    contactQuery: string;
    resolvedContact?: ResolvedContact;
    purpose: string;
    objective: CallObjective;
    callType: CallType;
    originalSessionId: string;
    userId: string;
    userTimezone: string;
    userName: string;
    userPreferences?: {
        preferredTimes?: string[];
        constraints?: string[];
        additionalContext?: string;
    };
    recordingConsent: boolean;
    requiresHIPAA?: boolean;
}
export interface ResolvedContact {
    id?: string;
    name: string;
    phone: string;
    relationship?: string;
    company?: string;
    notes?: string;
}
export interface CallScriptTemplate {
    type: 'healthcare' | 'restaurant' | 'business' | 'personal';
    greeting: string;
    identityDisclosure: string;
    recordingConsentScript?: string;
    hipaaNote?: string;
    objectives: Record<string, string>;
    informationToGather: string[];
    mustConfirm: string[];
    mustNotDo: string[];
}
export interface CallOutcome {
    callId: string;
    status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
    objectiveAchieved: boolean;
    outcome: string;
    callbackRequired?: boolean;
    callbackTime?: string;
    actionItems?: string[];
    recordingUrl?: string;
    transcriptSummary?: string;
}
/**
 * Resolve a contact query to a phone number
 *
 * Resolution priority:
 * 1. Unified Entity Store (primary) - "Better Than Human" memory
 * 2. Legacy contact_relationships (fallback) - for backwards compatibility
 *
 * The entity store handles:
 * - "my brother" → finds entity with specificRelation="brother"
 * - "Mike" → finds entity with canonicalName/alias="Mike"
 * - Deduplication across all legacy collections
 */
declare function resolveContact(contactQuery: string, userId: string): Promise<ResolvedContact | null>;
/**
 * Infer call type from contact relationship
 */
declare function inferCallType(contact: ResolvedContact, purpose: string): CallType;
/**
 * Infer call objective from purpose
 */
declare function inferObjective(purpose: string): CallObjective;
/**
 * Initiate the call via the orchestrator
 */
declare function initiateOnBehalfCall(request: OnBehalfCallRequest): Promise<string>;
/**
 * Parameter schema for the call on behalf tool
 */
declare const callOnBehalfSchema: z.ZodObject<{
    contactQuery: z.ZodString;
    phoneNumber: z.ZodOptional<z.ZodString>;
    purpose: z.ZodString;
    additionalContext: z.ZodOptional<z.ZodString>;
    preferredTimes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    recordingConsent: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
/**
 * Create the call on behalf tool
 */
export declare function createCallOnBehalfTool(ctx: ToolContext): Tool;
export { resolveContact, inferCallType, inferObjective, initiateOnBehalfCall, callOnBehalfSchema };
//# sourceMappingURL=call-on-behalf.d.ts.map