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
import type { OnBehalfCallRequest, CallType } from './call-on-behalf.js';
export interface ComplianceCheck {
    passed: boolean;
    issues: string[];
    requiredDisclosures: string[];
    warnings: string[];
}
export interface ComplianceConfig {
    requireAIDisclosure: boolean;
    requireRecordingConsent: boolean;
    twoPartyConsentStates: string[];
    requireHIPAADisclosure: boolean;
    requireExplicitAuthorization: boolean;
}
declare const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig;
/**
 * Check if a call request meets compliance requirements
 */
export declare function checkCallCompliance(request: OnBehalfCallRequest, config?: ComplianceConfig): ComplianceCheck;
/**
 * Generate the compliance-mandated script prefix for a call
 */
export declare function generateComplianceScript(request: OnBehalfCallRequest, compliance: ComplianceCheck): string;
/**
 * Check if a user's state requires two-party consent for recording
 */
export declare function requiresTwoPartyConsent(stateCode: string, config?: ComplianceConfig): boolean;
/**
 * Get compliance requirements for a specific call type
 */
export declare function getCallTypeRequirements(callType: CallType): {
    mustDo: string[];
    mustNotDo: string[];
};
export { DEFAULT_COMPLIANCE_CONFIG };
//# sourceMappingURL=compliance.d.ts.map