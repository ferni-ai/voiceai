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
