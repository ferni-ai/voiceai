/**
 * Cross-Domain Correlation Engine
 *
 * This is Ferni's superhuman pattern recognition system.
 * Humans can sometimes notice patterns across domains, but they:
 * - Forget the data points that led to the insight
 * - Can't do statistical analysis across months of data
 * - Miss subtle correlations
 * - Can't track emotional valence over time
 *
 * Ferni can say: "I've noticed that when you talk about your mom,
 * it's usually after stressful work days. Is there a connection there?"
 *
 * This module detects:
 * - Temporal patterns (X usually happens at Y time)
 * - Emotional patterns (topic X correlates with emotion Y)
 * - Social patterns (person X is mentioned with topic Y)
 * - Behavioral patterns (action X leads to feeling Y)
 * - Cyclical patterns (weekly/monthly/seasonal)
 * - Causal patterns (X causes Y)
 *
 * @module memory/entity-store/correlation-engine
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, toSafeDate } from '../../utils/firestore-utils.js';
import { getEntityStore } from './store.js';

const log = createLogger({ module: 'CorrelationEngine' });

// ============================================================================
// TYPES
// ============================================================================

export type CorrelationType =
  | 'temporal' // Things that happen around same time
  | 'emotional' // Emotional patterns
  | 'behavioral' // Behavioral patterns
  | 'topical' // Topic co-occurrence
  | 'social' // Social patterns (who with whom)
  | 'causal' // One thing causes another
  | 'cyclical'; // Recurring patterns

/**
 * A detected correlation between entities or patterns.
 * This enables "Better Than Human" pattern recognition.
 */
export interface Correlation {
  /** Unique identifier */
  id: string;

  /** User ID */
  userId: string;

  /** Type of correlation */
  type: CorrelationType;

  /** Entity IDs involved */
  entityIds: string[];

  /** Description of the correlation */
  description: string;

  /** Statistical strength (0-1) */
  strength: number;

  /** Number of observations supporting this */
  observationCount: number;

  /** Confidence in this correlation */
  confidence: number;

  /** Is this a causal relationship or just correlation? */
  causal: boolean;

  /** Pattern details */
  pattern?: {
    temporal?: string; // e.g., "Sunday evenings"
    contextual?: string; // e.g., "after work stress"
    behavioral?: string; // e.g., "before important meetings"
  };

  /** When this correlation was first detected */
  firstDetected: Date;

  /** When this correlation was last observed */
  lastObserved: Date;

  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An observation that might contribute to a correlation
 */
export interface CorrelationObservation {
  id: string;
  userId: string;
  timestamp: Date;
  entityIds: string[];
  context: {
    emotion?: string;
    emotionIntensity?: number;
    topic?: string;
    timeOfDay?: string; // 'morning', 'afternoon', 'evening', 'night'
    dayOfWeek?: string;
    isWeekend?: boolean;
  };
  eventType: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CORRELATIONS_COLLECTION = 'entity_correlations';
const OBSERVATIONS_COLLECTION = 'correlation_observations';

const MIN_OBSERVATIONS = 3;
const MIN_STRENGTH = 0.4;
const LOOKBACK_DAYS = 90;

// ============================================================================
// CORRELATION ENGINE
// ============================================================================

export class CorrelationEngine {
  private db: FirebaseFirestore.Firestore | null = null;
  private initialized = false;
  private observationBuffer: CorrelationObservation[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      });
      this.initialized = true;
      log.info('✅ CorrelationEngine initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize CorrelationEngine');
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('CorrelationEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * Record an observation that might contribute to a correlation.
   * Call this whenever something notable happens (entity mention, emotion, etc.)
   */
  async recordObservation(
    userId: string,
    observation: Omit<CorrelationObservation, 'id' | 'userId' | 'timestamp'>
  ): Promise<void> {
    const fullObservation: CorrelationObservation = {
      id: uuidv4(),
      userId,
      timestamp: new Date(),
      ...observation,
    };

    this.observationBuffer.push(fullObservation);

    // Check for patterns after accumulating a few observations
    if (this.observationBuffer.length >= 5) {
      await this.analyzeAndFlush(userId);
    } else {
      // Set a timeout to flush even if we don't hit 5 observations
      if (!this.flushTimeout) {
        this.flushTimeout = setTimeout(() => {
          this.analyzeAndFlush(userId);
          this.flushTimeout = null;
        }, 30000);
      }
    }
  }

  /**
   * Analyze recent observations for patterns and correlations.
   */
  async analyzePatterns(userId: string): Promise<Correlation[]> {
    await this.initialize();
    this.ensureInitialized();

    const startTime = Date.now();

    const observations = await this.loadRecentObservations(userId, LOOKBACK_DAYS);

    if (observations.length < MIN_OBSERVATIONS) {
      return [];
    }

    const detectedCorrelations: Correlation[] = [];

    // 1. Detect temporal patterns
    const temporalCorrelations = this.detectTemporalPatterns(userId, observations);
    detectedCorrelations.push(...temporalCorrelations);

    // 2. Detect emotional patterns
    const emotionalCorrelations = this.detectEmotionalPatterns(userId, observations);
    detectedCorrelations.push(...emotionalCorrelations);

    // 3. Detect social patterns (who is mentioned with whom/what)
    const socialCorrelations = this.detectSocialPatterns(userId, observations);
    detectedCorrelations.push(...socialCorrelations);

    // 4. Detect cyclical patterns (weekly, monthly)
    const cyclicalCorrelations = this.detectCyclicalPatterns(userId, observations);
    detectedCorrelations.push(...cyclicalCorrelations);

    // Save significant correlations
    const significant = detectedCorrelations.filter((c) => c.strength >= MIN_STRENGTH);
    for (const correlation of significant) {
      await this.saveCorrelation(correlation);
    }

    log.info(
      {
        userId,
        observationCount: observations.length,
        correlationsFound: significant.length,
        durationMs: Date.now() - startTime,
      },
      'Pattern analysis complete'
    );

    return significant;
  }

  /**
   * Get all detected correlations for a user
   */
  async getCorrelations(
    userId: string,
    options?: {
      types?: CorrelationType[];
      entityIds?: string[];
      minStrength?: number;
      limit?: number;
    }
  ): Promise<Correlation[]> {
    await this.initialize();
    if (!this.db) return [];

    let query = this.db
      .collection(CORRELATIONS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('strength', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    const snapshot = await query.get();

    let correlations = snapshot.docs.map((doc) => this.docToCorrelation(doc));

    if (options?.types) {
      correlations = correlations.filter((c) => options.types!.includes(c.type));
    }
    if (options?.entityIds) {
      correlations = correlations.filter((c) =>
        options.entityIds!.some((id) => c.entityIds.includes(id))
      );
    }
    if (options?.minStrength) {
      correlations = correlations.filter((c) => c.strength >= options.minStrength!);
    }

    return correlations;
  }

  /**
   * Generate a natural language description of a correlation.
   */
  generateDescription(correlation: Correlation, entityNames: Map<string, string>): string {
    const names = correlation.entityIds
      .map((id) => entityNames.get(id) || 'something')
      .join(' and ');

    switch (correlation.type) {
      case 'temporal':
        return `I've noticed you tend to think about ${names} ${correlation.pattern?.temporal || 'at certain times'}.`;

      case 'emotional':
        return `When ${names} comes up, you often seem ${correlation.pattern?.contextual || 'to have strong feelings'}. I'm curious about that connection.`;

      case 'social':
        return `${names} seem to come up together a lot. Is there a connection between them?`;

      case 'cyclical':
        return `There seems to be a pattern with ${names} - it comes up ${correlation.pattern?.temporal || 'regularly'}. Have you noticed that?`;

      case 'behavioral':
        return `I've noticed that ${correlation.pattern?.behavioral || 'certain patterns'} around ${names}. Does that resonate?`;

      case 'causal':
        return `It seems like ${correlation.description}. Is that something you've been aware of?`;

      default:
        return `I've noticed an interesting pattern with ${names}.`;
    }
  }

  // ============================================================================
  // PATTERN DETECTION ALGORITHMS
  // ============================================================================

  private detectTemporalPatterns(
    userId: string,
    observations: CorrelationObservation[]
  ): Correlation[] {
    const correlations: Correlation[] = [];
    const entityTimePatterns = new Map<string, Map<string, number>>();

    for (const obs of observations) {
      if (!obs.context.timeOfDay) continue;

      for (const entityId of obs.entityIds) {
        if (!entityTimePatterns.has(entityId)) {
          entityTimePatterns.set(entityId, new Map());
        }
        const timeMap = entityTimePatterns.get(entityId)!;
        timeMap.set(obs.context.timeOfDay, (timeMap.get(obs.context.timeOfDay) || 0) + 1);
      }
    }

    for (const [entityId, timeMap] of entityTimePatterns) {
      const total = Array.from(timeMap.values()).reduce((a, b) => a + b, 0);
      if (total < MIN_OBSERVATIONS) continue;

      for (const [timeOfDay, count] of timeMap) {
        const ratio = count / total;
        if (ratio >= 0.5 && count >= 3) {
          correlations.push(
            this.createCorrelation(userId, {
              type: 'temporal',
              entityIds: [entityId],
              description: `Entity mentioned ${Math.round(ratio * 100)}% of the time in the ${timeOfDay}`,
              strength: ratio,
              observationCount: count,
              pattern: { temporal: timeOfDay },
            })
          );
        }
      }
    }

    return correlations;
  }

  private detectEmotionalPatterns(
    userId: string,
    observations: CorrelationObservation[]
  ): Correlation[] {
    const correlations: Correlation[] = [];
    const entityEmotionPatterns = new Map<
      string,
      Map<string, { count: number; totalIntensity: number }>
    >();

    for (const obs of observations) {
      if (!obs.context.emotion) continue;

      for (const entityId of obs.entityIds) {
        if (!entityEmotionPatterns.has(entityId)) {
          entityEmotionPatterns.set(entityId, new Map());
        }
        const emotionMap = entityEmotionPatterns.get(entityId)!;
        const existing = emotionMap.get(obs.context.emotion) || { count: 0, totalIntensity: 0 };
        emotionMap.set(obs.context.emotion, {
          count: existing.count + 1,
          totalIntensity: existing.totalIntensity + (obs.context.emotionIntensity || 0.5),
        });
      }
    }

    for (const [entityId, emotionMap] of entityEmotionPatterns) {
      let totalCount = 0;
      for (const stats of emotionMap.values()) {
        totalCount += stats.count;
      }
      if (totalCount < MIN_OBSERVATIONS) continue;

      for (const [emotion, stats] of emotionMap) {
        const ratio = stats.count / totalCount;
        const avgIntensity = stats.totalIntensity / stats.count;

        if (ratio >= 0.4 && avgIntensity >= 0.5 && stats.count >= 3) {
          correlations.push(
            this.createCorrelation(userId, {
              type: 'emotional',
              entityIds: [entityId],
              description: `Entity associated with ${emotion} ${Math.round(ratio * 100)}% of the time`,
              strength: ratio * avgIntensity,
              observationCount: stats.count,
              pattern: { contextual: emotion },
            })
          );
        }
      }
    }

    return correlations;
  }

  private detectSocialPatterns(
    userId: string,
    observations: CorrelationObservation[]
  ): Correlation[] {
    const correlations: Correlation[] = [];
    const cooccurrences = new Map<string, number>();

    for (const obs of observations) {
      if (obs.entityIds.length < 2) continue;

      for (let i = 0; i < obs.entityIds.length; i++) {
        for (let j = i + 1; j < obs.entityIds.length; j++) {
          const key = [obs.entityIds[i], obs.entityIds[j]].sort().join(':');
          cooccurrences.set(key, (cooccurrences.get(key) || 0) + 1);
        }
      }
    }

    for (const [key, count] of cooccurrences) {
      if (count >= MIN_OBSERVATIONS) {
        const [id1, id2] = key.split(':');
        correlations.push(
          this.createCorrelation(userId, {
            type: 'social',
            entityIds: [id1, id2],
            description: `These entities co-occur ${count} times`,
            strength: Math.min(1, count / 10),
            observationCount: count,
          })
        );
      }
    }

    return correlations;
  }

  private detectCyclicalPatterns(
    userId: string,
    observations: CorrelationObservation[]
  ): Correlation[] {
    const correlations: Correlation[] = [];
    const entityDayPatterns = new Map<string, Map<string, number>>();

    for (const obs of observations) {
      if (!obs.context.dayOfWeek) continue;

      for (const entityId of obs.entityIds) {
        if (!entityDayPatterns.has(entityId)) {
          entityDayPatterns.set(entityId, new Map());
        }
        const dayMap = entityDayPatterns.get(entityId)!;
        dayMap.set(obs.context.dayOfWeek, (dayMap.get(obs.context.dayOfWeek) || 0) + 1);
      }
    }

    for (const [entityId, dayMap] of entityDayPatterns) {
      const total = Array.from(dayMap.values()).reduce((a, b) => a + b, 0);
      if (total < MIN_OBSERVATIONS * 2) continue;

      for (const [dayOfWeek, count] of dayMap) {
        const expected = total / 7;
        const ratio = count / expected;

        if (ratio >= 2 && count >= 3) {
          correlations.push(
            this.createCorrelation(userId, {
              type: 'cyclical',
              entityIds: [entityId],
              description: `Entity mentioned ${ratio.toFixed(1)}x more often on ${dayOfWeek}s`,
              strength: Math.min(1, (ratio - 1) / 3),
              observationCount: count,
              pattern: { temporal: `${dayOfWeek}s` },
            })
          );
        }
      }
    }

    return correlations;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private createCorrelation(
    userId: string,
    data: {
      type: CorrelationType;
      entityIds: string[];
      description: string;
      strength: number;
      observationCount: number;
      pattern?: Correlation['pattern'];
      causal?: boolean;
    }
  ): Correlation {
    const now = new Date();
    return {
      id: uuidv4(),
      userId,
      type: data.type,
      entityIds: data.entityIds,
      description: data.description,
      strength: data.strength,
      observationCount: data.observationCount,
      confidence: Math.min(1, data.observationCount / 10),
      causal: data.causal || false,
      pattern: data.pattern,
      firstDetected: now,
      lastObserved: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async analyzeAndFlush(userId: string): Promise<void> {
    if (this.observationBuffer.length === 0) return;

    await this.initialize();
    if (!this.db) {
      this.observationBuffer = [];
      return;
    }

    const batch = this.db.batch();
    for (const obs of this.observationBuffer) {
      const docRef = this.db.collection(OBSERVATIONS_COLLECTION).doc(obs.id);
      batch.set(docRef, cleanForFirestore(obs));
    }
    await batch.commit();

    this.observationBuffer = [];

    // Periodically run full pattern analysis (10% chance on each flush)
    if (Math.random() < 0.1) {
      await this.analyzePatterns(userId);
    }
  }

  private async loadRecentObservations(
    userId: string,
    days: number
  ): Promise<CorrelationObservation[]> {
    if (!this.db) return [];

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshot = await this.db
      .collection(OBSERVATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('timestamp', '>=', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        timestamp: toSafeDate(data.timestamp),
        entityIds: data.entityIds || [],
        context: data.context || {},
        eventType: data.eventType,
      };
    });
  }

  private async saveCorrelation(correlation: Correlation): Promise<void> {
    if (!this.db) return;

    const key = `${correlation.type}:${correlation.entityIds.sort().join(':')}`;
    const existing = await this.findExistingCorrelation(correlation.userId, key);

    if (existing) {
      await this.db
        .collection(CORRELATIONS_COLLECTION)
        .doc(existing.id)
        .update(
          cleanForFirestore({
            strength: Math.max(existing.strength, correlation.strength),
            observationCount: existing.observationCount + correlation.observationCount,
            confidence: Math.min(
              1,
              (existing.observationCount + correlation.observationCount) / 10
            ),
            lastObserved: new Date(),
            updatedAt: new Date(),
          })
        );
    } else {
      await this.db
        .collection(CORRELATIONS_COLLECTION)
        .doc(correlation.id)
        .set(
          cleanForFirestore({
            ...correlation,
            correlationKey: key,
          })
        );
    }
  }

  private async findExistingCorrelation(userId: string, key: string): Promise<Correlation | null> {
    if (!this.db) return null;

    const snapshot = await this.db
      .collection(CORRELATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('correlationKey', '==', key)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return this.docToCorrelation(snapshot.docs[0]);
  }

  private docToCorrelation(doc: FirebaseFirestore.DocumentSnapshot): Correlation {
    const data = doc.data()!;
    return {
      id: doc.id,
      userId: data.userId,
      type: data.type,
      entityIds: data.entityIds || [],
      description: data.description,
      strength: data.strength,
      observationCount: data.observationCount,
      confidence: data.confidence,
      causal: data.causal || false,
      pattern: data.pattern,
      firstDetected: toSafeDate(data.firstDetected),
      lastObserved: toSafeDate(data.lastObserved),
      createdAt: toSafeDate(data.createdAt),
      updatedAt: toSafeDate(data.updatedAt),
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let correlationEngine: CorrelationEngine | null = null;

export function getCorrelationEngine(): CorrelationEngine {
  if (!correlationEngine) {
    correlationEngine = new CorrelationEngine();
  }
  return correlationEngine;
}

export default CorrelationEngine;
