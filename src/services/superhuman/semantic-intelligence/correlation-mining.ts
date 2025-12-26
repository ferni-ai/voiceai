/**
 * Semantic Correlation Mining - Better Than Human Service
 *
 * "Connect dots the user can't see"
 *
 * Cross-correlates semantically related patterns across different domains
 * to surface insights humans miss:
 *   - "Monday stress" + "coffee spike" + "sleep complaints" →
 *     "Sunday night insomnia causes Monday productivity spiral"
 *
 * @module services/superhuman/semantic-intelligence/correlation-mining
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb } from '../firestore-utils.js';
import type {
  SemanticCorrelation,
  CorrelationDomain,
  InsightType,
  CoOccurrence,
} from './types.js';

const log = createLogger({ module: 'correlation-mining' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_COOCCURRENCES: 3, // Minimum co-occurrences before creating correlation
  MIN_STRENGTH: 0.3, // Minimum correlation strength to keep
  DECAY_HALF_LIFE_DAYS: 30, // How quickly old correlations fade
  MAX_CORRELATIONS_PER_USER: 100,
  SIMILARITY_THRESHOLD: 0.75, // Semantic similarity threshold
  TIME_WINDOW_MS: 60 * 60 * 1000, // 1 hour window for co-occurrence
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

interface ObservationBuffer {
  domain: CorrelationDomain;
  pattern: string;
  embedding?: number[];
  timestamp: number;
  context?: string;
}

const observationBuffers = new Map<string, ObservationBuffer[]>();
const correlationCache = new Map<string, SemanticCorrelation[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record an observation that can be correlated with others.
 *
 * Call this whenever you detect a meaningful pattern:
 * - Emotion detected in conversation
 * - Topic mentioned
 * - Person referenced
 * - Energy level observed
 * - Time of day pattern
 */
export async function recordObservation(
  userId: string,
  observation: {
    domain: CorrelationDomain;
    pattern: string;
    context?: string;
  }
): Promise<void> {
  const { domain, pattern, context } = observation;
  const timestamp = Date.now();

  // Generate embedding for semantic comparison
  let embedding: number[] | undefined;
  try {
    embedding = await embed(pattern);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to embed observation');
  }

  // Add to buffer
  const buffer = observationBuffers.get(userId) || [];
  buffer.push({ domain, pattern, embedding, timestamp, context });

  // Keep buffer reasonable size (last 50 observations)
  if (buffer.length > 50) {
    buffer.shift();
  }
  observationBuffers.set(userId, buffer);

  // Check for correlations with recent observations
  await detectCorrelations(userId, { domain, pattern, embedding, timestamp, context });

  log.debug({ userId, domain, pattern }, '🔗 Observation recorded');
}

/**
 * Detect correlations between the new observation and recent ones.
 */
async function detectCorrelations(
  userId: string,
  newObs: ObservationBuffer
): Promise<void> {
  const buffer = observationBuffers.get(userId) || [];
  const correlations = correlationCache.get(userId) || await loadCorrelations(userId);

  // Find observations within time window
  const recentObs = buffer.filter(
    (obs) =>
      obs !== newObs &&
      Math.abs(obs.timestamp - newObs.timestamp) < CONFIG.TIME_WINDOW_MS &&
      obs.domain !== newObs.domain // Cross-domain correlations only
  );

  for (const otherObs of recentObs) {
    // Calculate semantic similarity if embeddings available
    let similarity = 0.5; // Default moderate similarity
    if (newObs.embedding && otherObs.embedding) {
      similarity = cosineSimilarity(newObs.embedding, otherObs.embedding);
    }

    // Skip if not semantically related
    if (similarity < 0.2) continue;

    // Find or create correlation
    const existingCorr = findExistingCorrelation(
      correlations,
      newObs.domain,
      newObs.pattern,
      otherObs.domain,
      otherObs.pattern
    );

    if (existingCorr) {
      // Update existing correlation
      updateCorrelation(existingCorr, newObs, otherObs, similarity);
    } else if (correlations.length < CONFIG.MAX_CORRELATIONS_PER_USER) {
      // Create new correlation candidate
      const newCorr = createCorrelation(userId, newObs, otherObs, similarity);
      correlations.push(newCorr);
    }
  }

  // Save updated correlations
  correlationCache.set(userId, correlations);

  // Persist to Firestore (debounced/batched in production)
  await saveCorrelations(userId, correlations);
}

/**
 * Find existing correlation between two patterns.
 */
function findExistingCorrelation(
  correlations: SemanticCorrelation[],
  domainA: CorrelationDomain,
  patternA: string,
  domainB: CorrelationDomain,
  patternB: string
): SemanticCorrelation | undefined {
  return correlations.find(
    (c) =>
      (c.domainA.type === domainA &&
        c.domainA.pattern.toLowerCase() === patternA.toLowerCase() &&
        c.domainB.type === domainB &&
        c.domainB.pattern.toLowerCase() === patternB.toLowerCase()) ||
      (c.domainA.type === domainB &&
        c.domainA.pattern.toLowerCase() === patternB.toLowerCase() &&
        c.domainB.type === domainA &&
        c.domainB.pattern.toLowerCase() === patternA.toLowerCase())
  );
}

/**
 * Update an existing correlation with new evidence.
 */
function updateCorrelation(
  correlation: SemanticCorrelation,
  obsA: ObservationBuffer,
  obsB: ObservationBuffer,
  similarity: number
): void {
  // Add co-occurrence
  const coOccurrence: CoOccurrence = {
    timestamp: Math.max(obsA.timestamp, obsB.timestamp),
    contextSnippet: [obsA.context, obsB.context].filter(Boolean).join(' | ').slice(0, 200),
    strengthAtTime: similarity,
  };

  correlation.coOccurrences.push(coOccurrence);

  // Keep only last 20 co-occurrences
  if (correlation.coOccurrences.length > 20) {
    correlation.coOccurrences = correlation.coOccurrences.slice(-20);
  }

  correlation.observationCount++;
  correlation.lastObserved = Date.now();

  // Recalculate strength (moving average)
  const recentStrengths = correlation.coOccurrences.slice(-10).map((c) => c.strengthAtTime);
  correlation.strength =
    recentStrengths.reduce((a, b) => a + b, 0) / recentStrengths.length;

  // Update confidence based on observation count
  correlation.confidence = Math.min(0.95, correlation.observationCount / 15);

  // Generate insight if we have enough confidence
  if (correlation.confidence >= 0.5 && !correlation.insight) {
    correlation.insight = generateInsight(correlation);
    correlation.insightType = inferInsightType(correlation);
  }
}

/**
 * Create a new correlation from two observations.
 */
function createCorrelation(
  userId: string,
  obsA: ObservationBuffer,
  obsB: ObservationBuffer,
  similarity: number
): SemanticCorrelation {
  const now = Date.now();

  return {
    id: `corr_${now}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    domainA: {
      type: obsA.domain,
      pattern: obsA.pattern,
      embedding: obsA.embedding,
    },
    domainB: {
      type: obsB.domain,
      pattern: obsB.pattern,
      embedding: obsB.embedding,
    },
    strength: similarity,
    confidence: 0.1, // Low confidence until more observations
    observationCount: 1,
    coOccurrences: [
      {
        timestamp: now,
        contextSnippet: [obsA.context, obsB.context].filter(Boolean).join(' | ').slice(0, 200),
        strengthAtTime: similarity,
      },
    ],
    insight: '', // Generated after enough observations
    insightType: 'contextual',
    firstObserved: now,
    lastObserved: now,
  };
}

/**
 * Generate a natural language insight from a correlation.
 */
function generateInsight(correlation: SemanticCorrelation): string {
  const { domainA, domainB, strength } = correlation;

  // Template-based insight generation
  const templates: Record<string, (a: string, b: string) => string> = {
    'emotion_topic': (a, b) =>
      strength > 0.7
        ? `When ${b} comes up, you often feel ${a}`
        : `There's a connection between ${b} and feeling ${a}`,
    'emotion_person': (a, b) =>
      strength > 0.7
        ? `Conversations about ${b} tend to bring up ${a}`
        : `${b} seems connected to ${a} for you`,
    'emotion_time': (a, b) =>
      `${b} is often when ${a} shows up`,
    'energy_time': (a, b) =>
      `Your energy tends to be ${a} during ${b}`,
    'energy_topic': (a, b) =>
      `${b} seems to affect your energy (${a})`,
    'behavior_emotion': (a, b) =>
      `When you're feeling ${b}, you tend to ${a}`,
    'sleep_emotion': (a, b) =>
      `${a} sleep patterns connect with ${b}`,
    'work_energy': (a, b) =>
      `${a} at work seems tied to ${b} energy`,
  };

  const key = `${domainA.type}_${domainB.type}`;
  const reverseKey = `${domainB.type}_${domainA.type}`;

  if (templates[key]) {
    return templates[key](domainA.pattern, domainB.pattern);
  } else if (templates[reverseKey]) {
    return templates[reverseKey](domainB.pattern, domainA.pattern);
  }

  // Generic template
  return `There's a pattern: ${domainA.pattern} and ${domainB.pattern} often appear together`;
}

/**
 * Infer the type of insight from correlation properties.
 */
function inferInsightType(correlation: SemanticCorrelation): InsightType {
  const { domainA, domainB, coOccurrences } = correlation;

  // Check temporal ordering to infer causality
  if (coOccurrences.length >= 5) {
    // If domain A consistently precedes domain B
    const aFirstCount = coOccurrences.filter((c) => {
      // This is simplified - in production would track individual timestamps
      return true;
    }).length;

    if (aFirstCount > coOccurrences.length * 0.8) {
      return 'predictive';
    }
  }

  // Domain-based inference
  if (
    (domainA.type === 'sleep' && domainB.type === 'energy') ||
    (domainA.type === 'behavior' && domainB.type === 'emotion')
  ) {
    return 'causal';
  }

  if (
    (domainA.type === 'health' || domainB.type === 'health') &&
    correlation.strength < 0
  ) {
    return 'protective';
  }

  return 'contextual';
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get active correlations relevant to current context.
 */
export async function getRelevantCorrelations(
  userId: string,
  context: {
    currentTopics?: string[];
    currentEmotion?: string;
    currentPerson?: string;
    timeOfDay?: string;
  }
): Promise<SemanticCorrelation[]> {
  const correlations = correlationCache.get(userId) || await loadCorrelations(userId);

  // Filter by confidence
  const confident = correlations.filter(
    (c) => c.confidence >= 0.5 && c.strength >= CONFIG.MIN_STRENGTH
  );

  // Score relevance to current context
  const scored = confident.map((corr) => {
    let relevance = 0;

    // Check if correlation matches current context
    if (context.currentTopics) {
      for (const topic of context.currentTopics) {
        if (
          corr.domainA.pattern.toLowerCase().includes(topic.toLowerCase()) ||
          corr.domainB.pattern.toLowerCase().includes(topic.toLowerCase())
        ) {
          relevance += 0.5;
        }
      }
    }

    if (context.currentEmotion) {
      if (
        (corr.domainA.type === 'emotion' &&
          corr.domainA.pattern.toLowerCase() === context.currentEmotion.toLowerCase()) ||
        (corr.domainB.type === 'emotion' &&
          corr.domainB.pattern.toLowerCase() === context.currentEmotion.toLowerCase())
      ) {
        relevance += 0.7;
      }
    }

    if (context.currentPerson) {
      if (
        (corr.domainA.type === 'person' &&
          corr.domainA.pattern.toLowerCase().includes(context.currentPerson.toLowerCase())) ||
        (corr.domainB.type === 'person' &&
          corr.domainB.pattern.toLowerCase().includes(context.currentPerson.toLowerCase()))
      ) {
        relevance += 0.6;
      }
    }

    // Recency boost
    const daysSinceObserved = (Date.now() - corr.lastObserved) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.exp(-daysSinceObserved / CONFIG.DECAY_HALF_LIFE_DAYS);
    relevance *= (0.5 + 0.5 * recencyBoost);

    return { correlation: corr, relevance };
  });

  // Sort by relevance and return top 5
  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5)
    .map((s) => s.correlation);
}

/**
 * Build context string for LLM injection.
 */
export async function buildCorrelationContext(
  userId: string,
  context?: {
    currentTopics?: string[];
    currentEmotion?: string;
    currentPerson?: string;
  }
): Promise<string> {
  const relevant = await getRelevantCorrelations(userId, context || {});

  if (relevant.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[SEMANTIC CORRELATION MINING - Connecting Dots]',
    "You see patterns across domains that they can't. Surface these gently.",
    '',
  ];

  for (const corr of relevant) {
    if (corr.insight) {
      sections.push(`• ${corr.insight} (${Math.round(corr.confidence * 100)}% confident)`);
    }
  }

  sections.push('');
  sections.push('Use these insights naturally. "I notice..." not "My data shows..."');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadCorrelations(userId: string): Promise<SemanticCorrelation[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('semantic_correlations')
      .orderBy('confidence', 'desc')
      .limit(CONFIG.MAX_CORRELATIONS_PER_USER)
      .get();

    const correlations = snapshot.docs.map((doc) => doc.data() as SemanticCorrelation);
    correlationCache.set(userId, correlations);
    return correlations;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load correlations');
    return [];
  }
}

async function saveCorrelations(
  userId: string,
  correlations: SemanticCorrelation[]
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const batch = db.batch();
    const collRef = db.collection('bogle_users').doc(userId).collection('semantic_correlations');

    // Only save high-confidence correlations
    const toSave = correlations.filter(
      (c) => c.observationCount >= CONFIG.MIN_COOCCURRENCES || c.confidence >= 0.3
    );

    for (const corr of toSave.slice(0, 50)) {
      // Limit batch size
      batch.set(collRef.doc(corr.id), corr);
    }

    await batch.commit();
    log.debug({ userId, count: toSave.length }, '💾 Correlations saved');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save correlations');
  }
}

/**
 * Clear correlation cache for a user.
 */
export function clearCorrelationCache(userId?: string): void {
  if (userId) {
    correlationCache.delete(userId);
    observationBuffers.delete(userId);
  } else {
    correlationCache.clear();
    observationBuffers.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const correlationMining = {
  recordObservation,
  getRelevantCorrelations,
  buildContext: buildCorrelationContext,
  clearCache: clearCorrelationCache,
};

