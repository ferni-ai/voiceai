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
// ============================================================================
// CRISIS RESPONSE
// ============================================================================
export { generateCrisisResponse, getCrisisResources, getGroundingExercise, getSafetyCheckQuestion, } from './crisis-response.js';
// ============================================================================
// ESCALATION PATHWAYS
// ============================================================================
export { buildEscalationContext, determineEscalation, getEscalationFollowUp, getTherapyFinderIntro, getTherapyFinderTips, } from './escalation-pathways.js';
// ============================================================================
// UNIFIED API
// ============================================================================
import { getFirestore } from 'firebase-admin/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { detectCrisis } from './crisis-detection.js';
import { generateCrisisResponse } from './crisis-response.js';
import { buildEscalationContext, determineEscalation, } from './escalation-pathways.js';
const log = createLogger({ module: 'Safety' });
// ============================================================================
// FIRESTORE SETUP
// ============================================================================
let firestoreInstance = null;
let firestoreInitAttempted = false;
function getFirestoreInstance() {
    if (firestoreInstance)
        return firestoreInstance;
    if (firestoreInitAttempted)
        return null;
    firestoreInitAttempted = true;
    try {
        firestoreInstance = getFirestore();
        return firestoreInstance;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available - crisis events will only be logged');
        return null;
    }
}
const CRISIS_EVENTS_COLLECTION = 'crisis_events';
const CRISIS_SIGNALS_COLLECTION = 'crisis_signals';
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
export function performSafetyCheck(text, context) {
    const { userId, personaId, sessionSignals = [], historicalSignals = [], isInTherapy, previouslyDeclined, relationshipStage = 'building', userName, } = context;
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
    let response = null;
    if (detection.detected && detection.primary) {
        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
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
    const shouldInterrupt = detection.requiresImmediateAction ||
        escalation.level === 'emergency' ||
        escalation.level === 'urgent_referral';
    if (detection.detected) {
        log.info({
            userId,
            crisisType: detection.primary?.type,
            severity: detection.primary?.severity,
            escalationLevel: escalation.level,
            shouldInterrupt,
        }, '🛡️ Safety check completed');
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
 * Record a crisis event for tracking and follow-up.
 *
 * This stores crisis events in Firestore for:
 * - Historical pattern analysis
 * - Admin notification for critical events
 * - User safety tracking and follow-up
 */
export async function recordCrisisEvent(event) {
    const timestamp = new Date().toISOString();
    const eventWithTimestamp = {
        ...event,
        timestamp,
    };
    // Always log for audit trail
    log.warn(eventWithTimestamp, '📋 Crisis event recorded');
    // Store in Firestore if available
    const db = getFirestoreInstance();
    if (db) {
        try {
            // Store the crisis event
            await db.collection(CRISIS_EVENTS_COLLECTION).add(removeUndefined({
                ...eventWithTimestamp,
                createdAt: new Date(),
            }));
            // Update user's historical signals
            await updateUserCrisisSignals(db, event.userId, {
                type: event.crisisType,
                severity: event.severity,
                timestamp,
            });
            // Send admin notification for critical/emergency severity
            if (event.severity === 'critical' || event.severity === 'emergency') {
                await notifyAdminOfCriticalCrisis(eventWithTimestamp);
            }
            log.info({ userId: event.userId }, '✅ Crisis event stored in Firestore');
        }
        catch (error) {
            log.error({ error, userId: event.userId }, 'Failed to store crisis event in Firestore');
        }
    }
}
/**
 * Update user's historical crisis signals for pattern analysis
 */
async function updateUserCrisisSignals(db, userId, signal) {
    const userSignalsRef = db.collection(CRISIS_SIGNALS_COLLECTION).doc(userId);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userSignalsRef);
            if (doc.exists) {
                const data = doc.data();
                const signals = data?.signals || [];
                // Keep last 50 signals for pattern analysis
                const updatedSignals = [...signals, signal].slice(-50);
                transaction.update(userSignalsRef, {
                    signals: updatedSignals,
                    lastSignalAt: new Date(),
                    totalSignalCount: (data?.totalSignalCount || 0) + 1,
                });
            }
            else {
                transaction.set(cleanForFirestore(userSignalsRef), {
                    userId,
                    signals: [signal],
                    firstSignalAt: new Date(),
                    lastSignalAt: new Date(),
                    totalSignalCount: 1,
                });
            }
        });
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to update user crisis signals');
    }
}
/**
 * Send admin notification for critical crisis events.
 * Integrates with Slack for immediate team alerting.
 */
async function notifyAdminOfCriticalCrisis(event) {
    // Log for monitoring systems to pick up
    log.warn({
        level: 'CRITICAL_CRISIS_ALERT',
        userId: event.userId,
        crisisType: event.crisisType,
        severity: event.severity,
        timestamp: event.timestamp,
        resourcesProvided: event.resourcesProvided,
    }, '🚨 CRITICAL CRISIS EVENT - Admin notification required');
    // Send Slack notification to safety channel
    try {
        const { notifyCrisisAlert } = await import('../slack-notifications.js');
        await notifyCrisisAlert({
            userId: event.userId,
            crisisType: event.crisisType,
            severity: event.severity,
            timestamp: event.timestamp,
            resourcesProvided: event.resourcesProvided,
            userAcceptedHelp: event.userAcceptedHelp,
            metadata: event.metadata,
        });
        log.info({ userId: event.userId }, '✅ Crisis alert sent to Slack');
    }
    catch (error) {
        log.error({ error, userId: event.userId }, 'Failed to send Slack crisis alert');
    }
}
/**
 * Get user's historical crisis signals for pattern analysis
 */
export async function getUserCrisisHistory(userId) {
    const db = getFirestoreInstance();
    if (!db)
        return null;
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
    }
    catch (error) {
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
//# sourceMappingURL=index.js.map