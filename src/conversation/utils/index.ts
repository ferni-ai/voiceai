/**
 * Conversation Utilities
 *
 * Shared utilities for the conversation module.
 *
 * @module @ferni/conversation/utils
 */

// Detection utilities
export {
  ADVICE_PATTERNS,
  DEEP_SHARING_PATTERNS,
  DISENGAGEMENT_PATTERNS,
  EMOTIONAL_CONTENT_PATTERNS,
  EVIDENCE_PATTERNS,
  HEAVY_CONTENT_KEYWORDS,
  HEAVY_CONTENT_PATTERNS,
  // Pattern constants
  HIGH_ENERGY_PATTERNS,
  HIGH_ENGAGEMENT_PATTERNS,
  LIGHT_CONTENT_PATTERNS,
  LOW_ENERGY_PATTERNS,
  // Topic weight
  classifyTopicWeight,
  detectAdviceGiving,
  // Engagement detection
  detectDisengagement,
  // Content detection
  detectEmotionalContent,
  detectEngagementLevel,
  detectHeavyContentKeywords,
  detectHighEngagement,
  // Energy detection
  detectUserEnergyDetailed,
  type DetectionResult,
  // Types
  type EnergyLevel,
  type EngagementLevel,
  type TopicWeight,
} from './detection.js';

// RNG utilities (seeded randomness)
export {
  chance,
  createSeededRandom,
  createSystemRandom,
  seededChance,
  seededFloat,
  seededIndex,
  seededPick,
  type RandomSource,
} from './random-generator.js';
