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

// ============================================================================
// CRISIS DETECTION
// ============================================================================

export { detectCrisis, getHighestSeverityCrisis, isCrisisActive } from './crisis-detection.js';

export type {
  CrisisDetectionResult,
  CrisisSeverity,
  CrisisSignal,
  CrisisType,
} from './crisis-detection.js';

// ============================================================================
// CRISIS RESPONSE
// ============================================================================

export {
  generateCrisisResponse,
  getCrisisResources,
  getGroundingExercise,
  getSafetyCheckQuestion,
} from './crisis-response.js';

export type {
  CrisisResource,
  CrisisResponseContent,
  CrisisResponseContext,
} from './crisis-response.js';

// ============================================================================
// ESCALATION PATHWAYS
// ============================================================================

export {
  buildEscalationContext,
  determineEscalation,
  getEscalationFollowUp,
  getTherapyFinderIntro,
  getTherapyFinderTips,
} from './escalation-pathways.js';

export type {
  EscalationContext,
  EscalationDecision,
  EscalationLevel,
  ProfessionalType,
} from './escalation-pathways.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import { createLogger } from '../../utils/safe-logger.js';
import { detectCrisis, type CrisisDetectionResult, type CrisisSignal } from './crisis-detection.js';
import { generateCrisisResponse, type CrisisResponseContent } from './crisis-response.js';
import {
  buildEscalationContext,
  determineEscalation,
  type EscalationDecision,
} from './escalation-pathways.js';

const log = createLogger({ module: 'Safety' });

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
export function performSafetyCheck(
  text: string,
  context: {
    userId: string;
    personaId: string;
    sessionSignals?: CrisisSignal[];
    historicalSignals?: CrisisSignal[];
    isInTherapy?: boolean;
    previouslyDeclined?: boolean;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    userName?: string;
  }
): SafetyCheckResult {
  const {
    userId,
    personaId,
    sessionSignals = [],
    historicalSignals = [],
    isInTherapy,
    previouslyDeclined,
    relationshipStage = 'building',
    userName,
  } = context;

  // 1. Detect crisis signals
  const detection = detectCrisis(text, {
    previousSignals: sessionSignals,
  });

  // 2. Update session signals if crisis detected
  const updatedSessionSignals = detection.detected
    ? [...sessionSignals, ...detection.signals]
    : sessionSignals;

  // 3. Determine escalation level
  const escalation = determineEscalation({
    sessionSignals: updatedSessionSignals,
    historicalSignals,
    isInTherapy,
    previouslyDeclined,
    relationshipStage,
  });

  // 4. Generate response if needed
  let response: CrisisResponseContent | null = null;
  if (detection.detected && detection.primary) {
    const hour = new Date().getHours();
    const timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    response = generateCrisisResponse({
      signal: detection.primary,
      userName,
      personaId,
      timeOfDay,
      isFirstMention: sessionSignals.length === 0,
    });
  }

  // 5. Build LLM context injection
  const contextInjection = buildEscalationContext(escalation);

  // 6. Determine if we should interrupt normal flow
  const shouldInterrupt =
    detection.requiresImmediateAction ||
    escalation.level === 'emergency' ||
    escalation.level === 'urgent_referral';

  if (detection.detected) {
    log.info(
      {
        userId,
        crisisType: detection.primary?.type,
        severity: detection.primary?.severity,
        escalationLevel: escalation.level,
        shouldInterrupt,
      },
      '🛡️ Safety check completed'
    );
  }

  return {
    crisisDetected: detection.detected,
    detection,
    response,
    escalation,
    contextInjection,
    shouldInterrupt,
  };
}

/**
 * Record a crisis event for tracking and follow-up
 */
export async function recordCrisisEvent(event: {
  userId: string;
  crisisType: string;
  severity: string;
  responded: boolean;
  resourcesProvided: boolean;
  userAcceptedHelp?: boolean;
}): Promise<void> {
  // Log for now - in production this would go to a secure audit log
  log.warn(
    {
      ...event,
      timestamp: new Date().toISOString(),
    },
    '📋 Crisis event recorded'
  );

  // TODO: Implement secure crisis event storage
  // - Store in encrypted audit log
  // - Trigger admin notification for critical events
  // - Update user's historical signals
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  performSafetyCheck,
  recordCrisisEvent,
  detectCrisis,
  generateCrisisResponse,
  determineEscalation,
};
