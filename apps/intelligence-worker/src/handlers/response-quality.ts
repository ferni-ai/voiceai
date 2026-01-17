/**
 * Response Quality Handler
 *
 * Tracks and analyzes response quality for continuous improvement.
 * Used by the collective learning system to improve all personas.
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type { IntelligenceEvent, ResponseQualityPayload, ProcessingResult } from '../types.js';

const log = createLogger('response-quality');

// ============================================================================
// HANDLER
// ============================================================================

export async function handleResponseQuality(
  db: Firestore,
  event: IntelligenceEvent,
  dryRun: boolean
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const payload = event.payload as ResponseQualityPayload;

  try {
    log.info(
      {
        eventId: event.eventId,
        userId: event.userId,
        personaId: payload.personaId,
        turnNumber: payload.turnNumber,
        latencyMs: payload.latencyMs,
      },
      'Processing response quality'
    );

    // Analyze response quality
    const qualityMetrics = analyzeResponseQuality(payload);

    if (!dryRun) {
      // Store the quality record
      const qualityRef = db
        .collection('bogle_users')
        .doc(event.userId)
        .collection('response_quality');

      await qualityRef.add({
        sessionId: event.sessionId,
        personaId: payload.personaId,
        turnNumber: payload.turnNumber,
        userMessageLength: payload.userMessage.length,
        responseLength: payload.agentResponse.length,
        latencyMs: payload.latencyMs,
        wasInterrupted: payload.wasInterrupted,
        ...qualityMetrics,
        timestamp: new Date(event.timestamp),
        sourceEventId: event.eventId,
      });

      // Update aggregate metrics for the persona
      await updatePersonaQualityMetrics(db, payload.personaId, qualityMetrics);

      // Contribute to community insights (anonymized)
      await contributeToCommunityInsights(db, payload.personaId, qualityMetrics);
    }

    return {
      success: true,
      eventId: event.eventId,
      eventType: 'response_quality',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error, eventId: event.eventId }, 'Response quality processing failed');
    return {
      success: false,
      eventId: event.eventId,
      eventType: 'response_quality',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// QUALITY ANALYSIS
// ============================================================================

interface QualityMetrics {
  responseRatio: number;
  hasQuestion: boolean;
  hasEmpathy: boolean;
  hasPersonalization: boolean;
  readabilityScore: number;
  sentenceCount: number;
  avgSentenceLength: number;
}

function analyzeResponseQuality(payload: ResponseQualityPayload): QualityMetrics {
  const response = payload.agentResponse;

  // Response ratio (response length / user message length)
  const responseRatio =
    payload.userMessage.length > 0 ? response.length / payload.userMessage.length : 1;

  // Check for question (engagement indicator)
  const hasQuestion = /\?/.test(response);

  // Check for empathy markers
  const empathyPatterns = [
    /i (understand|hear you|can see|imagine)/i,
    /that (sounds|must be|seems)/i,
    /it'?s (okay|natural|understandable)/i,
    /i'?m (here|with you|sorry)/i,
  ];
  const hasEmpathy = empathyPatterns.some((p) => p.test(response));

  // Check for personalization (uses "you" or specific references)
  const hasPersonalization = /\byou\b/i.test(response) || /\byour\b/i.test(response);

  // Count sentences
  const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? response.length / sentenceCount : 0;

  // Simple readability score (Flesch-like, simplified)
  // Higher is better (more readable)
  const wordCount = response.split(/\s+/).length;
  const avgWordLength = wordCount > 0 ? response.replace(/\s/g, '').length / wordCount : 0;
  const readabilityScore = Math.max(0, 100 - avgWordLength * 10 - avgSentenceLength * 0.5);

  return {
    responseRatio,
    hasQuestion,
    hasEmpathy,
    hasPersonalization,
    readabilityScore,
    sentenceCount,
    avgSentenceLength,
  };
}

async function updatePersonaQualityMetrics(
  db: Firestore,
  personaId: string,
  metrics: QualityMetrics
): Promise<void> {
  const metricsRef = db.collection('persona_metrics').doc(personaId);

  await db.runTransaction(async (transaction) => {
    const metricsDoc = await transaction.get(metricsRef);

    const current = metricsDoc.exists
      ? (metricsDoc.data() as Record<string, number>)
      : {
          totalResponses: 0,
          avgResponseRatio: 0,
          questionRate: 0,
          empathyRate: 0,
          personalizationRate: 0,
          avgReadability: 0,
        };

    const total = (current.totalResponses || 0) + 1;

    // Running averages
    const avgResponseRatio =
      ((current.avgResponseRatio || 0) * (total - 1) + metrics.responseRatio) / total;
    const questionRate =
      ((current.questionRate || 0) * (total - 1) + (metrics.hasQuestion ? 1 : 0)) / total;
    const empathyRate =
      ((current.empathyRate || 0) * (total - 1) + (metrics.hasEmpathy ? 1 : 0)) / total;
    const personalizationRate =
      ((current.personalizationRate || 0) * (total - 1) + (metrics.hasPersonalization ? 1 : 0)) /
      total;
    const avgReadability =
      ((current.avgReadability || 0) * (total - 1) + metrics.readabilityScore) / total;

    transaction.set(
      metricsRef,
      {
        totalResponses: total,
        avgResponseRatio,
        questionRate,
        empathyRate,
        personalizationRate,
        avgReadability,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });
}

async function contributeToCommunityInsights(
  db: Firestore,
  personaId: string,
  metrics: QualityMetrics
): Promise<void> {
  // Store anonymized metrics for community learning
  const insightsRef = db.collection('community_insights').doc('response_quality');

  await db.runTransaction(async (transaction) => {
    const insightsDoc = await transaction.get(insightsRef);

    const current = insightsDoc.exists
      ? (insightsDoc.data() as { totalSamples?: number; byPersona?: Record<string, { samples: number; empathyRate: number; questionRate: number }> })
      : {
          totalSamples: 0,
          byPersona: {} as Record<string, { samples: number; empathyRate: number; questionRate: number }>,
        };

    const total = (current.totalSamples || 0) + 1;
    const byPersona = current.byPersona || {} as Record<string, { samples: number; empathyRate: number; questionRate: number }>;

    if (!byPersona[personaId]) {
      byPersona[personaId] = { samples: 0, empathyRate: 0, questionRate: 0 };
    }

    const personaTotal = byPersona[personaId].samples + 1;
    byPersona[personaId] = {
      samples: personaTotal,
      empathyRate:
        (byPersona[personaId].empathyRate * (personaTotal - 1) + (metrics.hasEmpathy ? 1 : 0)) /
        personaTotal,
      questionRate:
        (byPersona[personaId].questionRate * (personaTotal - 1) + (metrics.hasQuestion ? 1 : 0)) /
        personaTotal,
    };

    transaction.set(
      insightsRef,
      {
        totalSamples: total,
        byPersona,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });
}

