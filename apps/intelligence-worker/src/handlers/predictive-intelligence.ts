/**
 * Predictive Intelligence Handler
 *
 * Processes predictive intelligence events to build superhuman predictions.
 * Learns user patterns to anticipate needs before they're expressed.
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type {
  IntelligenceEvent,
  PredictiveIntelligencePayload,
  ProcessingResult,
} from '../types.js';

const log = createLogger('predictive-intelligence');

// ============================================================================
// PREDICTION TYPES
// ============================================================================

interface PredictionSignal {
  type: 'need_prediction' | 'mood_forecast' | 'topic_anticipation' | 'timing_pattern';
  confidence: number;
  prediction: string;
  suggestedAction?: string;
  validUntil: Date;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handlePredictiveIntelligence(
  db: Firestore,
  event: IntelligenceEvent,
  dryRun: boolean
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const payload = event.payload as PredictiveIntelligencePayload;

  try {
    log.info(
      {
        eventId: event.eventId,
        userId: event.userId,
        topic: payload.topic,
        emotion: payload.emotion,
        dayOfWeek: payload.dayOfWeek,
        hourOfDay: payload.hourOfDay,
      },
      'Processing predictive intelligence event'
    );

    // Store the signal for training
    const signalRef = db
      .collection('bogle_users')
      .doc(event.userId)
      .collection('predictive_signals');

    const signalData = {
      sessionId: event.sessionId,
      topic: payload.topic,
      emotion: payload.emotion,
      emotionIntensity: payload.emotionIntensity,
      voiceStrain: payload.voiceStrain,
      dayOfWeek: payload.dayOfWeek,
      hourOfDay: payload.hourOfDay,
      turnCount: payload.turnCount,
      sessionCount: payload.sessionCount,
      relationshipStage: payload.relationshipStage,
      timestamp: new Date(event.timestamp),
    };

    if (!dryRun) {
      await signalRef.add(signalData);
    }

    // Generate predictions based on accumulated signals
    const predictions = await generatePredictions(db, event.userId, signalData);

    // Store active predictions
    if (predictions.length > 0 && !dryRun) {
      const predictionsRef = db
        .collection('bogle_users')
        .doc(event.userId)
        .collection('active_predictions');

      // Clear expired predictions first
      const expiredSnap = await predictionsRef.where('validUntil', '<', new Date()).get();

      const batch = db.batch();
      for (const doc of expiredSnap.docs) {
        batch.delete(doc.ref);
      }

      // Add new predictions
      for (const prediction of predictions) {
        const predRef = predictionsRef.doc();
        batch.set(predRef, {
          ...prediction,
          createdAt: new Date(),
          sourceEventId: event.eventId,
        });
      }

      await batch.commit();

      log.info(
        {
          userId: event.userId,
          predictionCount: predictions.length,
          types: predictions.map((p) => p.type),
        },
        'Predictions generated and stored'
      );
    }

    return {
      success: true,
      eventId: event.eventId,
      eventType: 'predictive_intelligence',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error, eventId: event.eventId }, 'Predictive intelligence processing failed');
    return {
      success: false,
      eventId: event.eventId,
      eventType: 'predictive_intelligence',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// PREDICTION GENERATION
// ============================================================================

async function generatePredictions(
  db: Firestore,
  userId: string,
  currentSignal: {
    topic: string;
    emotion: string;
    emotionIntensity: number;
    dayOfWeek: number;
    hourOfDay: number;
    sessionCount: number;
  }
): Promise<PredictionSignal[]> {
  const predictions: PredictionSignal[] = [];

  // Get historical signals (last 60 days)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const historySnap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('predictive_signals')
    .where('timestamp', '>=', sixtyDaysAgo)
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get();

  if (historySnap.size < 10) {
    // Not enough data for predictions
    return predictions;
  }

  const signals = historySnap.docs.map((doc) => doc.data());

  // Predict next topic based on emotional state
  const emotionTopicMap = new Map<string, Map<string, number>>();
  for (const signal of signals) {
    const emotion = signal.emotion as string;
    const topic = signal.topic as string;
    if (!emotionTopicMap.has(emotion)) {
      emotionTopicMap.set(emotion, new Map());
    }
    const topicMap = emotionTopicMap.get(emotion)!;
    topicMap.set(topic, (topicMap.get(topic) || 0) + 1);
  }

  const currentEmotionTopics = emotionTopicMap.get(currentSignal.emotion);
  if (currentEmotionTopics && currentEmotionTopics.size > 0) {
    const sortedTopics = [...currentEmotionTopics.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedTopics[0][1] >= 3) {
      const validUntil = new Date();
      validUntil.setHours(validUntil.getHours() + 24);

      predictions.push({
        type: 'topic_anticipation',
        confidence: Math.min(sortedTopics[0][1] / 10, 0.9),
        prediction: `When ${currentSignal.emotion}, user often discusses ${sortedTopics[0][0]}`,
        suggestedAction: `Be prepared to discuss ${sortedTopics[0][0]}`,
        validUntil,
      });
    }
  }

  // Predict timing patterns
  const dayHourCounts = new Map<string, number>();
  for (const signal of signals) {
    const key = `${signal.dayOfWeek}-${signal.hourOfDay}`;
    dayHourCounts.set(key, (dayHourCounts.get(key) || 0) + 1);
  }

  const currentKey = `${currentSignal.dayOfWeek}-${currentSignal.hourOfDay}`;
  const currentCount = dayHourCounts.get(currentKey) || 0;

  if (currentCount >= 5) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    predictions.push({
      type: 'timing_pattern',
      confidence: Math.min(currentCount / 15, 0.85),
      prediction: `User typically engages on ${dayNames[currentSignal.dayOfWeek]}s around ${currentSignal.hourOfDay}:00`,
      suggestedAction: 'Consider proactive outreach at this time',
      validUntil,
    });
  }

  // Predict mood based on time of day trends
  const hourMoodMap = new Map<number, Map<string, number>>();
  for (const signal of signals) {
    const hour = signal.hourOfDay as number;
    const emotion = signal.emotion as string;
    if (!hourMoodMap.has(hour)) {
      hourMoodMap.set(hour, new Map());
    }
    const moodMap = hourMoodMap.get(hour)!;
    moodMap.set(emotion, (moodMap.get(emotion) || 0) + 1);
  }

  const currentHourMoods = hourMoodMap.get(currentSignal.hourOfDay);
  if (currentHourMoods && currentHourMoods.size > 0) {
    const sortedMoods = [...currentHourMoods.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedMoods[0][1] >= 4) {
      const validUntil = new Date();
      validUntil.setHours(validUntil.getHours() + 2);

      predictions.push({
        type: 'mood_forecast',
        confidence: Math.min(sortedMoods[0][1] / 10, 0.8),
        prediction: `User tends to feel ${sortedMoods[0][0]} around ${currentSignal.hourOfDay}:00`,
        validUntil,
      });
    }
  }

  return predictions;
}

