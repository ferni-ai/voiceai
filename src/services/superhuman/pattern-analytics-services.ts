/**
 * Pattern Analytics Services
 *
 * "Better Than Human" persistence layer for pattern recognition capabilities.
 * These services provide the superhuman memory that makes pattern analytics transcendent.
 *
 * SERVICES:
 *   1. Blind Spot Mirror - Patterns they're avoiding
 *   2. Counterfactual Simulator - Roads not taken
 *   3. Pattern Prediction - Where trajectories are heading
 *   4. Decision Quality - Rate decisions over time
 *   5. Correlation Finder - Cross-domain connections
 *   6. Anomaly Detector - Unusual patterns
 *   7. Insight Archive - Personal knowledge base
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/blind_spots
 *   bogle_users/{userId}/counterfactuals
 *   bogle_users/{userId}/pattern_predictions
 *   bogle_users/{userId}/decision_scores
 *   bogle_users/{userId}/correlations
 *   bogle_users/{userId}/anomalies
 *   bogle_users/{userId}/insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import {
  onBlindSpotChange,
  onCounterfactualChange,
  onPatternPredictionChange,
  onDecisionScoreChange,
  onCorrelationChange,
  onAnomalyChange,
  onInsightChange,
} from '../data-layer/hooks/superhuman-hooks.js';

const log = createLogger({ module: 'superhuman:pattern-analytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface BlindSpot {
  domain: string;
  observation: string;
  evidence?: string;
  recordedAt: string;
}

export interface Counterfactual {
  originalDecision: string;
  alternativePath: string;
  domain: string;
  outcome?: string;
  lesson?: string;
  recordedAt: string;
}

export interface PatternPrediction {
  pattern: string;
  domain: string;
  currentTrajectory: 'improving' | 'declining' | 'stable' | 'volatile';
  prediction?: string;
  timeframe?: string;
  recordedAt: string;
}

export interface DecisionScore {
  decision: string;
  domain: string;
  outcome: 'great' | 'good' | 'neutral' | 'poor' | 'bad';
  processQuality?: string;
  lesson?: string;
  recordedAt: string;
}

export interface Correlation {
  factor1: string;
  factor2: string;
  relationship: 'positive' | 'negative' | 'complex' | 'unknown';
  strength?: 'weak' | 'moderate' | 'strong';
  insight?: string;
  recordedAt: string;
}

export interface Anomaly {
  anomaly: string;
  domain: string;
  severity: 'info' | 'warning' | 'alert';
  interpretation?: string;
  recordedAt: string;
}

export interface Insight {
  insight: string;
  domain: string;
  source: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  recordedAt: string;
}

// ============================================================================
// BLIND SPOT SERVICE
// ============================================================================

export async function recordBlindSpot(userId: string, blindSpot: BlindSpot): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping blind spot recording');
    return;
  }

  try {
    const docRef = await db.collection('bogle_users').doc(userId).collection('blind_spots').add(blindSpot);
    void onBlindSpotChange(userId, docRef.id, blindSpot, 'create');
    log.info({ userId, domain: blindSpot.domain }, 'Blind spot recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record blind spot');
  }
}

export async function getBlindSpots(userId: string, domain?: string): Promise<BlindSpot[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('blind_spots');

    if (domain && domain !== 'general') {
      query = query.where('domain', '==', domain) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as BlindSpot);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get blind spots');
    return [];
  }
}

// ============================================================================
// COUNTERFACTUAL SERVICE
// ============================================================================

export async function recordCounterfactual(
  userId: string,
  counterfactual: Counterfactual
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping counterfactual recording');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('counterfactuals')
      .add(counterfactual);
    void onCounterfactualChange(userId, docRef.id, counterfactual, 'create');
    log.info({ userId }, 'Counterfactual recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record counterfactual');
  }
}

export async function getCounterfactuals(userId: string): Promise<Counterfactual[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('counterfactuals')
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Counterfactual);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get counterfactuals');
    return [];
  }
}

// ============================================================================
// PATTERN PREDICTION SERVICE
// ============================================================================

export async function recordPatternPrediction(
  userId: string,
  prediction: PatternPrediction
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping pattern prediction recording');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pattern_predictions')
      .add(prediction);
    void onPatternPredictionChange(userId, docRef.id, prediction, 'create');
    log.info({ userId, domain: prediction.domain }, 'Pattern prediction recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record pattern prediction');
  }
}

export async function getPatternPredictions(
  userId: string,
  domain?: string
): Promise<PatternPrediction[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('pattern_predictions');

    if (domain && domain !== 'all') {
      query = query.where('domain', '==', domain) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as PatternPrediction);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get pattern predictions');
    return [];
  }
}

// ============================================================================
// DECISION SCORE SERVICE
// ============================================================================

export async function recordDecisionScore(userId: string, score: DecisionScore): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping decision score recording');
    return;
  }

  try {
    const docRef = await db.collection('bogle_users').doc(userId).collection('decision_scores').add(score);
    void onDecisionScoreChange(userId, docRef.id, score, 'create');
    log.info({ userId, domain: score.domain }, 'Decision score recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record decision score');
  }
}

export async function getDecisionScores(userId: string, domain?: string): Promise<DecisionScore[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('decision_scores');

    if (domain && domain !== 'all') {
      query = query.where('domain', '==', domain) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(100).get();
    return snapshot.docs.map((doc) => doc.data() as DecisionScore);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get decision scores');
    return [];
  }
}

// ============================================================================
// CORRELATION SERVICE
// ============================================================================

export async function recordCorrelation(userId: string, correlation: Correlation): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping correlation recording');
    return;
  }

  try {
    const docRef = await db.collection('bogle_users').doc(userId).collection('correlations').add(correlation);
    void onCorrelationChange(userId, docRef.id, correlation, 'create');
    log.info(
      { userId, factor1: correlation.factor1, factor2: correlation.factor2 },
      'Correlation recorded'
    );
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record correlation');
  }
}

export async function getCorrelations(userId: string): Promise<Correlation[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('correlations')
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Correlation);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get correlations');
    return [];
  }
}

// ============================================================================
// ANOMALY SERVICE
// ============================================================================

export async function recordAnomaly(userId: string, anomaly: Anomaly): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping anomaly recording');
    return;
  }

  try {
    const docRef = await db.collection('bogle_users').doc(userId).collection('anomalies').add(anomaly);
    void onAnomalyChange(userId, docRef.id, anomaly, 'create');
    log.info({ userId, domain: anomaly.domain, severity: anomaly.severity }, 'Anomaly recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record anomaly');
  }
}

export async function getAnomalies(userId: string): Promise<Anomaly[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('anomalies')
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Anomaly);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get anomalies');
    return [];
  }
}

// ============================================================================
// INSIGHT ARCHIVE SERVICE
// ============================================================================

export async function recordInsight(userId: string, insight: Insight): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping insight recording');
    return;
  }

  try {
    const docRef = await db.collection('bogle_users').doc(userId).collection('insights').add(insight);
    void onInsightChange(userId, docRef.id, insight, 'create');
    log.info({ userId, domain: insight.domain }, 'Insight recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record insight');
  }
}

export async function getInsights(userId: string, domain?: string): Promise<Insight[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('insights');

    if (domain && domain !== 'all') {
      query = query.where('domain', '==', domain) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(100).get();
    return snapshot.docs.map((doc) => doc.data() as Insight);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get insights');
    return [];
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export async function buildPeterAnalyticsContext(userId: string): Promise<string> {
  const [blindSpots, predictions, correlations, anomalies, insights] = await Promise.all([
    getBlindSpots(userId),
    getPatternPredictions(userId),
    getCorrelations(userId),
    getAnomalies(userId),
    getInsights(userId),
  ]);

  const lines: string[] = ['[PETER ANALYTICS MEMORY - Better Than Human]'];

  // Active blind spots
  if (blindSpots.length > 0) {
    lines.push(`\n**Blind Spots Watching:** ${blindSpots.length}`);
    const recent = blindSpots[0];
    lines.push(`Most recent (${recent.domain}): "${recent.observation}"`);
  }

  // Pattern trajectories
  const declining = predictions.filter((p) => p.currentTrajectory === 'declining');
  if (declining.length > 0) {
    lines.push(`\n**Declining Patterns:** ${declining.length}`);
    for (const d of declining.slice(0, 2)) {
      lines.push(`• ${d.pattern} (${d.domain})`);
    }
  }

  // Key correlations
  const strongCorrelations = correlations.filter((c) => c.strength === 'strong');
  if (strongCorrelations.length > 0) {
    lines.push(`\n**Strong Correlations:** ${strongCorrelations.length}`);
    const top = strongCorrelations[0];
    lines.push(`• ${top.factor1} ↔ ${top.factor2}: ${top.relationship}`);
  }

  // Active anomalies
  const alerts = anomalies.filter((a) => a.severity === 'alert' || a.severity === 'warning');
  if (alerts.length > 0) {
    lines.push(`\n**Active Alerts:** ${alerts.length}`);
    for (const a of alerts.slice(0, 2)) {
      lines.push(`• ${a.domain}: ${a.anomaly}`);
    }
  }

  // Critical insights
  const critical = insights.filter((i) => i.importance === 'critical' || i.importance === 'high');
  if (critical.length > 0) {
    lines.push(`\n**Key Insights:** ${critical.length} high-importance`);
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Blind Spots
  recordBlindSpot,
  getBlindSpots,
  // Counterfactuals
  recordCounterfactual,
  getCounterfactuals,
  // Pattern Predictions
  recordPatternPrediction,
  getPatternPredictions,
  // Decision Scores
  recordDecisionScore,
  getDecisionScores,
  // Correlations
  recordCorrelation,
  getCorrelations,
  // Anomalies
  recordAnomaly,
  getAnomalies,
  // Insights
  recordInsight,
  getInsights,
  // Context
  buildPeterAnalyticsContext,
};
