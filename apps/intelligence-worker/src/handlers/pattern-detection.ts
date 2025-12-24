/**
 * Pattern Detection Handler
 *
 * Processes pattern detection events from the voice agent.
 * Detects cross-session patterns in user behavior and conversation.
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type { IntelligenceEvent, PatternDetectionPayload, ProcessingResult } from '../types.js';

const log = createLogger('pattern-detection');

// ============================================================================
// PATTERN TYPES
// ============================================================================

interface DetectedPattern {
  type: 'recurring_topic' | 'emotional_trend' | 'time_correlation' | 'growth_indicator';
  confidence: number;
  description: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handlePatternDetection(
  db: Firestore,
  event: IntelligenceEvent,
  dryRun: boolean
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const payload = event.payload as PatternDetectionPayload;

  try {
    log.info(
      {
        eventId: event.eventId,
        userId: event.userId,
        topic: payload.topic,
        emotion: payload.emotion,
      },
      'Processing pattern detection event'
    );

    // Get user's recent conversation history for pattern analysis
    const historyRef = db
      .collection('bogle_users')
      .doc(event.userId)
      .collection('conversation_patterns');

    // Store this data point
    const dataPoint = {
      sessionId: event.sessionId,
      topic: payload.topic,
      emotion: payload.emotion,
      messageLength: payload.message.length,
      timestamp: new Date(event.timestamp),
      hour: new Date(event.timestamp).getHours(),
      dayOfWeek: new Date(event.timestamp).getDay(),
    };

    if (!dryRun) {
      await historyRef.add(dataPoint);
    }

    // Detect patterns (simplified - in production would use ML)
    const patterns = await detectPatterns(db, event.userId, dataPoint);

    // Store detected patterns
    if (patterns.length > 0 && !dryRun) {
      const patternsRef = db
        .collection('bogle_users')
        .doc(event.userId)
        .collection('detected_patterns');

      for (const pattern of patterns) {
        await patternsRef.add({
          ...pattern,
          detectedAt: new Date(),
          sourceEventId: event.eventId,
        });
      }

      log.info(
        {
          userId: event.userId,
          patternCount: patterns.length,
          patterns: patterns.map((p) => p.type),
        },
        'Patterns detected and stored'
      );
    }

    return {
      success: true,
      eventId: event.eventId,
      eventType: 'pattern_detection',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error, eventId: event.eventId }, 'Pattern detection failed');
    return {
      success: false,
      eventId: event.eventId,
      eventType: 'pattern_detection',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// PATTERN DETECTION LOGIC
// ============================================================================

async function detectPatterns(
  db: Firestore,
  userId: string,
  currentPoint: {
    topic: string;
    emotion: string;
    hour: number;
    dayOfWeek: number;
  }
): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = [];

  // Get recent data points (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historySnap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversation_patterns')
    .where('timestamp', '>=', thirtyDaysAgo)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  if (historySnap.empty) {
    return patterns;
  }

  const dataPoints = historySnap.docs.map((doc) => doc.data());

  // Detect recurring topic pattern
  const topicCounts = new Map<string, number>();
  for (const point of dataPoints) {
    const topic = point.topic as string;
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  }

  const currentTopicCount = topicCounts.get(currentPoint.topic) || 0;
  if (currentTopicCount >= 5) {
    patterns.push({
      type: 'recurring_topic',
      confidence: Math.min(currentTopicCount / 10, 1),
      description: `User frequently discusses "${currentPoint.topic}"`,
      metadata: {
        topic: currentPoint.topic,
        occurrences: currentTopicCount,
        totalDataPoints: dataPoints.length,
      },
    });
  }

  // Detect time correlation pattern
  const sameHourCount = dataPoints.filter((p) => p.hour === currentPoint.hour).length;
  if (sameHourCount >= 3 && dataPoints.length >= 10) {
    const percentage = sameHourCount / dataPoints.length;
    if (percentage > 0.3) {
      patterns.push({
        type: 'time_correlation',
        confidence: percentage,
        description: `User tends to engage around ${currentPoint.hour}:00`,
        metadata: {
          hour: currentPoint.hour,
          occurrences: sameHourCount,
          percentage: Math.round(percentage * 100),
        },
      });
    }
  }

  // Detect emotional trend
  const emotionCounts = new Map<string, number>();
  for (const point of dataPoints) {
    const emotion = point.emotion as string;
    emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + 1);
  }

  const dominantEmotion = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominantEmotion && dominantEmotion[1] >= 5) {
    const percentage = dominantEmotion[1] / dataPoints.length;
    if (percentage > 0.4) {
      patterns.push({
        type: 'emotional_trend',
        confidence: percentage,
        description: `User often expresses ${dominantEmotion[0]}`,
        metadata: {
          emotion: dominantEmotion[0],
          occurrences: dominantEmotion[1],
          percentage: Math.round(percentage * 100),
        },
      });
    }
  }

  return patterns;
}

