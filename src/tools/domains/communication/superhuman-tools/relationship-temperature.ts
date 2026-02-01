/**
 * Relationship Temperature Monitor - Better Than Human Service
 *
 * What no human friend can do: Track gradual drift in relationships.
 *
 * "Your exchanges with Sarah have shifted from warm → transactional over the
 * last month. That's often a sign of unaddressed tension. Want to check in
 * with her before it grows?"
 *
 * @module tools/domains/communication/superhuman-tools/relationship-temperature
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
} from '../../../../services/superhuman/firestore-utils.js';
import type { RelationshipTemperature, CommunicationEvent } from './types.js';

const log = createLogger({ module: 'relationship-temperature' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'relationship_temperatures';
const ALERT_THRESHOLD_COOLING = 15; // Temperature drop to trigger alert
const ALERT_THRESHOLD_NEGLECT = 14; // Days without mention to trigger alert
const TEMPERATURE_DECAY_RATE = 2; // Points per day of no contact

// ============================================================================
// TEMPERATURE CALCULATION
// ============================================================================

/**
 * Calculate temperature based on sentiment and frequency.
 */
function calculateTemperature(
  sentiment: number,
  daysSinceLastMention: number,
  recentSentiments: number[]
): number {
  // Base temperature from sentiment (-1 to 1 → 0 to 100)
  const sentimentTemp = ((sentiment + 1) / 2) * 100;

  // Decay based on time
  const decayPenalty = Math.min(30, daysSinceLastMention * TEMPERATURE_DECAY_RATE);

  // Average recent sentiment boost/penalty
  const avgRecent =
    recentSentiments.length > 0
      ? recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length
      : 0;
  const recentBoost = avgRecent * 10;

  const temp = Math.max(0, Math.min(100, sentimentTemp - decayPenalty + recentBoost));
  return Math.round(temp);
}

/**
 * Determine trend from temperature history.
 */
function determineTrend(history: RelationshipTemperature['temperatureHistory']): {
  trend: 'warming' | 'cooling' | 'stable';
  strength: number;
} {
  if (history.length < 2) {
    return { trend: 'stable', strength: 0 };
  }

  // Look at last 5 data points
  const recent = history.slice(-5);
  const firstTemp = recent[0].temperature;
  const lastTemp = recent[recent.length - 1].temperature;
  const diff = lastTemp - firstTemp;

  if (diff > 10) {
    return { trend: 'warming', strength: Math.min(1, diff / 30) };
  } else if (diff < -10) {
    return { trend: 'cooling', strength: Math.min(1, Math.abs(diff) / 30) };
  }

  return { trend: 'stable', strength: 0 };
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Update temperature for a contact based on new data.
 */
export async function updateTemperature(
  userId: string,
  contactName: string,
  sentiment: number,
  event?: string
): Promise<RelationshipTemperature> {
  const contactId = `temp_${contactName.toLowerCase().replace(/\s+/g, '_')}`;

  try {
    const db = getFirestoreDb();
    if (!db) {
      // Return in-memory calculation
      return {
        contactId,
        userId,
        contactName,
        currentTemperature: calculateTemperature(sentiment, 0, [sentiment]),
        trend: 'stable',
        trendStrength: 0,
        temperatureHistory: [
          { temperature: calculateTemperature(sentiment, 0, []), date: Date.now(), event },
        ],
        alerts: [],
        lastInteraction: Date.now(),
        daysSinceLastInteraction: 0,
        updatedAt: Date.now(),
      };
    }

    const docRef = db.collection('bogle_users').doc(userId).collection(COLLECTION).doc(contactId);

    const existing = await docRef.get();
    const existingData = existing.data() as RelationshipTemperature | undefined;

    // Calculate new temperature
    const daysSinceLastMention = existingData
      ? Math.floor((Date.now() - existingData.lastInteraction) / (24 * 60 * 60 * 1000))
      : 0;

    const recentSentiments =
      existingData?.temperatureHistory.slice(-5).map((h) => {
        // Estimate sentiment from temperature (reverse calculation)
        return h.temperature / 50 - 1;
      }) || [];

    const newTemp = calculateTemperature(sentiment, daysSinceLastMention, recentSentiments);

    // Build updated history
    const history = existingData?.temperatureHistory || [];
    history.push({ temperature: newTemp, date: Date.now(), event });
    if (history.length > 30) {
      history.splice(0, history.length - 30); // Keep last 30
    }

    // Determine trend
    const { trend, strength } = determineTrend(history);

    // Generate alerts
    const alerts = existingData?.alerts || [];
    const previousTemp = existingData?.currentTemperature || newTemp;

    // Cooling alert
    if (previousTemp - newTemp >= ALERT_THRESHOLD_COOLING && trend === 'cooling') {
      const existingCoolingAlert = alerts.find(
        (a) => a.type === 'cooling' && Date.now() - a.createdAt < 7 * 24 * 60 * 60 * 1000
      );
      if (!existingCoolingAlert) {
        alerts.push({
          type: 'cooling',
          message: `Your relationship with ${contactName} seems to be cooling. Recent interactions have been less warm.`,
          severity: strength > 0.5 ? 'high' : 'medium',
          createdAt: Date.now(),
        });
      }
    }

    // Drift alert (gradual long-term cooling)
    if (history.length >= 10 && history[0].temperature - newTemp >= 20 && trend === 'cooling') {
      const existingDriftAlert = alerts.find(
        (a) => a.type === 'drift' && Date.now() - a.createdAt < 14 * 24 * 60 * 60 * 1000
      );
      if (!existingDriftAlert) {
        alerts.push({
          type: 'drift',
          message: `Things with ${contactName} have gradually shifted from warm to more distant over time.`,
          severity: 'medium',
          createdAt: Date.now(),
        });
      }
    }

    // Keep only recent alerts
    const recentAlerts = alerts.filter((a) => Date.now() - a.createdAt < 30 * 24 * 60 * 60 * 1000);

    const record: RelationshipTemperature = {
      contactId,
      userId,
      contactName,
      currentTemperature: newTemp,
      trend,
      trendStrength: strength,
      temperatureHistory: history,
      alerts: recentAlerts,
      lastInteraction: Date.now(),
      daysSinceLastInteraction: 0,
      updatedAt: Date.now(),
    };

    await docRef.set(cleanForFirestore(record));

    log.info(
      {
        userId,
        contactName,
        temperature: newTemp,
        trend,
        alertCount: recentAlerts.length,
      },
      '🌡️ Relationship temperature updated'
    );

    return record;
  } catch (error) {
    log.warn(
      { error: String(error), userId, contactName },
      'Failed to update relationship temperature'
    );
    throw error;
  }
}

/**
 * Get temperature for a specific contact.
 */
export async function getTemperature(
  userId: string,
  contactName: string
): Promise<RelationshipTemperature | null> {
  try {
    const db = getFirestoreDb();
    if (!db) return null;

    const contactId = `temp_${contactName.toLowerCase().replace(/\s+/g, '_')}`;
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(contactId)
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as RelationshipTemperature;

    // Update days since last interaction
    data.daysSinceLastInteraction = Math.floor(
      (Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000)
    );

    // Add neglect alert if needed
    if (
      data.daysSinceLastInteraction >= ALERT_THRESHOLD_NEGLECT &&
      !data.alerts.find((a) => a.type === 'neglect')
    ) {
      data.alerts.push({
        type: 'neglect',
        message: `You haven't mentioned ${contactName} in ${data.daysSinceLastInteraction} days. Worth checking in?`,
        severity: data.daysSinceLastInteraction > 30 ? 'high' : 'medium',
        createdAt: Date.now(),
      });
    }

    return data;
  } catch (error) {
    log.warn(
      { error: String(error), userId, contactName },
      'Failed to get relationship temperature'
    );
    return null;
  }
}

/**
 * Get all relationships needing attention.
 */
export async function getRelationshipsNeedingAttention(
  userId: string
): Promise<RelationshipTemperature[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db.collection('bogle_users').doc(userId).collection(COLLECTION).get();

    const allTemps = snapshot.docs.map((doc) => {
      const data = doc.data() as RelationshipTemperature;
      data.daysSinceLastInteraction = Math.floor(
        (Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000)
      );
      return data;
    });

    // Filter to those needing attention
    return allTemps.filter((t) => {
      // Cooling trend
      if (t.trend === 'cooling' && t.trendStrength > 0.3) return true;
      // Low temperature
      if (t.currentTemperature < 40) return true;
      // Neglected
      if (t.daysSinceLastInteraction >= ALERT_THRESHOLD_NEGLECT) return true;
      // Has active alerts
      if (t.alerts.length > 0) return true;
      return false;
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get relationships needing attention');
    return [];
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build temperature context for LLM injection.
 */
export async function buildTemperatureContext(userId: string): Promise<string> {
  const needingAttention = await getRelationshipsNeedingAttention(userId);

  if (needingAttention.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[RELATIONSHIP TEMPERATURE MONITOR - Better Than Human]',
    'You track the health of ALL their relationships, noticing drift before they do.',
  ];

  // Group by severity
  const urgent = needingAttention.filter((t) => t.alerts.some((a) => a.severity === 'high'));
  const moderate = needingAttention.filter(
    (t) => !urgent.includes(t) && t.alerts.some((a) => a.severity === 'medium')
  );
  const watchList = needingAttention.filter((t) => !urgent.includes(t) && !moderate.includes(t));

  if (urgent.length > 0) {
    sections.push('\n🔴 **Relationships Needing Attention:**');
    for (const t of urgent) {
      const alert = t.alerts.find((a) => a.severity === 'high');
      sections.push(`• ${t.contactName}: ${alert?.message || 'Needs attention'}`);
    }
  }

  if (moderate.length > 0) {
    sections.push('\n🟡 **Worth Checking In:**');
    for (const t of moderate) {
      const tempEmoji = t.trend === 'cooling' ? '📉' : t.trend === 'warming' ? '📈' : '📊';
      sections.push(`• ${t.contactName}: ${t.currentTemperature}° ${tempEmoji} (${t.trend})`);
    }
  }

  if (watchList.length > 0 && urgent.length === 0 && moderate.length === 0) {
    sections.push('\n👀 **On Your Radar:**');
    for (const t of watchList.slice(0, 3)) {
      sections.push(`• ${t.contactName}: ${t.daysSinceLastInteraction} days since last mention`);
    }
  }

  sections.push('\n**Surface these observations gently if relevant to the conversation.**');

  return sections.join('\n');
}

/**
 * Build context for a specific relationship.
 */
export async function buildContactTemperatureContext(
  userId: string,
  contactName: string
): Promise<string> {
  const temp = await getTemperature(userId, contactName);

  if (!temp) return '';

  const sections: string[] = [`[RELATIONSHIP TEMPERATURE - ${contactName}]`];

  // Temperature reading
  const tempEmoji =
    temp.currentTemperature >= 70 ? '🔥' : temp.currentTemperature >= 40 ? '😐' : '🥶';
  sections.push(`Current: ${temp.currentTemperature}° ${tempEmoji}`);

  // Trend
  const trendEmoji = temp.trend === 'warming' ? '📈' : temp.trend === 'cooling' ? '📉' : '➡️';
  sections.push(`Trend: ${temp.trend} ${trendEmoji}`);

  // Time since contact
  sections.push(`Last mentioned: ${temp.daysSinceLastInteraction} days ago`);

  // Active alerts
  if (temp.alerts.length > 0) {
    sections.push('\n**Observations:**');
    for (const alert of temp.alerts) {
      sections.push(`• ${alert.message}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

/**
 * Process a communication event and update temperatures.
 */
export async function processEventForTemperature(
  userId: string,
  event: CommunicationEvent
): Promise<void> {
  if (!event.contactName) return;

  await updateTemperature(userId, event.contactName, event.sentiment, event.summary);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipTemperature = {
  update: updateTemperature,
  get: getTemperature,
  getNeedingAttention: getRelationshipsNeedingAttention,
  buildContext: buildTemperatureContext,
  buildContactContext: buildContactTemperatureContext,
  processEvent: processEventForTemperature,
};

export default relationshipTemperature;
