/**
 * Telephony Compliance Framework
 *
 * Ensures outbound calls on behalf of users meet legal and ethical requirements:
 * - AI disclosure (required in many jurisdictions)
 * - Recording consent (two-party consent states)
 * - HIPAA considerations for healthcare calls
 * - User authorization tracking
 *
 * @module tools/domains/telephony/compliance
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { OnBehalfCallRequest, CallType } from './call-on-behalf.js';

const log = getLogger().child({ module: 'telephony-compliance' });

// ============================================================================
// TYPES
// ============================================================================

export interface ComplianceCheck {
  passed: boolean;
  issues: string[];
  requiredDisclosures: string[];
  warnings: string[];
}

export interface ComplianceConfig {
  // AI disclosure requirements
  requireAIDisclosure: boolean;

  // Recording consent
  requireRecordingConsent: boolean;
  twoPartyConsentStates: string[];

  // Healthcare
  requireHIPAADisclosure: boolean;

  // Authorization
  requireExplicitAuthorization: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  requireAIDisclosure: true,
  requireRecordingConsent: true,

  // US states with two-party consent requirements
  twoPartyConsentStates: [
    'CA', // California
    'CT', // Connecticut
    'FL', // Florida
    'IL', // Illinois
    'MA', // Massachusetts
    'MD', // Maryland
    'MI', // Michigan (with exceptions)
    'MT', // Montana
    'NV', // Nevada
    'NH', // New Hampshire
    'PA', // Pennsylvania
    'WA', // Washington
  ],

  requireHIPAADisclosure: true,
  requireExplicitAuthorization: false, // For now, user asking = authorization
};

// ============================================================================
// COMPLIANCE CHECKS
// ============================================================================

/**
 * Check if a call request meets compliance requirements
 */
export function checkCallCompliance(
  request: OnBehalfCallRequest,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): ComplianceCheck {
  const issues: string[] = [];
  const warnings: string[] = [];
  const disclosures: string[] = [];

  log.debug(
    { callType: request.callType, requiresHIPAA: request.requiresHIPAA },
    'Checking call compliance'
  );

  // -------------------------------------------------------------------------
  // AI Disclosure (almost always required)
  // -------------------------------------------------------------------------
  if (config.requireAIDisclosure) {
    disclosures.push(
      'You must identify yourself as an AI assistant at the start of the call.'
    );
  }

  // -------------------------------------------------------------------------
  // Recording Consent
  // -------------------------------------------------------------------------
  if (config.requireRecordingConsent) {
    if (!request.recordingConsent) {
      // User hasn't consented - we can still make the call, but can't record
      disclosures.push(
        'Call will not be recorded as user has not consented.'
      );
    } else {
      // Even with user consent, we may need recipient consent
      disclosures.push(
        'You must ask the recipient if they consent to the call being recorded.'
      );
    }
  }

  // -------------------------------------------------------------------------
  // HIPAA Considerations (Healthcare Calls)
  // -------------------------------------------------------------------------
  if (request.requiresHIPAA && config.requireHIPAADisclosure) {
    disclosures.push(
      'State that the user has authorized you to call regarding their healthcare. ' +
      'Do not disclose specific medical conditions unless the user explicitly authorized it.'
    );

    warnings.push(
      'Healthcare call - be extra careful about what information you share.'
    );
  }

  // -------------------------------------------------------------------------
  // Emergency Calls
  // -------------------------------------------------------------------------
  if (request.callType === 'emergency') {
    warnings.push(
      'This is marked as an emergency call. Prioritize getting help quickly.'
    );
  }

  // -------------------------------------------------------------------------
  // Personal Calls
  // -------------------------------------------------------------------------
  if (request.callType === 'personal') {
    disclosures.push(
      `State that you are calling on behalf of ${request.userName}.`
    );
  }

  // -------------------------------------------------------------------------
  // Business Calls
  // -------------------------------------------------------------------------
  if (request.callType === 'business') {
    disclosures.push(
      `State that you are an AI assistant calling on behalf of ${request.userName}.`
    );
  }

  // -------------------------------------------------------------------------
  // Authorization Tracking (future enhancement)
  // -------------------------------------------------------------------------
  // For now, we assume the user asking = authorization
  // In the future, we could require explicit confirmation for sensitive calls

  const passed = issues.length === 0;

  if (!passed) {
    log.warn({ issues, callType: request.callType }, 'Compliance check failed');
  } else {
    log.debug({ disclosures: disclosures.length }, 'Compliance check passed');
  }

  return {
    passed,
    issues,
    requiredDisclosures: disclosures,
    warnings,
  };
}

/**
 * Generate the compliance-mandated script prefix for a call
 */
export function generateComplianceScript(
  request: OnBehalfCallRequest,
  compliance: ComplianceCheck
): string {
  const parts: string[] = [];

  // Greeting
  parts.push(`Hi, my name is Ferni.`);

  // AI disclosure
  parts.push(`I'm an AI assistant calling on behalf of ${request.userName}.`);

  // Recording consent (if enabled)
  if (request.recordingConsent) {
    parts.push(`This call may be recorded for quality purposes. Is that okay with you?`);
  }

  // HIPAA disclosure (if applicable)
  if (request.requiresHIPAA) {
    parts.push(
      `${request.userName} has authorized me to call regarding their appointment.`
    );
  }

  return parts.join(' ');
}

/**
 * Check if a user's state requires two-party consent for recording
 */
export function requiresTwoPartyConsent(
  stateCode: string,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG
): boolean {
  return config.twoPartyConsentStates.includes(stateCode.toUpperCase());
}

/**
 * Get compliance requirements for a specific call type
 */
export function getCallTypeRequirements(callType: CallType): {
  mustDo: string[];
  mustNotDo: string[];
} {
  switch (callType) {
    case 'emergency':
      return {
        mustDo: [
          'Identify yourself clearly',
          'State the emergency nature of the call',
          'Prioritize getting help',
          'Provide callback number if disconnected',
        ],
        mustNotDo: [
          'Waste time with small talk',
          'Hang up without confirming help is on the way',
        ],
      };

    case 'business':
      return {
        mustDo: [
          'Identify yourself as an AI assistant',
          'State who you are calling on behalf of',
          'Ask for recording consent if applicable',
          'Confirm any appointments or actions taken',
        ],
        mustNotDo: [
          'Provide credit card or SSN without explicit authorization',
          'Agree to financial obligations without user approval',
          'Share sensitive personal information unnecessarily',
        ],
      };

    case 'personal':
      return {
        mustDo: [
          'Introduce yourself and explain who asked you to call',
          'Be warm and personable',
          'Ask how they are doing',
          'Deliver the message or purpose naturally',
        ],
        mustNotDo: [
          'Be robotic or impersonal',
          'Share private information about the user without permission',
          'Overstay the conversation if they seem busy',
        ],
      };

    default:
      return {
        mustDo: ['Identify yourself', 'State your purpose'],
        mustNotDo: ['Be vague about your identity'],
      };
  }
}

// ============================================================================
// ADDITIONAL EXPORTS
// ============================================================================

export { DEFAULT_COMPLIANCE_CONFIG };
