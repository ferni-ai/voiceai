/**
 * Memory Confidence Scoring
 *
 * Phase 16: Memory Confidence & Attribution
 *
 * Calculates confidence scores for retrieved memories to enable:
 * - Appropriate hedging in responses ("I think you said...")
 * - Correction handling when user disputes a memory
 * - Priority ordering for memory surfacing
 *
 * @module memory/retrieval/confidence-scoring
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConfidenceScoring' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Confidence level categories
 */
export type ConfidenceLevel =
  | 'high' // 0.8-1.0: "You told me..."
  | 'medium' // 0.6-0.8: "I remember..."
  | 'low' // 0.4-0.6: "I think you mentioned..."
  | 'uncertain'; // 0.0-0.4: "If I recall correctly..."

/**
 * Memory confidence score
 */
export interface MemoryConfidence {
  /** Overall confidence (0-1) */
  score: number;
  /** Confidence level category */
  level: ConfidenceLevel;
  /** Confidence breakdown */
  breakdown: ConfidenceBreakdown;
  /** Factors affecting confidence */
  factors: ConfidenceFactor[];
  /** Whether this memory is suitable for surfacing */
  suitableForSurfacing: boolean;
  /** Suggested hedging phrase */
  hedgingPhrase: string;
}

/**
 * Confidence breakdown by source
 */
export interface ConfidenceBreakdown {
  /** Source confidence (explicit vs inferred) */
  sourceConfidence: number;
  /** Age confidence (recent vs old) */
  ageConfidence: number;
  /** Repetition confidence (mentioned multiple times) */
  repetitionConfidence: number;
  /** Extraction confidence (LLM extraction quality) */
  extractionConfidence: number;
  /** Emotional weight confidence */
  emotionalConfidence: number;
}

/**
 * Individual confidence factor
 */
export interface ConfidenceFactor {
  /** Factor name */
  name: string;
  /** Factor value (0-1) */
  value: number;
  /** Direction: positive or negative impact */
  impact: 'positive' | 'negative' | 'neutral';
  /** Description */
  description: string;
}

/**
 * Input for confidence calculation
 */
export interface ConfidenceInput {
  /** How the memory was captured */
  source: 'explicit' | 'inferred' | 'extracted';
  /** When the memory was captured */
  capturedAt: Date;
  /** Number of times mentioned */
  mentionCount: number;
  /** Original extraction confidence (if LLM extracted) */
  extractionConfidence?: number;
  /** Emotional weight of memory */
  emotionalWeight?: number;
  /** Whether user confirmed this memory */
  userConfirmed?: boolean;
  /** Whether user disputed this memory */
  userDisputed?: boolean;
  /** Semantic search score (if retrieved via search) */
  searchScore?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ConfidenceConfig {
  /** Threshold for high confidence */
  highThreshold: number;
  /** Threshold for medium confidence */
  mediumThreshold: number;
  /** Threshold for low confidence */
  lowThreshold: number;
  /** Age decay half-life in days */
  ageDecayHalfLife: number;
  /** Minimum score for surfacing */
  minSurfacingScore: number;
  /** Weights for breakdown factors */
  weights: {
    source: number;
    age: number;
    repetition: number;
    extraction: number;
    emotional: number;
  };
}

const DEFAULT_CONFIG: ConfidenceConfig = {
  highThreshold: 0.8,
  mediumThreshold: 0.6,
  lowThreshold: 0.4,
  ageDecayHalfLife: 90, // 90 days
  minSurfacingScore: 0.5,
  weights: {
    source: 0.25,
    age: 0.2,
    repetition: 0.2,
    extraction: 0.2,
    emotional: 0.15,
  },
};

let config: ConfidenceConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setConfidenceConfig(newConfig: Partial<ConfidenceConfig>): void {
  config = {
    ...config,
    ...newConfig,
    weights: { ...config.weights, ...(newConfig.weights || {}) },
  };
}

/**
 * Get current configuration
 */
export function getConfidenceConfig(): ConfidenceConfig {
  return { ...config };
}

// ============================================================================
// HEDGING PHRASES
// ============================================================================

const HEDGING_PHRASES: Record<ConfidenceLevel, string[]> = {
  high: ['You told me', 'You mentioned', 'You said', 'You shared that'],
  medium: [
    'I remember you saying',
    'I recall',
    'From what I remember',
    'You mentioned something about',
  ],
  low: [
    'I think you mentioned',
    'If I remember correctly',
    'I believe you said',
    'I seem to recall',
  ],
  uncertain: [
    'I may be misremembering, but',
    "I'm not entirely sure, but",
    "Correct me if I'm wrong, but",
    'If I recall correctly',
  ],
};

// ============================================================================
// MAIN CALCULATION
// ============================================================================

/**
 * Calculate confidence score for a memory.
 *
 * This is the main function for determining how confident we are
 * in a memory and how to present it to the user.
 */
export function calculateConfidence(input: ConfidenceInput): MemoryConfidence {
  const factors: ConfidenceFactor[] = [];
  const breakdown: ConfidenceBreakdown = {
    sourceConfidence: 0,
    ageConfidence: 0,
    repetitionConfidence: 0,
    extractionConfidence: 0,
    emotionalConfidence: 0,
  };

  // 1. Source confidence
  breakdown.sourceConfidence = calculateSourceConfidence(input, factors);

  // 2. Age confidence (exponential decay)
  breakdown.ageConfidence = calculateAgeConfidence(input.capturedAt, factors);

  // 3. Repetition confidence
  breakdown.repetitionConfidence = calculateRepetitionConfidence(input.mentionCount, factors);

  // 4. Extraction confidence
  breakdown.extractionConfidence = calculateExtractionConfidence(input, factors);

  // 5. Emotional confidence
  breakdown.emotionalConfidence = calculateEmotionalConfidence(input.emotionalWeight, factors);

  // Calculate weighted score
  let score =
    breakdown.sourceConfidence * config.weights.source +
    breakdown.ageConfidence * config.weights.age +
    breakdown.repetitionConfidence * config.weights.repetition +
    breakdown.extractionConfidence * config.weights.extraction +
    breakdown.emotionalConfidence * config.weights.emotional;

  // Apply user confirmation/dispute modifiers
  if (input.userConfirmed) {
    score = Math.min(1.0, score + 0.2);
    factors.push({
      name: 'user_confirmed',
      value: 0.2,
      impact: 'positive',
      description: 'User confirmed this memory',
    });
  }

  if (input.userDisputed) {
    score = Math.max(0.1, score - 0.4);
    factors.push({
      name: 'user_disputed',
      value: -0.4,
      impact: 'negative',
      description: 'User disputed this memory',
    });
  }

  // Apply search score boost if available
  if (input.searchScore !== undefined && input.searchScore > 0.8) {
    score = Math.min(1.0, score + 0.05);
    factors.push({
      name: 'high_search_relevance',
      value: 0.05,
      impact: 'positive',
      description: 'High relevance in semantic search',
    });
  }

  // Determine confidence level
  const level = scoreToLevel(score);

  // Get hedging phrase
  const hedgingPhrase = getHedgingPhrase(level);

  // Determine if suitable for surfacing
  const suitableForSurfacing = score >= config.minSurfacingScore && !input.userDisputed;

  log.debug(
    {
      score,
      level,
      factorCount: factors.length,
      suitableForSurfacing,
    },
    '📊 Confidence calculated'
  );

  return {
    score,
    level,
    breakdown,
    factors,
    suitableForSurfacing,
    hedgingPhrase,
  };
}

// ============================================================================
// FACTOR CALCULATIONS
// ============================================================================

/**
 * Calculate source confidence
 */
function calculateSourceConfidence(input: ConfidenceInput, factors: ConfidenceFactor[]): number {
  let confidence: number;
  let description: string;

  switch (input.source) {
    case 'explicit':
      confidence = 0.9;
      description = 'User explicitly stated this';
      break;
    case 'inferred':
      confidence = 0.7;
      description = 'Inferred from conversation context';
      break;
    case 'extracted':
      confidence = 0.6;
      description = 'Extracted by LLM from conversation';
      break;
    default:
      confidence = 0.5;
      description = 'Unknown source';
  }

  factors.push({
    name: 'source_type',
    value: confidence,
    impact: confidence >= 0.7 ? 'positive' : 'neutral',
    description,
  });

  return confidence;
}

/**
 * Calculate age confidence with exponential decay
 */
function calculateAgeConfidence(capturedAt: Date, factors: ConfidenceFactor[]): number {
  const daysSince = (Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay
  const halfLife = config.ageDecayHalfLife;
  const confidence = Math.exp((-0.693 * daysSince) / halfLife);

  let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
  let description: string;

  if (daysSince < 7) {
    impact = 'positive';
    description = 'Very recent memory';
  } else if (daysSince < 30) {
    description = 'Recent memory';
  } else if (daysSince < 90) {
    description = 'Moderately old memory';
  } else {
    impact = 'negative';
    description = 'Old memory - may have changed';
  }

  factors.push({
    name: 'age',
    value: confidence,
    impact,
    description: `${description} (${Math.round(daysSince)} days ago)`,
  });

  return confidence;
}

/**
 * Calculate repetition confidence
 */
function calculateRepetitionConfidence(mentionCount: number, factors: ConfidenceFactor[]): number {
  // More mentions = more confident
  // Diminishing returns after 3 mentions
  const confidence = Math.min(1.0, 0.5 + 0.15 * Math.min(mentionCount, 4));

  const impact: 'positive' | 'neutral' = mentionCount >= 2 ? 'positive' : 'neutral';
  const description = mentionCount === 1 ? 'Mentioned once' : `Mentioned ${mentionCount} times`;

  factors.push({
    name: 'repetition',
    value: confidence,
    impact,
    description,
  });

  return confidence;
}

/**
 * Calculate extraction confidence
 */
function calculateExtractionConfidence(
  input: ConfidenceInput,
  factors: ConfidenceFactor[]
): number {
  // Use provided extraction confidence if available
  if (input.extractionConfidence !== undefined) {
    factors.push({
      name: 'extraction_quality',
      value: input.extractionConfidence,
      impact: input.extractionConfidence >= 0.7 ? 'positive' : 'neutral',
      description: `LLM extraction confidence: ${Math.round(input.extractionConfidence * 100)}%`,
    });
    return input.extractionConfidence;
  }

  // Default based on source
  const defaultConfidence = input.source === 'explicit' ? 0.9 : 0.7;
  factors.push({
    name: 'extraction_quality',
    value: defaultConfidence,
    impact: 'neutral',
    description: 'Default extraction confidence',
  });

  return defaultConfidence;
}

/**
 * Calculate emotional confidence
 */
function calculateEmotionalConfidence(
  emotionalWeight: number | undefined,
  factors: ConfidenceFactor[]
): number {
  // High emotional weight = more memorable = more confident
  const weight = emotionalWeight ?? 0.5;
  const confidence = 0.5 + weight * 0.5;

  const impact: 'positive' | 'neutral' = weight > 0.7 ? 'positive' : 'neutral';
  const description =
    weight > 0.7
      ? 'High emotional significance'
      : weight < 0.3
        ? 'Low emotional significance'
        : 'Moderate emotional significance';

  factors.push({
    name: 'emotional_weight',
    value: confidence,
    impact,
    description,
  });

  return confidence;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert score to confidence level
 */
function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= config.highThreshold) return 'high';
  if (score >= config.mediumThreshold) return 'medium';
  if (score >= config.lowThreshold) return 'low';
  return 'uncertain';
}

/**
 * Get appropriate hedging phrase for confidence level
 */
function getHedgingPhrase(level: ConfidenceLevel): string {
  const phrases = HEDGING_PHRASES[level];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Convert confidence level to score threshold
 */
export function levelToMinScore(level: ConfidenceLevel): number {
  switch (level) {
    case 'high':
      return config.highThreshold;
    case 'medium':
      return config.mediumThreshold;
    case 'low':
      return config.lowThreshold;
    case 'uncertain':
      return 0;
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Calculate confidence for multiple memories
 */
export function calculateBatchConfidence(inputs: ConfidenceInput[]): MemoryConfidence[] {
  return inputs.map((input) => calculateConfidence(input));
}

/**
 * Filter memories by minimum confidence level
 */
export function filterByConfidence(
  memories: Array<{ input: ConfidenceInput; id: string }>,
  minLevel: ConfidenceLevel
): Array<{ input: ConfidenceInput; id: string; confidence: MemoryConfidence }> {
  const minScore = levelToMinScore(minLevel);

  return memories
    .map((m) => ({
      ...m,
      confidence: calculateConfidence(m.input),
    }))
    .filter((m) => m.confidence.score >= minScore);
}
