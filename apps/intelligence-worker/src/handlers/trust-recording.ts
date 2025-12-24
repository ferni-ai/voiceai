/**
 * Trust Recording Handler
 *
 * Records trust signals between user and Ferni personas.
 * Part of the "Better than Human" trust-building system.
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type { IntelligenceEvent, TrustRecordingPayload, ProcessingResult } from '../types.js';

const log = createLogger('trust-recording');

// ============================================================================
// HANDLER
// ============================================================================

export async function handleTrustRecording(
  db: Firestore,
  event: IntelligenceEvent,
  dryRun: boolean
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const payload = event.payload as TrustRecordingPayload;

  try {
    log.info(
      {
        eventId: event.eventId,
        userId: event.userId,
        personaId: payload.personaId,
        signalType: payload.signalType,
        confidence: payload.confidence,
      },
      'Processing trust recording'
    );

    if (!dryRun) {
      // Record the trust signal
      const signalsRef = db
        .collection('bogle_users')
        .doc(event.userId)
        .collection('trust_signals');

      await signalsRef.add({
        sessionId: event.sessionId,
        personaId: payload.personaId,
        signalType: payload.signalType,
        context: payload.context,
        confidence: payload.confidence,
        timestamp: new Date(event.timestamp),
        sourceEventId: event.eventId,
      });

      // Update trust summary for quick access
      await updateTrustSummary(db, event.userId, payload);
    }

    return {
      success: true,
      eventId: event.eventId,
      eventType: 'trust_recording',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error, eventId: event.eventId }, 'Trust recording failed');
    return {
      success: false,
      eventId: event.eventId,
      eventType: 'trust_recording',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function updateTrustSummary(
  db: Firestore,
  userId: string,
  payload: TrustRecordingPayload
): Promise<void> {
  const summaryRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('trust_profiles')
    .doc(payload.personaId);

  await db.runTransaction(async (transaction) => {
    const summaryDoc = await transaction.get(summaryRef);

    const currentSummary = summaryDoc.exists
      ? (summaryDoc.data() as Record<string, unknown>)
      : {
          totalSignals: 0,
          signalCounts: {} as Record<string, number>,
          lastSignal: null,
          trustScore: 0.5,
        };

    // Update signal counts
    const signalCounts = (currentSummary.signalCounts as Record<string, number>) || {};
    signalCounts[payload.signalType] = (signalCounts[payload.signalType] || 0) + 1;

    // Calculate updated trust score (simplified)
    const totalSignals = ((currentSummary.totalSignals as number) || 0) + 1;
    const positiveSignals =
      (signalCounts['vulnerability_shared'] || 0) +
      (signalCounts['boundary_respected'] || 0) +
      (signalCounts['growth_noted'] || 0) +
      (signalCounts['callback_made'] || 0);

    const trustScore = Math.min(0.3 + (positiveSignals / totalSignals) * 0.6, 0.95);

    transaction.set(
      summaryRef,
      {
        totalSignals,
        signalCounts,
        lastSignal: new Date(),
        lastSignalType: payload.signalType,
        trustScore,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });
}

