/**
 * Avoidance Pattern Persistence
 *
 * Store and retrieve avoidance patterns across sessions.
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection/persistence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { AvoidancePattern, AvoidanceSignal } from './types.js';
import { THRESHOLDS } from './detection-rules.js';

const log = createLogger({ module: 'AvoidancePersistence' });

// ============================================================================
// MOCK STORAGE (In production, use Firestore)
// ============================================================================

/**
 * In-memory storage for patterns (replaced with Firestore in production)
 */
const patternStorage = new Map<string, AvoidancePattern[]>();
const signalStorage = new Map<string, AvoidanceSignal[]>();

// ============================================================================
// PATTERN OPERATIONS
// ============================================================================

/**
 * Save a new avoidance signal and update patterns
 */
export async function saveSignal(userId: string, signal: AvoidanceSignal): Promise<void> {
  // Get existing signals
  const signals = signalStorage.get(userId) || [];
  signals.push(signal);

  // Keep last 100 signals
  if (signals.length > 100) {
    signals.shift();
  }

  signalStorage.set(userId, signals);

  // Update patterns
  await updatePatterns(userId, signals);

  log.debug(
    { userId, signalType: signal.type, topic: signal.avoidedTopic },
    'Avoidance signal saved'
  );
}

/**
 * Update patterns based on accumulated signals
 */
async function updatePatterns(userId: string, signals: AvoidanceSignal[]): Promise<void> {
  const patterns = new Map<string, AvoidancePattern>();

  // Group by topic
  for (const signal of signals) {
    const topic = signal.avoidedTopic.toLowerCase();
    const existing = patterns.get(topic);

    if (existing) {
      existing.frequency++;
      if (!existing.signalTypes.includes(signal.type)) {
        existing.signalTypes.push(signal.type);
      }
      if (!existing.sessionIds.includes(signal.sessionId)) {
        existing.sessionIds.push(signal.sessionId);
      }
      existing.lastDetected = signal.timestamp;
    } else {
      patterns.set(topic, {
        topic,
        frequency: 1,
        signalTypes: [signal.type],
        sessionIds: [signal.sessionId],
        firstDetected: signal.timestamp,
        lastDetected: signal.timestamp,
        acknowledged: false,
        strength: 0,
      });
    }
  }

  // Calculate strength for each pattern
  for (const pattern of patterns.values()) {
    pattern.strength = calculatePatternStrength(pattern);
  }

  // Save patterns
  patternStorage.set(
    userId,
    Array.from(patterns.values()).filter((p) => p.frequency >= THRESHOLDS.minSignalsForPattern)
  );
}

/**
 * Calculate pattern strength (0-1)
 */
function calculatePatternStrength(pattern: AvoidancePattern): number {
  let strength = 0;

  // Frequency contribution (up to 0.4)
  strength += Math.min(0.4, pattern.frequency * 0.1);

  // Session diversity contribution (up to 0.3)
  strength += Math.min(0.3, pattern.sessionIds.length * 0.1);

  // Signal type diversity (up to 0.2)
  strength += Math.min(0.2, pattern.signalTypes.length * 0.1);

  // Recency bonus (up to 0.1)
  const daysSinceLastDetection =
    (Date.now() - new Date(pattern.lastDetected).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLastDetection < 7) {
    strength += 0.1;
  }

  return Math.min(1, strength);
}

/**
 * Get all patterns for a user
 */
export async function getPatterns(userId: string): Promise<AvoidancePattern[]> {
  return patternStorage.get(userId) || [];
}

/**
 * Get strong patterns for a user
 */
export async function getStrongPatterns(
  userId: string,
  threshold: number = THRESHOLDS.strongPatternThreshold
): Promise<AvoidancePattern[]> {
  const patterns = await getPatterns(userId);
  return patterns.filter((p) => p.strength >= threshold);
}

/**
 * Get patterns for specific topics
 */
export async function getPatternsByTopics(
  userId: string,
  topics: string[]
): Promise<AvoidancePattern[]> {
  const patterns = await getPatterns(userId);
  const normalizedTopics = topics.map((t) => t.toLowerCase());
  return patterns.filter((p) => normalizedTopics.includes(p.topic.toLowerCase()));
}

/**
 * Mark a pattern as acknowledged
 */
export async function acknowledgePattern(userId: string, topic: string): Promise<void> {
  const patterns = patternStorage.get(userId) || [];
  const pattern = patterns.find((p) => p.topic.toLowerCase() === topic.toLowerCase());

  if (pattern) {
    pattern.acknowledged = true;
    log.debug({ userId, topic }, 'Pattern acknowledged');
  }
}

/**
 * Get recent signals for a session
 */
export async function getSessionSignals(
  userId: string,
  sessionId: string
): Promise<AvoidanceSignal[]> {
  const signals = signalStorage.get(userId) || [];
  return signals.filter((s) => s.sessionId === sessionId);
}

/**
 * Clear all data for a user (for testing)
 */
export async function clearUserData(userId: string): Promise<void> {
  patternStorage.delete(userId);
  signalStorage.delete(userId);
}
