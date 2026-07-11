/**
 * Telephony Domain Types
 *
 * Shared types for the telephony domain, extracted to break circular dependencies.
 * This file should NOT import from other telephony domain files.
 *
 * @module tools/domains/telephony/types
 */

// ============================================================================
// CALL TYPES
// ============================================================================

/** Script template types (for script selection) */
export type CallScriptType = 'healthcare' | 'restaurant' | 'business' | 'personal';

/** Call request types */
export type CallType = 'business' | 'personal' | 'emergency';

export type CallObjective =
  | 'reschedule'
  | 'cancel'
  | 'new_appointment'
  | 'inquiry'
  | 'reservation'
  | 'check_in'
  | 'deliver_message'
  | 'general';

// ============================================================================
// CONTACT RESOLUTION
// ============================================================================

export interface ResolvedContact {
  id?: string;
  name: string;
  phone: string;
  relationship?: string; // "doctor", "mom", "restaurant"
  company?: string;
  notes?: string;
}

// ============================================================================
// CALL SCRIPT TEMPLATES
// ============================================================================

export interface CallScriptTemplate {
  type: CallScriptType;

  // Introduction
  greeting: string;
  identityDisclosure: string;

  // Recording consent (required in many jurisdictions)
  recordingConsentScript?: string;

  // Domain-specific
  hipaaNote?: string;

  // Objectives
  objectives: Record<string, string>;

  // Guardrails
  informationToGather: string[];
  mustConfirm: string[];
  mustNotDo: string[];
}

// ============================================================================
// ON-BEHALF CALL REQUEST / OUTCOME
// ============================================================================

export interface OnBehalfCallRequest {
  // Who to call
  contactQuery: string; // "my doctor", "mom", "Olive Garden"
  resolvedContact?: ResolvedContact;

  // Purpose
  purpose: string; // "reschedule appointment to next week"
  objective: CallObjective;
  callType: CallType;

  // Context from original conversation
  originalSessionId: string;
  userId: string;
  userTimezone: string;
  userName: string;
  userPreferences?: {
    preferredTimes?: string[];
    constraints?: string[];
    additionalContext?: string;
  };

  // Compliance
  recordingConsent: boolean;
  requiresHIPAA?: boolean;
}

export interface CallOutcome {
  callId: string;
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';

  // What happened
  objectiveAchieved: boolean;
  outcome: string;

  // Follow-ups
  callbackRequired?: boolean;
  callbackTime?: string;
  actionItems?: string[];

  // Recording (if consented)
  recordingUrl?: string;
  transcriptSummary?: string;
}
