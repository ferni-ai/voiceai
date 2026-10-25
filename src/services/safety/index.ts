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
/** The crisis guard's scoring of the caller's words alone: quiet, no logging (heavy-moment.ts). */
export { detectCrisis as scoreCrisisLanguage } from './crisis-guard.js';

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

import { type Firestore } from 'firebase-admin/firestore';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  detectCrisis,
  type CrisisDetectionResult,
  type CrisisSeverity,
  type CrisisSignal,
  type CrisisType,
} from './crisis-detection.js';
import { generateCrisisResponse, type CrisisResponseContent } from './crisis-response.js';
import {
  buildEscalationContext,
  determineEscalation,
  type EscalationDecision,
} from './escalation-pathways.js';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';

const log = createLogger({ module: 'Safety' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let firestoreInstance: Firestore | null = null;
let firestoreInitAttempted = false;

function getFirestoreInstance(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (firestoreInitAttempted) return null;

  firestoreInitAttempted = true;
  try {
    firestoreInstance = getAdminFirestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firestore not available - crisis events will only be logged');
    return null;
  }
}

const CRISIS_EVENTS_COLLECTION = 'crisis_events';
const CRISIS_SIGNALS_COLLECTION = 'crisis_signals';

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

/** Which reader made the gate's replace decision (crisis-gate.ts). */
export type CrisisReader = 'pattern' | 'classifier';

/** How long a crisis event is kept: a TTL policy on expireAt deletes it after this. */
export const CRISIS_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * One crisis_events document (CRISIS_EVENT_RECORD, agents/safety/crisis-event-record.ts):
 * ids, fixed enums and times, never the caller's words. Erased and exported with the
 * account (user-stores.ts, user-records-export.ts).
 */
export interface StoredCrisisEvent {
  userId: string;
  sessionId?: string;
  personaId?: string;
  crisisType: CrisisType;
  severity: CrisisSeverity;
  reader: CrisisReader;
  /** The script spoken names 988 or 911 */
  resourcesProvided: boolean;
  createdAt: Date;
  /** The TTL field, a Date (stored as a Timestamp): createdAt + CRISIS_EVENT_RETENTION_MS */
  expireAt: Date;
}

/**
 * Record one crisis event. Each field is set here by name, so nothing else a caller
 * passes is stored. No alert is sent (Seth, 2026-10-25). Never throws: a failure is
 * logged with ids and an error code only.
 */
export async function recordCrisisEvent(
  event: Omit<StoredCrisisEvent, 'createdAt' | 'expireAt'>,
  firestore?: Firestore
): Promise<void> {
  const { userId, sessionId, personaId, crisisType, severity, reader, resourcesProvided } = event;
  const createdAt = new Date();
  const expireAt = new Date(createdAt.getTime() + CRISIS_EVENT_RETENTION_MS);
  const stored: StoredCrisisEvent = {
    userId,
    sessionId,
    personaId,
    crisisType,
    severity,
    reader,
    resourcesProvided,
    createdAt,
    expireAt,
  };
  const db = firestore ?? getFirestoreInstance();
  try {
    if (!db) throw Object.assign(new Error('no Firestore'), { code: 'no-firestore' });
    await db.collection(CRISIS_EVENTS_COLLECTION).add(removeUndefined(stored));
    log.info({ userId, sessionId, severity, reader }, 'Crisis event recorded');
  } catch (error) {
    // The code only, and only when it looks like one: a message can quote the caller
    const code = String((error as { code?: unknown } | null)?.code ?? '');
    const safe = /^[\w.-]{1,40}$/.test(code) ? code : 'unknown';
    log.error({ userId, sessionId, code: safe }, 'Crisis event not stored');
  }
}

/**
 * Get user's historical crisis signals for pattern analysis
 */
export async function getUserCrisisHistory(
  userId: string
): Promise<{ signals: CrisisSignal[]; totalCount: number } | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const doc = await db.collection(CRISIS_SIGNALS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      return { signals: [], totalCount: 0 };
    }

    const data = doc.data();
    return {
      signals: data?.signals || [],
      totalCount: data?.totalSignalCount || 0,
    };
  } catch (error) {
    log.error({ error, userId }, 'Failed to get user crisis history');
    return null;
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  performSafetyCheck,
  recordCrisisEvent,
  getUserCrisisHistory,
  detectCrisis,
  generateCrisisResponse,
  determineEscalation,
};
