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
  BREAKTHROUGH_PATTERNS,
  DEEP_SHARING_PATTERNS,
  DISENGAGEMENT_PATTERNS,
  EMOTIONAL_CONTENT_PATTERNS,
  EVIDENCE_PATTERNS,
  HEAVY_CONTENT_PATTERNS,
  HESITATION_PATTERNS,
  // Pattern constants
  HIGH_ENERGY_PATTERNS,
  HIGH_ENGAGEMENT_PATTERNS,
  LIGHT_CONTENT_PATTERNS,
  LOW_ENERGY_PATTERNS,
  // Composite analysis
  analyzeMessage,
  // Topic weight
  classifyTopicWeight,
  detectAdviceGiving,
  detectBreakthrough,
  // Engagement detection
  detectDisengagement,
  // Content detection
  detectEmotionalContent,
  detectEngagementLevel,
  detectEvidence,
  detectHeavyContent,
  detectHesitation,
  detectHighEngagement,
  // Energy detection
  detectUserEnergy,
  detectUserEnergyDetailed,
  type DetectionResult,
  // Types
  type EnergyLevel,
  type EngagementLevel,
  type MessageAnalysis,
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
} from './rng.js';
