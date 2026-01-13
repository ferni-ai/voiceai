/**
 * Telephony Domain Types
 *
 * Shared types for the telephony domain, extracted to break circular dependencies.
 * This file should NOT import from other telephony domain files.
 *
 * @module tools/domains/telephony/types
 */
/** Script template types (for script selection) */
export type CallScriptType = 'healthcare' | 'restaurant' | 'business' | 'personal';
/** Call request types */
export type CallType = 'business' | 'personal' | 'emergency';
export type CallObjective = 'reschedule' | 'cancel' | 'new_appointment' | 'inquiry' | 'reservation' | 'check_in' | 'deliver_message' | 'general';
export interface ResolvedContact {
    id?: string;
    name: string;
    phone: string;
    relationship?: string;
    company?: string;
    notes?: string;
}
export interface CallScriptTemplate {
    type: CallScriptType;
    greeting: string;
    identityDisclosure: string;
    recordingConsentScript?: string;
    hipaaNote?: string;
    objectives: Record<string, string>;
    informationToGather: string[];
    mustConfirm: string[];
    mustNotDo: string[];
}
//# sourceMappingURL=types.d.ts.map