/**
 * Relationship Health Tracker
 *
 * "Better Than Human" - Track the quality and health of relationships
 * over time through on-behalf calls.
 *
 * Features:
 * - Track emotional tone across calls
 * - Detect relationship deterioration
 * - Celebrate improving relationships
 * - Notice patterns (e.g., "Mom seems tired lately")
 *
 * @module services/outreach/relationship-health-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'relationship-health' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize phone number for consistent storage
 */
function normalizePhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // If starts with 1 and has 11 digits, remove leading 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CallQualityMetrics {
  callId: string;
  timestamp: string;

  // Objective metrics
  objectiveAchieved: boolean;
  durationSeconds: number;

  // Emotional metrics (from superhuman analysis)
  overallSentiment: 'positive' | 'neutral' | 'negative';
  emotionalTone: string; // e.g., "warm", "tense", "rushed"

  // Engagement metrics
  recipientEngagement: 'high' | 'medium' | 'low';
  conversationDepth: 'deep' | 'medium' | 'shallow';

  // Red flags
  concernSignals?: string[];

  // Positive signals
  warmthSignals?: string[];
}

export interface RelationshipHealth {
  contactPhone: string;
  contactName: string;
  relationship: string;

  // Overall health score (0-100)
  healthScore: number;
  trend: 'improving' | 'stable' | 'declining';

  // Aggregated metrics
  totalCalls: number;
  successfulCalls: number;
  averageDuration: number;

  // Sentiment over time
  recentSentiments: Array<{
    date: string;
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
  sentimentTrend: 'warming' | 'stable' | 'cooling';

  // Patterns
  patterns: string[];
  concerns: string[];
  celebrations: string[];

  // Recommendations
  recommendations: string[];

  lastUpdated: string;
}

// ============================================================================
// HEALTH CALCULATION
// ============================================================================

/**
 * Calculate overall relationship health score
 */
function calculateHealthScore(
  metrics: CallQualityMetrics[],
  recentSentiments: Array<{ sentiment: string }>
): number {
  if (metrics.length === 0) return 50; // Neutral baseline

  let score = 50;

  // Factor 1: Call success rate (up to +20)
  const successRate = metrics.filter((m) => m.objectiveAchieved).length / metrics.length;
  score += successRate * 20;

  // Factor 2: Recent sentiment trend (up to +/-15)
  const recentPositive = recentSentiments.filter((s) => s.sentiment === 'positive').length;
  const recentNegative = recentSentiments.filter((s) => s.sentiment === 'negative').length;
  const sentimentRatio =
    recentSentiments.length > 0 ? (recentPositive - recentNegative) / recentSentiments.length : 0;
  score += sentimentRatio * 15;

  // Factor 3: Engagement quality (up to +10)
  const highEngagement = metrics.filter((m) => m.recipientEngagement === 'high').length;
  const engagementRatio = highEngagement / metrics.length;
  score += engagementRatio * 10;

  // Factor 4: Conversation depth (up to +5)
  const deepConversations = metrics.filter((m) => m.conversationDepth === 'deep').length;
  const depthRatio = deepConversations / metrics.length;
  score += depthRatio * 5;

  // Factor 5: Red flags penalty (up to -20)
  const concernCount = metrics.reduce((sum, m) => sum + (m.concernSignals?.length || 0), 0);
  score -= Math.min(concernCount * 2, 20);

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine trend based on historical scores
 */
function determineTrend(recentScores: number[]): 'improving' | 'stable' | 'declining' {
  if (recentScores.length < 2) return 'stable';

  const recent = recentScores.slice(-3);
  const older = recentScores.slice(-6, -3);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = recentAvg - olderAvg;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Detect patterns in call history
 */
function detectPatterns(metrics: CallQualityMetrics[]): string[] {
  const patterns: string[] = [];

  if (metrics.length < 3) return patterns;

  // Pattern: Consistently short calls
  const avgDuration = metrics.reduce((sum, m) => sum + m.durationSeconds, 0) / metrics.length;
  if (avgDuration < 120) {
    patterns.push('Calls tend to be brief');
  }

  // Pattern: Trending shorter
  const recentDurations = metrics.slice(-3).map((m) => m.durationSeconds);
  const olderDurations = metrics.slice(0, -3).map((m) => m.durationSeconds);
  if (olderDurations.length > 0) {
    const recentAvg = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
    const olderAvg = olderDurations.reduce((a, b) => a + b, 0) / olderDurations.length;
    if (recentAvg < olderAvg * 0.7) {
      patterns.push('Conversations getting shorter');
    }
  }

  // Pattern: Time-of-day preference
  // (Would need to add timestamp analysis)

  // Pattern: Low engagement
  const lowEngagement = metrics.filter((m) => m.recipientEngagement === 'low').length;
  if (lowEngagement > metrics.length * 0.5) {
    patterns.push('Often seems distracted or rushed');
  }

  return patterns;
}

/**
 * Generate personalized recommendations
 */
function generateRecommendations(health: Partial<RelationshipHealth>): string[] {
  const recommendations: string[] = [];

  if (health.healthScore !== undefined && health.healthScore < 40) {
    recommendations.push('Consider scheduling a longer, dedicated call to reconnect');
  }

  if (health.sentimentTrend === 'cooling') {
    recommendations.push('Try asking more open-ended questions to encourage sharing');
  }

  if (health.patterns?.includes('Calls tend to be brief')) {
    recommendations.push('Try calling at a different time when they might be less busy');
  }

  if (health.concerns && health.concerns.length > 0) {
    recommendations.push("Check in about how they're really doing - they may need support");
  }

  if (health.healthScore !== undefined && health.healthScore > 80) {
    recommendations.push('Relationship is strong! Keep up the regular check-ins');
  }

  return recommendations;
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Record call quality metrics
 */
export async function recordCallQuality(
  userId: string,
  contactPhone: string,
  metrics: Omit<CallQualityMetrics, 'timestamp'>,
  contactInfo?: { name?: string; relationship?: string }
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db || !contactPhone) return;

    const phoneKey = normalizePhone(contactPhone);

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .doc(phoneKey)
      .collection('call_metrics')
      .add({
        ...metrics,
        timestamp: new Date().toISOString(),
      });

    // Update contact info if provided
    if (contactInfo?.name || contactInfo?.relationship) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('relationship_health')
        .doc(phoneKey)
        .set(
          {
            contactPhone: phoneKey,
            ...(contactInfo.name && { contactName: contactInfo.name }),
            ...(contactInfo.relationship && { relationship: contactInfo.relationship }),
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    // Recalculate health
    await updateRelationshipHealth(userId, contactPhone);

    log.info(
      { userId, contactPhone: phoneKey, callId: metrics.callId },
      'Recorded call quality metrics'
    );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to record call quality');
  }
}

/**
 * Update overall relationship health
 */
async function updateRelationshipHealth(userId: string, contactPhone: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db || !contactPhone) return;

    const phoneKey = contactPhone.replace(/\D/g, '');

    // Get recent call metrics
    const metricsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .doc(phoneKey)
      .collection('call_metrics')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const metrics: CallQualityMetrics[] = [];
    metricsSnapshot.forEach((doc) => {
      metrics.push(doc.data() as CallQualityMetrics);
    });

    if (metrics.length === 0) return;

    // Get existing health doc
    const healthDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .doc(phoneKey)
      .get();

    const existing = healthDoc.exists ? (healthDoc.data() as Partial<RelationshipHealth>) : {};

    // Build recent sentiments
    const recentSentiments = metrics.slice(0, 5).map((m) => ({
      date: m.timestamp,
      sentiment: m.overallSentiment,
    }));

    // Determine sentiment trend
    const positiveCount = recentSentiments.filter((s) => s.sentiment === 'positive').length;
    const negativeCount = recentSentiments.filter((s) => s.sentiment === 'negative').length;
    const sentimentTrend =
      positiveCount > negativeCount + 1
        ? 'warming'
        : negativeCount > positiveCount + 1
          ? 'cooling'
          : 'stable';

    // Calculate health score
    const healthScore = calculateHealthScore(metrics, recentSentiments);

    // Get historical scores for trend
    const historicalScores = existing.healthScore
      ? [existing.healthScore, healthScore]
      : [healthScore];
    const trend = determineTrend(historicalScores);

    // Detect patterns
    const patterns = detectPatterns(metrics);

    // Extract concerns and celebrations
    const concerns: string[] = [];
    const celebrations: string[] = [];

    for (const m of metrics.slice(0, 5)) {
      if (m.concernSignals) {
        concerns.push(...m.concernSignals);
      }
      if (m.warmthSignals) {
        celebrations.push(...m.warmthSignals);
      }
    }

    // Build health object
    const health: RelationshipHealth = {
      contactPhone: phoneKey,
      contactName: existing.contactName || '',
      relationship: existing.relationship || 'family',
      healthScore,
      trend,
      totalCalls: metrics.length,
      successfulCalls: metrics.filter((m) => m.objectiveAchieved).length,
      averageDuration: metrics.reduce((sum, m) => sum + m.durationSeconds, 0) / metrics.length,
      recentSentiments,
      sentimentTrend,
      patterns,
      concerns: [...new Set(concerns)].slice(0, 5),
      celebrations: [...new Set(celebrations)].slice(0, 5),
      recommendations: [],
      lastUpdated: new Date().toISOString(),
    };

    // Generate recommendations
    health.recommendations = generateRecommendations(health);

    // Save
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .doc(phoneKey)
      .set(health);

    log.info({ userId, contactPhone: phoneKey, healthScore, trend }, 'Updated relationship health');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to update relationship health');
  }
}

/**
 * Get relationship health for a contact
 */
export async function getRelationshipHealth(
  userId: string,
  contactPhone: string
): Promise<RelationshipHealth | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db || !contactPhone) return null;

    const phoneKey = contactPhone.replace(/\D/g, '');

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .doc(phoneKey)
      .get();

    if (!doc.exists) return null;

    return doc.data() as RelationshipHealth;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get relationship health');
    return null;
  }
}

/**
 * Get all relationship health summaries for a user
 */
export async function getAllRelationshipHealth(userId: string): Promise<RelationshipHealth[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_health')
      .orderBy('healthScore', 'asc') // Lowest scores first (need attention)
      .limit(20)
      .get();

    const results: RelationshipHealth[] = [];
    snapshot.forEach((doc) => {
      results.push(doc.data() as RelationshipHealth);
    });

    return results;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get all relationship health');
    return [];
  }
}

// ============================================================================
// INTEGRATION WITH CALL ANALYSIS
// ============================================================================

/**
 * Extract call quality metrics from superhuman analysis
 */
export function extractCallQualityFromAnalysis(
  callId: string,
  durationSeconds: number,
  insights: {
    objectiveAchieved: boolean;
    emotionalTone: {
      overallSentiment: string;
      recipientMood?: string;
    };
    concernSignals?: string[];
    actionItems?: string[];
    messagesForUser?: string[];
  }
): Omit<CallQualityMetrics, 'timestamp'> {
  // Determine engagement based on action items and messages
  const hasActionItems = (insights.actionItems?.length || 0) > 0;
  const hasMessages = (insights.messagesForUser?.length || 0) > 0;

  let recipientEngagement: 'high' | 'medium' | 'low' = 'medium';
  if (hasActionItems && hasMessages) {
    recipientEngagement = 'high';
  } else if (!hasActionItems && !hasMessages && durationSeconds < 60) {
    recipientEngagement = 'low';
  }

  // Determine conversation depth
  let conversationDepth: 'deep' | 'medium' | 'shallow' = 'medium';
  if (durationSeconds > 300 && hasMessages) {
    conversationDepth = 'deep';
  } else if (durationSeconds < 60) {
    conversationDepth = 'shallow';
  }

  // Extract warmth signals from messages
  const warmthSignals: string[] = [];
  if (insights.messagesForUser) {
    for (const msg of insights.messagesForUser) {
      if (
        msg.toLowerCase().includes('love') ||
        msg.toLowerCase().includes('miss') ||
        msg.toLowerCase().includes('proud')
      ) {
        warmthSignals.push(msg);
      }
    }
  }

  return {
    callId,
    objectiveAchieved: insights.objectiveAchieved,
    durationSeconds,
    overallSentiment: insights.emotionalTone.overallSentiment as
      | 'positive'
      | 'neutral'
      | 'negative',
    emotionalTone: insights.emotionalTone.recipientMood || 'neutral',
    recipientEngagement,
    conversationDepth,
    concernSignals: insights.concernSignals,
    warmthSignals: warmthSignals.length > 0 ? warmthSignals : undefined,
  };
}

export default {
  recordCallQuality,
  getRelationshipHealth,
  getAllRelationshipHealth,
  extractCallQualityFromAnalysis,
};
