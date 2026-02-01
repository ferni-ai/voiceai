/**
 * Link Detector
 *
 * Automatically detects and creates links between memories based on
 * various signals: shared people, topics, emotions, temporal proximity,
 * and semantic similarity.
 *
 * @module memory/associative-cortex/graph/link-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { StoredMemory, MemoryLinkType } from '../../unified-store/types.js';
import type { MemoryLink } from '../types.js';

const log = createLogger({ module: 'LinkDetector' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for link detection
 */
export interface LinkDetectionConfig {
  /** Minimum confidence to create a link */
  minConfidence: number;

  /** Temporal proximity window in days */
  temporalWindowDays: number;

  /** Semantic similarity threshold for embedding comparison */
  semanticThreshold: number;

  /** Topic overlap threshold (0-1) */
  topicOverlapThreshold: number;

  /** Emotional similarity threshold */
  emotionalThreshold: number;

  /** Maximum links to create per detection run */
  maxLinksPerRun: number;

  /** Link types to detect */
  enabledLinkTypes: MemoryLinkType[];
}

/**
 * Default link detection config
 */
export const DEFAULT_LINK_DETECTION_CONFIG: LinkDetectionConfig = {
  minConfidence: 0.4,
  temporalWindowDays: 7,
  semanticThreshold: 0.75,
  topicOverlapThreshold: 0.5,
  emotionalThreshold: 0.7,
  maxLinksPerRun: 10,
  enabledLinkTypes: ['person', 'topic', 'temporal', 'emotional', 'semantic', 'causal', 'narrative', 'reinforced'],
};

// ============================================================================
// DETECTION RESULT TYPES
// ============================================================================

/**
 * Result of link detection
 */
export interface LinkDetectionResult {
  /** Detected link */
  link: Omit<MemoryLink, 'createdAt'>;

  /** Why this link was detected */
  reason: string;

  /** Confidence in this detection (0-1) */
  confidence: number;

  /** Signals that contributed to detection */
  signals: LinkSignal[];
}

/**
 * A signal that contributed to link detection
 */
export interface LinkSignal {
  /** Signal type */
  type: 'person_match' | 'topic_match' | 'temporal' | 'emotional' | 'semantic' | 'causal' | 'user_action';

  /** Signal strength (0-1) */
  strength: number;

  /** Details about the signal */
  details: string;
}

// ============================================================================
// LINK DETECTOR
// ============================================================================

/**
 * Link Detector
 *
 * Automatically detects links between memories based on various signals.
 */
export class LinkDetector {
  private config: LinkDetectionConfig;

  constructor(config: Partial<LinkDetectionConfig> = {}) {
    this.config = { ...DEFAULT_LINK_DETECTION_CONFIG, ...config };
  }

  /**
   * Detect links between a new memory and existing memories
   */
  async detectLinks(
    newMemory: StoredMemory,
    existingMemories: StoredMemory[]
  ): Promise<LinkDetectionResult[]> {
    const results: LinkDetectionResult[] = [];

    for (const existing of existingMemories) {
      // Skip self-links
      if (existing.id === newMemory.id) continue;

      // Check each link type
      const detectedLinks = await this.detectLinksBetween(newMemory, existing);
      results.push(...detectedLinks);
    }

    // Sort by confidence and limit
    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, this.config.maxLinksPerRun);
  }

  /**
   * Detect links between two specific memories
   */
  async detectLinksBetween(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): Promise<LinkDetectionResult[]> {
    const results: LinkDetectionResult[] = [];

    // 1. Check person links
    if (this.config.enabledLinkTypes.includes('person')) {
      const personResult = this.detectPersonLink(memory1, memory2);
      if (personResult) results.push(personResult);
    }

    // 2. Check topic links
    if (this.config.enabledLinkTypes.includes('topic')) {
      const topicResult = this.detectTopicLink(memory1, memory2);
      if (topicResult) results.push(topicResult);
    }

    // 3. Check temporal links
    if (this.config.enabledLinkTypes.includes('temporal')) {
      const temporalResult = this.detectTemporalLink(memory1, memory2);
      if (temporalResult) results.push(temporalResult);
    }

    // 4. Check emotional links
    if (this.config.enabledLinkTypes.includes('emotional')) {
      const emotionalResult = this.detectEmotionalLink(memory1, memory2);
      if (emotionalResult) results.push(emotionalResult);
    }

    // 5. Check semantic links
    if (this.config.enabledLinkTypes.includes('semantic')) {
      const semanticResult = this.detectSemanticLink(memory1, memory2);
      if (semanticResult) results.push(semanticResult);
    }

    // 6. Check causal links
    if (this.config.enabledLinkTypes.includes('causal')) {
      const causalResult = this.detectCausalLink(memory1, memory2);
      if (causalResult) results.push(causalResult);
    }

    return results.filter((r) => r.confidence >= this.config.minConfidence);
  }

  /**
   * Detect person-based links (shared people mentioned)
   */
  private detectPersonLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    const people1 = new Set(memory1.peopleMentioned.map((p) => p.toLowerCase()));
    const people2 = new Set(memory2.peopleMentioned.map((p) => p.toLowerCase()));

    if (people1.size === 0 || people2.size === 0) return null;

    // Find shared people
    const shared = [...people1].filter((p) => people2.has(p));
    if (shared.length === 0) return null;

    // Calculate confidence based on overlap
    const unionSize = new Set([...people1, ...people2]).size;
    const overlapRatio = shared.length / unionSize;
    const confidence = 0.6 + overlapRatio * 0.35;

    return {
      link: {
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'person',
        weight: confidence,
        metadata: {
          reason: `Shared person(s): ${shared.join(', ')}`,
          confidence,
        },
      },
      reason: `Both memories mention: ${shared.join(', ')}`,
      confidence,
      signals: [{
        type: 'person_match',
        strength: overlapRatio,
        details: `${shared.length} shared people out of ${unionSize} total`,
      }],
    };
  }

  /**
   * Detect topic-based links
   */
  private detectTopicLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    const topics1 = new Set(memory1.topics.map((t) => t.toLowerCase()));
    const topics2 = new Set(memory2.topics.map((t) => t.toLowerCase()));

    if (topics1.size === 0 || topics2.size === 0) return null;

    // Find shared topics
    const shared = [...topics1].filter((t) => topics2.has(t));
    if (shared.length === 0) return null;

    // Calculate overlap ratio
    const unionSize = new Set([...topics1, ...topics2]).size;
    const overlapRatio = shared.length / unionSize;

    if (overlapRatio < this.config.topicOverlapThreshold) return null;

    const confidence = 0.5 + overlapRatio * 0.4;

    return {
      link: {
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'topic',
        weight: confidence,
        metadata: {
          reason: `Shared topic(s): ${shared.join(', ')}`,
          confidence,
        },
      },
      reason: `Related topics: ${shared.join(', ')}`,
      confidence,
      signals: [{
        type: 'topic_match',
        strength: overlapRatio,
        details: `${shared.length} shared topics out of ${unionSize} total`,
      }],
    };
  }

  /**
   * Detect temporal proximity links
   */
  private detectTemporalLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    const time1 = memory1.createdAt.getTime();
    const time2 = memory2.createdAt.getTime();

    const diffMs = Math.abs(time1 - time2);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays > this.config.temporalWindowDays) return null;

    // Closer = stronger link
    const proximityScore = 1 - (diffDays / this.config.temporalWindowDays);
    const confidence = 0.3 + proximityScore * 0.4;

    if (confidence < this.config.minConfidence) return null;

    return {
      link: {
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'temporal',
        weight: confidence,
        metadata: {
          reason: `Occurred within ${diffDays.toFixed(1)} days`,
          confidence,
        },
      },
      reason: `Temporal proximity: ${diffDays.toFixed(1)} days apart`,
      confidence,
      signals: [{
        type: 'temporal',
        strength: proximityScore,
        details: `${diffDays.toFixed(1)} days apart`,
      }],
    };
  }

  /**
   * Detect emotional resonance links
   */
  private detectEmotionalLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    const weight1 = memory1.emotionalWeight;
    const weight2 = memory2.emotionalWeight;

    // Skip if either has low emotional content
    if (weight1 < 0.3 || weight2 < 0.3) return null;

    // Calculate emotional similarity
    const weightDiff = Math.abs(weight1 - weight2);
    const similarity = 1 - weightDiff;

    if (similarity < this.config.emotionalThreshold) return null;

    // Both high emotional = strong connection
    const averageWeight = (weight1 + weight2) / 2;
    const confidence = 0.6 + similarity * 0.2 + averageWeight * 0.2;

    return {
      link: {
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'emotional',
        weight: Math.min(1, confidence),
        metadata: {
          reason: 'Similar emotional intensity',
          confidence,
        },
      },
      reason: `Emotional resonance: both have significant emotional weight`,
      confidence: Math.min(1, confidence),
      signals: [{
        type: 'emotional',
        strength: similarity,
        details: `Emotional weights: ${weight1.toFixed(2)} and ${weight2.toFixed(2)}`,
      }],
    };
  }

  /**
   * Detect semantic similarity links (embedding-based)
   */
  private detectSemanticLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    // Can only compare if both have embeddings
    if (!memory1.embedding || !memory2.embedding) return null;

    // Calculate cosine similarity
    const similarity = this.cosineSimilarity(memory1.embedding, memory2.embedding);

    if (similarity < this.config.semanticThreshold) return null;

    const confidence = 0.5 + (similarity - this.config.semanticThreshold) * 2;

    return {
      link: {
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'semantic',
        weight: Math.min(1, confidence),
        metadata: {
          reason: `Semantic similarity: ${similarity.toFixed(3)}`,
          confidence,
        },
      },
      reason: `Semantically similar content (${(similarity * 100).toFixed(0)}% similarity)`,
      confidence: Math.min(1, confidence),
      signals: [{
        type: 'semantic',
        strength: similarity,
        details: `Embedding similarity: ${similarity.toFixed(3)}`,
      }],
    };
  }

  /**
   * Detect causal links (one event likely led to another)
   */
  private detectCausalLink(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): LinkDetectionResult | null {
    // Order by time
    const [earlier, later] = memory1.createdAt < memory2.createdAt
      ? [memory1, memory2]
      : [memory2, memory1];

    // Check temporal order (must be within window and in sequence)
    const diffMs = later.createdAt.getTime() - earlier.createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0 || diffDays > this.config.temporalWindowDays) return null;

    // Look for causal indicators
    const signals: LinkSignal[] = [];
    let causalScore = 0;

    // Shared topics suggest continuation
    const sharedTopics = earlier.topics.filter((t) =>
      later.topics.some((lt) => lt.toLowerCase() === t.toLowerCase())
    );
    if (sharedTopics.length > 0) {
      causalScore += 0.3;
      signals.push({
        type: 'topic_match',
        strength: sharedTopics.length / Math.max(earlier.topics.length, later.topics.length),
        details: `Shared topics: ${sharedTopics.join(', ')}`,
      });
    }

    // Active commitment in earlier, follow-up in later
    if (earlier.isActiveCommitment) {
      causalScore += 0.4;
      signals.push({
        type: 'causal',
        strength: 0.8,
        details: 'Earlier memory is an active commitment',
      });
    }

    // If not enough causal signal, skip
    if (causalScore < 0.3) return null;

    const confidence = Math.min(1, 0.4 + causalScore);

    return {
      link: {
        sourceId: earlier.id,
        targetId: later.id,
        type: 'causal',
        weight: confidence,
        metadata: {
          reason: 'Potential cause-effect relationship',
          confidence,
        },
      },
      reason: 'Potential causal relationship based on timing and topic continuity',
      confidence,
      signals,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Create a user-reinforced link (explicit user confirmation)
   */
  createReinforcedLink(
    sourceId: string,
    targetId: string,
    userAction: string
  ): LinkDetectionResult {
    return {
      link: {
        sourceId,
        targetId,
        type: 'reinforced',
        weight: 0.9,
        metadata: {
          reason: `User confirmed: ${userAction}`,
          confidence: 0.95,
          reinforcements: 1,
        },
      },
      reason: `User explicitly confirmed connection: ${userAction}`,
      confidence: 0.95,
      signals: [{
        type: 'user_action',
        strength: 1.0,
        details: userAction,
      }],
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let detectorInstance: LinkDetector | null = null;

export function getLinkDetector(config?: Partial<LinkDetectionConfig>): LinkDetector {
  if (!detectorInstance) {
    detectorInstance = new LinkDetector(config);
  }
  return detectorInstance;
}

export function resetLinkDetector(): void {
  detectorInstance = null;
}
