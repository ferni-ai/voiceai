/**
 * Safety Services Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * User safety is non-negotiable. This module provides:
 * - Crisis detection in user speech
 * - Warm, human crisis responses
 * - Professional help escalation pathways
 *
 * Philosophy:
 * - Never abandon the user
 * - Validate first, resources second
 * - "I'm here, AND I want you to have more support"
 * - Conservative detection (false positives are acceptable for safety)
 *
 * @module Safety
 */
export { detectCrisis, getHighestSeverityCrisis, isCrisisActive } from './crisis-detection.js';
export type { CrisisDetectionResult, CrisisSeverity, CrisisSignal, CrisisType, } from './crisis-detection.js';
export { generateCrisisResponse, getCrisisResources, getGroundingExercise, getSafetyCheckQuestion, } from './crisis-response.js';
export type { CrisisResource, CrisisResponseContent, CrisisResponseContext, } from './crisis-response.js';
export { buildEscalationContext, determineEscalation, getEscalationFollowUp, getTherapyFinderIntro, getTherapyFinderTips, } from './escalation-pathways.js';
export type { EscalationContext, EscalationDecision, EscalationLevel, ProfessionalType, } from './escalation-pathways.js';
import { detectCrisis, type CrisisDetectionResult, type CrisisSignal } from './crisis-detection.js';
import { generateCrisisResponse, type CrisisResponseContent } from './crisis-response.js';
import { determineEscalation, type EscalationDecision } from './escalation-pathways.js';
/**
 * Unified safety check result
 */
export interface SafetyCheckResult {
    /** Whether any crisis was detected */
    crisisDetected: boolean;
    /** The detection result */
    detection: CrisisDetectionResult;
    /** Generated response (if crisis detected) */
    response: CrisisResponseContent | null;
    /** Escalation decision */
    escalation: EscalationDecision;
    /** LLM context injection */
    contextInjection: string | null;
    /** Whether to interrupt normal flow */
    shouldInterrupt: boolean;
}
/**
 * Perform a complete safety check on user input.
 *
 * This is the main entry point for safety checking. It:
 * 1. Detects crisis signals
 * 2. Generates appropriate response
 * 3. Determines escalation level
 * 4. Provides LLM context injection
 *
 * @param text - User's message
 * @param context - Additional context
 * @returns Complete safety check result
 */
export declare function performSafetyCheck(text: string, context: {
    userId: string;
    personaId: string;
    sessionSignals?: CrisisSignal[];
    historicalSignals?: CrisisSignal[];
    isInTherapy?: boolean;
    previouslyDeclined?: boolean;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    userName?: string;
}): SafetyCheckResult;
/**
 * Crisis event data stored for tracking and follow-up
 */
export interface StoredCrisisEvent {
    userId: string;
    crisisType: string;
    severity: string;
    responded: boolean;
    resourcesProvided: boolean;
    userAcceptedHelp?: boolean;
    timestamp: string;
    metadata?: {
        sessionId?: string;
        personaId?: string;
        conversationTurnCount?: number;
    };
}
/**
 * Record a crisis event for tracking and follow-up.
 *
 * This stores crisis events in Firestore for:
 * - Historical pattern analysis
 * - Admin notification for critical events
 * - User safety tracking and follow-up
 */
export declare function recordCrisisEvent(event: {
    userId: string;
    crisisType: string;
    severity: string;
    responded: boolean;
    resourcesProvided: boolean;
    userAcceptedHelp?: boolean;
    metadata?: {
        sessionId?: string;
        personaId?: string;
        conversationTurnCount?: number;
    };
}): Promise<void>;
/**
 * Get user's historical crisis signals for pattern analysis
 */
export declare function getUserCrisisHistory(userId: string): Promise<{
    signals: CrisisSignal[];
    totalCount: number;
} | null>;
declare const _default: {
    performSafetyCheck: typeof performSafetyCheck;
    recordCrisisEvent: typeof recordCrisisEvent;
    getUserCrisisHistory: typeof getUserCrisisHistory;
    detectCrisis: typeof detectCrisis;
    generateCrisisResponse: typeof generateCrisisResponse;
    determineEscalation: typeof determineEscalation;
};
export default _default;
//# sourceMappingURL=index.d.ts.map