/**
 * Memory Link Types and Detection Rules
 *
 * Defines the types of connections between memories and rules for
 * automatically detecting them.
 *
 * @module memory/unified-store/graph/link-types
 */

import type { StoredMemory, MemoryLink, MemoryLinkType } from '../types.js';

// ============================================================================
// LINK TYPE DEFINITIONS
// ============================================================================

/**
 * Configuration for each link type
 */
export interface LinkTypeConfig {
  /** Link type identifier */
  type: MemoryLinkType;

  /** Human-readable description */
  description: string;

  /** Default weight for this link type */
  defaultWeight: number;

  /** Is this link bidirectional by default? */
  defaultBidirectional: boolean;

  /** Minimum confidence to auto-create */
  minAutoCreateConfidence: number;

  /** How much weight decays per day */
  decayRate: number;

  /** Maximum weight this link type can have */
  maxWeight: number;
}

/**
 * Link type configurations
 */
export const LINK_TYPE_CONFIGS: Record<MemoryLinkType, LinkTypeConfig> = {
  causal: {
    type: 'causal',
    description: 'One memory caused or led to another',
    defaultWeight: 0.8,
    defaultBidirectional: false,
    minAutoCreateConfidence: 0.7,
    decayRate: 0.01, // Slow decay - causality is stable
    maxWeight: 1.0,
  },
  temporal: {
    type: 'temporal',
    description: 'Memories occurred in close temporal proximity',
    defaultWeight: 0.5,
    defaultBidirectional: false,
    minAutoCreateConfidence: 0.5,
    decayRate: 0.05, // Moderate decay
    maxWeight: 0.9,
  },
  emotional: {
    type: 'emotional',
    description: 'Memories share similar emotional context',
    defaultWeight: 0.6,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.6,
    decayRate: 0.02, // Slow decay - emotional connections persist
    maxWeight: 1.0,
  },
  person: {
    type: 'person',
    description: 'Memories involve the same person',
    defaultWeight: 0.7,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.6,
    decayRate: 0.02, // Slow decay
    maxWeight: 1.0,
  },
  topic: {
    type: 'topic',
    description: 'Memories share the same topic domain',
    defaultWeight: 0.5,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.5,
    decayRate: 0.03,
    maxWeight: 0.9,
  },
  narrative: {
    type: 'narrative',
    description: 'Memories are part of the same life narrative/chapter',
    defaultWeight: 0.7,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.7,
    decayRate: 0.01, // Very slow decay - narratives are stable
    maxWeight: 1.0,
  },
  semantic: {
    type: 'semantic',
    description: 'Memories have high embedding similarity',
    defaultWeight: 0.6,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.75,
    decayRate: 0.02,
    maxWeight: 0.95,
  },
  reinforced: {
    type: 'reinforced',
    description: 'Memories are frequently accessed together',
    defaultWeight: 0.4,
    defaultBidirectional: true,
    minAutoCreateConfidence: 0.5,
    decayRate: 0.05, // Faster decay - needs continued reinforcement
    maxWeight: 1.0,
  },
};

// ============================================================================
// LINK DETECTION RULES
// ============================================================================

/**
 * Rule for auto-detecting links between memories
 */
export interface LinkDetectionRule {
  /** Link type this rule detects */
  type: MemoryLinkType;

  /** Human-readable name for the rule */
  name: string;

  /** Detection function - returns confidence (0-1) or null if no link */
  detect: (source: StoredMemory, target: StoredMemory) => number | null;

  /** Calculate link weight based on detection */
  calculateWeight: (source: StoredMemory, target: StoredMemory, confidence: number) => number;
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date1.getTime() - date2.getTime());
  return diff / (1000 * 60 * 60 * 24);
}

/**
 * Calculate set intersection
 */
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const set2 = new Set(arr2);
  return arr1.filter((item) => set2.has(item));
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Link detection rules
 */
export const LINK_DETECTION_RULES: LinkDetectionRule[] = [
  // Person link: Same people mentioned
  {
    type: 'person',
    name: 'shared_person',
    detect: (source, target) => {
      const shared = intersection(source.peopleMentioned, target.peopleMentioned);
      if (shared.length === 0) return null;
      // Higher confidence with more shared people
      return Math.min(0.6 + shared.length * 0.1, 0.95);
    },
    calculateWeight: (source, target, confidence) => {
      const shared = intersection(source.peopleMentioned, target.peopleMentioned);
      // Weight increases with emotional significance
      const avgEmotional = (source.emotionalWeight + target.emotionalWeight) / 2;
      return Math.min(0.7 + shared.length * 0.1 + avgEmotional * 0.2, 1.0) * confidence;
    },
  },

  // Temporal link: Recent proximity
  {
    type: 'temporal',
    name: 'temporal_proximity',
    detect: (source, target) => {
      const days = daysBetween(source.createdAt, target.createdAt);
      // Only link if within 7 days
      if (days > 7) return null;
      // Higher confidence for closer events
      return Math.max(0.3, 1 - days * 0.1);
    },
    calculateWeight: (source, target, confidence) => {
      const days = daysBetween(source.createdAt, target.createdAt);
      return Math.max(0.3, 1 - days * 0.15) * confidence;
    },
  },

  // Emotional link: Similar emotional context
  {
    type: 'emotional',
    name: 'emotional_resonance',
    detect: (source, target) => {
      // Both must have significant emotional weight
      if (source.emotionalWeight < 0.5 || target.emotionalWeight < 0.5) return null;
      // Similar emotional intensity
      const intensityDiff = Math.abs(source.emotionalWeight - target.emotionalWeight);
      if (intensityDiff > 0.3) return null;
      return 0.6 + (1 - intensityDiff) * 0.4;
    },
    calculateWeight: (source, target, confidence) => {
      const avgEmotional = (source.emotionalWeight + target.emotionalWeight) / 2;
      return avgEmotional * confidence;
    },
  },

  // Topic link: Shared topics
  {
    type: 'topic',
    name: 'shared_topic',
    detect: (source, target) => {
      const shared = intersection(source.topics, target.topics);
      if (shared.length === 0) return null;
      // Higher confidence with more shared topics
      return Math.min(0.5 + shared.length * 0.15, 0.9);
    },
    calculateWeight: (source, target, confidence) => {
      const shared = intersection(source.topics, target.topics);
      return Math.min(0.5 + shared.length * 0.15, 0.9) * confidence;
    },
  },

  // Semantic link: Embedding similarity
  {
    type: 'semantic',
    name: 'semantic_similarity',
    detect: (source, target) => {
      if (!source.embedding?.length || !target.embedding?.length) return null;
      const similarity = cosineSimilarity(source.embedding, target.embedding);
      // Only link if similarity > 0.75
      if (similarity < 0.75) return null;
      return similarity;
    },
    calculateWeight: (_source, _target, confidence) => {
      return confidence; // Weight equals confidence for semantic links
    },
  },

  // Commitment link: Active commitments about same topic/person
  {
    type: 'narrative',
    name: 'commitment_narrative',
    detect: (source, target) => {
      // At least one must be a commitment
      if (!source.isActiveCommitment && !target.isActiveCommitment) return null;
      // Must share topic or person
      const sharedTopics = intersection(source.topics, target.topics);
      const sharedPeople = intersection(source.peopleMentioned, target.peopleMentioned);
      if (sharedTopics.length === 0 && sharedPeople.length === 0) return null;
      return 0.7 + (sharedTopics.length + sharedPeople.length) * 0.05;
    },
    calculateWeight: (source, target, confidence) => {
      // Commitments have strong narrative weight
      const commitmentBoost = (source.isActiveCommitment ? 0.1 : 0) + (target.isActiveCommitment ? 0.1 : 0);
      return Math.min(0.7 + commitmentBoost, 1.0) * confidence;
    },
  },
];

// ============================================================================
// LINK UTILITIES
// ============================================================================

/**
 * Detect all possible links between two memories
 */
export function detectLinks(
  source: StoredMemory,
  target: StoredMemory
): Array<{ type: MemoryLinkType; confidence: number; weight: number }> {
  const links: Array<{ type: MemoryLinkType; confidence: number; weight: number }> = [];

  for (const rule of LINK_DETECTION_RULES) {
    const confidence = rule.detect(source, target);
    if (confidence !== null) {
      const config = LINK_TYPE_CONFIGS[rule.type];
      if (confidence >= config.minAutoCreateConfidence) {
        const weight = rule.calculateWeight(source, target, confidence);
        links.push({ type: rule.type, confidence, weight });
      }
    }
  }

  return links;
}

/**
 * Apply decay to a link weight
 */
export function applyLinkDecay(link: MemoryLink): number {
  const config = LINK_TYPE_CONFIGS[link.type];
  const daysSinceReinforcement = daysBetween(link.lastReinforced, new Date());
  const decayFactor = Math.pow(1 - config.decayRate, daysSinceReinforcement);
  return Math.max(0.1, link.weight * decayFactor);
}

/**
 * Calculate reinforcement boost for a link
 */
export function calculateReinforcementBoost(link: MemoryLink): number {
  const config = LINK_TYPE_CONFIGS[link.type];
  // Diminishing returns on reinforcement
  const boost = 0.1 / Math.sqrt(link.reinforcementCount + 1);
  return Math.min(link.weight + boost, config.maxWeight);
}
