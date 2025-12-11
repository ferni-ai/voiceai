/**
 * Conversation Utilities
 *
 * Shared utilities for the conversation module.
 *
 * @module @ferni/conversation/utils
 */

// Detection utilities
export {
  // Energy detection
  detectUserEnergy,
  detectUserEnergyDetailed,

  // Topic weight
  classifyTopicWeight,

  // Content detection
  detectEmotionalContent,
  detectHeavyContent,
  detectEvidence,
  detectBreakthrough,
  detectAdviceGiving,

  // Engagement detection
  detectDisengagement,
  detectHighEngagement,
  detectHesitation,
  detectEngagementLevel,

  // Composite analysis
  analyzeMessage,

  // Types
  type EnergyLevel,
  type TopicWeight,
  type EngagementLevel,
  type DetectionResult,
  type MessageAnalysis,

  // Pattern constants
  HIGH_ENERGY_PATTERNS,
  LOW_ENERGY_PATTERNS,
  EMOTIONAL_CONTENT_PATTERNS,
  HEAVY_CONTENT_PATTERNS,
  LIGHT_CONTENT_PATTERNS,
  EVIDENCE_PATTERNS,
  BREAKTHROUGH_PATTERNS,
  ADVICE_PATTERNS,
  DISENGAGEMENT_PATTERNS,
  HIGH_ENGAGEMENT_PATTERNS,
  DEEP_SHARING_PATTERNS,
  HESITATION_PATTERNS,
} from './detection.js';

