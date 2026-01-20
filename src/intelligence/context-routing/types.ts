/**
 * Smart Context Routing - Type Definitions
 *
 * Types for ML-informed context selection with dynamic slot allocation.
 * Part of Phase 2: BTH Communication System Overhaul.
 *
 * @module context-routing/types
 */

import type { ContextInjection } from '../../agents/processors/types.js';

// Re-export for convenience
export type { ContextInjection };

// ============================================================================
// CONVERSATION MODES
// ============================================================================

/**
 * Conversation mode determines slot allocation strategy.
 * Imported from injection-filter.ts for consistency.
 */
export type ConversationMode =
  | 'crisis' // User in distress - safety focus
  | 'emotional' // Sharing feelings - presence focus
  | 'practical' // Asking questions - helpful focus
  | 'casual' // Light chat - keep it simple
  | 'deep' // Exploring meaning - thoughtful focus
  | 'unknown'; // Default mode

// ============================================================================
// SLOT ALLOCATION
// ============================================================================

/**
 * How context slots are distributed across categories.
 * Each mode gets a different allocation to prioritize relevant content.
 */
export interface SlotAllocation {
  /** Emotional context (voice, humanizing, emotional) */
  emotional: number;
  /** Practical context (context, coaching, engagement) */
  practical: number;
  /** Memory context (memory, persona) */
  memory: number;
  /** Superhuman context (cognitive, external, learning) */
  superhuman: number;
  /** Safety context (always gets what it needs) */
  safety: number;
}

/**
 * Maps categories to their slot type.
 */
export type CategoryToSlot = Record<string, keyof SlotAllocation>;

// ============================================================================
// PREDICTIVE SCORING
// ============================================================================

/**
 * Source of the predictive score.
 * - 'ml': Full ML model with sufficient training data
 * - 'heuristic': Rule-based scoring with some historical data
 * - 'fallback': Default scores when no data available
 */
export type ScoreSource = 'ml' | 'heuristic' | 'fallback';

/**
 * Individual factors that contribute to the final score.
 */
export interface ScoreFactors {
  /** ROI score from Phase 1 feedback (0-100) */
  roiScore: number;
  /** How relevant this category is to current mode (0-100) */
  modeRelevance: number;
  /** Boost for recently successful builders (0-100) */
  recencyBoost: number;
  /** User-specific preference score (0-100) */
  userAffinity: number;
}

/**
 * Predictive score for a context builder.
 * Used to rank which injections should be selected.
 */
export interface PredictiveScore {
  /** Builder identifier */
  builderId: string;
  /** Composite score (0-100) */
  score: number;
  /** Confidence in this prediction (0-1) */
  confidence: number;
  /** Individual factors that contributed to score */
  factors: ScoreFactors;
  /** Source of this prediction */
  source: ScoreSource;
}

// ============================================================================
// SELECTION DECISION
// ============================================================================

/**
 * Reason why an injection was rejected.
 */
export interface RejectionInfo {
  /** The rejected injection */
  injection: ContextInjection;
  /** Why it was rejected */
  reason: string;
  /** Its score (for debugging) */
  score: PredictiveScore;
}

/**
 * Algorithm used for selection.
 * - 'smart': Full ML-informed selection
 * - 'priority': Traditional priority-based (fallback)
 * - 'hybrid': ML selection with priority validation
 */
export type SelectionAlgorithm = 'smart' | 'priority' | 'hybrid';

/**
 * Result of the smart selection process.
 * Includes selected injections plus debugging info.
 */
export interface SelectionDecision {
  /** Injections selected for delivery */
  selected: ContextInjection[];
  /** Injections that didn't make the cut (for debugging) */
  rejected: RejectionInfo[];
  /** How slots were used */
  slotUsage: SlotAllocation;
  /** Overall confidence in this selection */
  confidence: number;
  /** Which algorithm was used */
  algorithm: SelectionAlgorithm;
  /** Detected conversation mode */
  mode: ConversationMode;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// BUILDER EFFECTIVENESS (FIRESTORE)
// ============================================================================

/**
 * Effectiveness metrics for a context builder.
 * Stored in Firestore: `builder_effectiveness/{builderId}`
 */
export interface BuilderEffectiveness {
  /** Builder identifier */
  builderId: string;
  /** Builder category */
  category: string;
  /** Total times this builder's content was delivered */
  totalDeliveries: number;
  /** Times the LLM response aligned with the injection */
  alignmentCount: number;
  /** Times user reacted positively after injection */
  positiveReactions: number;
  /** Times user reacted negatively after injection */
  negativeReactions: number;
  /** Computed ROI score (0-100) */
  roiScore: number;
  /** Effectiveness per conversation mode */
  modeScores: Partial<Record<ConversationMode, number>>;
  /** When this record was last updated */
  lastUpdated: Date;
  /** Number of samples used to compute scores */
  sampleCount: number;
}

/**
 * User-specific builder preferences.
 * Stored in Firestore: `user_builder_preferences/{userId}`
 */
export interface UserBuilderPreferences {
  /** User identifier */
  userId: string;
  /** Builders that work well for this user */
  effectiveBuilders: string[];
  /** Builders that don't work for this user */
  ineffectiveBuilders: string[];
  /** Preferred builders per mode */
  modePreferences: Partial<Record<ConversationMode, string[]>>;
  /** When this was last updated */
  updatedAt: Date;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache tier for different TTLs.
 */
export type CacheTier = 'session' | 'user' | 'global';

/**
 * Cached builder scores for a user.
 */
export interface CachedUserScores {
  /** User identifier */
  userId: string;
  /** Scores by builder ID */
  scores: Map<string, PredictiveScore>;
  /** When this cache entry was created */
  cachedAt: Date;
  /** Cache tier */
  tier: CacheTier;
}

/**
 * Global builder effectiveness cache.
 */
export interface GlobalEffectivenessCache {
  /** Effectiveness by builder ID */
  effectiveness: Map<string, BuilderEffectiveness>;
  /** When this was last refreshed */
  refreshedAt: Date;
}

// ============================================================================
// SELECTION OPTIONS
// ============================================================================

/**
 * Options for the smart selector.
 */
export interface SmartSelectorOptions {
  /** User identifier */
  userId: string;
  /** Session identifier */
  sessionId: string;
  /** User's message text */
  userText: string;
  /** Detected emotional intensity (0-1) */
  emotionalIntensity?: number;
  /** Whether crisis was detected */
  crisisDetected?: boolean;
  /** Force a specific conversation mode */
  forceMode?: ConversationMode;
  /** Maximum injections to return */
  maxInjections?: number;
  /** Maximum total characters */
  maxChars?: number;
  /** Whether to use smart selection (vs fallback to priority) */
  useSmartSelection?: boolean;
  /** Minimum confidence threshold for ML predictions */
  minConfidence?: number;
}

// ============================================================================
// FEEDBACK AGGREGATION
// ============================================================================

/**
 * Aggregated feedback for a builder over a time window.
 */
export interface AggregatedFeedback {
  /** Builder identifier */
  builderId: string;
  /** Time window start */
  windowStart: Date;
  /** Time window end */
  windowEnd: Date;
  /** Number of deliveries in this window */
  deliveries: number;
  /** Number of alignments in this window */
  alignments: number;
  /** Number of positive reactions */
  positiveReactions: number;
  /** Number of negative reactions */
  negativeReactions: number;
  /** Computed ROI for this window */
  windowRoi: number;
}

// ============================================================================
// EXPERIMENT INTEGRATION
// ============================================================================

/**
 * Experiment variant for smart routing.
 */
export type RoutingVariant = 'priority' | 'hybrid' | 'smart';

/**
 * Configuration for routing experiment.
 */
export interface RoutingExperimentConfig {
  /** Experiment identifier */
  experimentId: string;
  /** Current variant for this user */
  variant: RoutingVariant;
  /** Whether the experiment is active */
  isActive: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum samples needed for ML predictions.
 */
export const MIN_SAMPLES_FOR_ML = 100;

/**
 * Minimum samples needed for heuristic predictions.
 */
export const MIN_SAMPLES_FOR_HEURISTIC = 20;

/**
 * Default slot count.
 */
export const DEFAULT_SLOT_COUNT = 6;

/**
 * Fast mode slot count.
 */
export const FAST_MODE_SLOT_COUNT = 3;

/**
 * Score weights for composite scoring.
 */
export const SCORE_WEIGHTS = {
  roiScore: 0.4,
  modeRelevance: 0.3,
  recencyBoost: 0.15,
  userAffinity: 0.15,
} as const;

/**
 * Cache TTLs in milliseconds.
 */
export const CACHE_TTL = {
  session: Infinity, // Lives for session duration
  user: 5 * 60 * 1000, // 5 minutes
  global: 1 * 60 * 1000, // 1 minute
} as const;
