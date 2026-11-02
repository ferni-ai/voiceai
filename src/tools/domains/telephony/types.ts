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

  /** Set on the one retry of a missed call: the call it retries. */
  retryOf?: string;

  /** The owner explicitly asked to call now (CALL_NOW_OWNER_OVERRIDE, call-now-override.ts). */
  callNow?: boolean;
  /** The owner said yes again after hearing it's late or early where the callee is. */
  lateConfirmed?: boolean;
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
  /** The model's summary of the call; never the other person's own words. */
  transcriptSummary?: string;
  /** The person answered but the model couldn't summarise the call: nothing they said is kept. */
  summaryUnavailable?: boolean;

  /** What the person asked Ferni to pass on to the user, as the model's summary put it. */
  message?: string;

  /** status 'voicemail' only: Ferni really spoke a message (services/outreach/voicemail-outcome.ts). */
  voicemailLeft?: boolean;
}
