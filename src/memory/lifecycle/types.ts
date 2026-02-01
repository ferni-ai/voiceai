/**
 * Memory Lifecycle Types
 *
 * Types for the memory lifecycle management system.
 * Handles decay, consolidation, and preference prediction.
 *
 * @module memory/lifecycle/types
 */

import type { StoredMemory } from '../unified-store/types.js';

// ============================================================================
// DECAY TYPES
// ============================================================================

/**
 * Configuration for memory decay
 */
export interface DecayConfig {
  /** Base decay rate per day (default: 0.98, meaning 2% decay per day) */
  decayRate: number;

  /** How much each access boosts resistance to decay (default: 1.1) */
  accessBoostRate: number;

  /** Multiplier for emotional weight protection (default: 1.5) */
  emotionalMultiplier: number;

  /** Minimum strength before memory is considered for cleanup (default: 0.1) */
  minStrength: number;

  /** Days after which inactive memories become candidates for cleanup (default: 365) */
  maxInactiveDays: number;

  /** Protection boost for active commitments (default: 3.0) */
  commitmentProtection: number;

  /** Protection for high-importance memories (default: 2.0) */
  importanceProtection: number;

  /** Protection for frequently accessed memories (default: 1.5) */
  frequencyProtection: number;
}

/**
 * Default decay configuration
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  decayRate: 0.98,
  accessBoostRate: 1.1,
  emotionalMultiplier: 1.5,
  minStrength: 0.1,
  maxInactiveDays: 365,
  commitmentProtection: 3.0,
  importanceProtection: 2.0,
  frequencyProtection: 1.5,
};

/**
 * Result of decay calculation for a single memory
 */
export interface DecayResult {
  /** Memory ID */
  memoryId: string;

  /** Previous strength */
  previousStrength: number;

  /** New strength after decay */
  newStrength: number;

  /** Amount of decay applied */
  decayAmount: number;

  /** Protection factors that were applied */
  protectionFactors: ProtectionFactor[];

  /** Total protection multiplier */
  totalProtection: number;

  /** Should this memory be cleaned up? */
  shouldCleanup: boolean;

  /** Reason for cleanup if applicable */
  cleanupReason?: string;
}

/**
 * A protection factor that prevents decay
 */
export interface ProtectionFactor {
  /** Type of protection */
  type: 'emotional' | 'commitment' | 'importance' | 'frequency' | 'explicit' | 'recency';

  /** How much protection this provides (multiplier) */
  multiplier: number;

  /** Description */
  description: string;
}

/**
 * Result of running decay on multiple memories
 */
export interface DecayBatchResult {
  /** Memories processed */
  processed: number;

  /** Memories that decayed */
  decayed: number;

  /** Memories marked for cleanup */
  markedForCleanup: number;

  /** Individual results */
  results: DecayResult[];

  /** Processing time (ms) */
  durationMs: number;
}

// ============================================================================
// CONSOLIDATION TYPES
// ============================================================================

/**
 * Configuration for memory consolidation
 */
export interface ConsolidationConfig {
  /** Minimum similarity score to consider consolidation (default: 0.85) */
  similarityThreshold: number;

  /** Maximum memories to consolidate into one (default: 5) */
  maxConsolidationSize: number;

  /** Minimum age of memories before consolidation (days) (default: 7) */
  minAgeDays: number;

  /** Whether to preserve originals after consolidation (default: true) */
  preserveOriginals: boolean;

  /** Maximum batch size for processing (default: 100) */
  batchSize: number;
}

/**
 * Default consolidation config
 */
export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  similarityThreshold: 0.85,
  maxConsolidationSize: 5,
  minAgeDays: 7,
  preserveOriginals: true,
  batchSize: 100,
};

/**
 * A group of memories that can be consolidated
 */
export interface ConsolidationGroup {
  /** Representative memory (highest importance) */
  representative: StoredMemory;

  /** All memories in this group */
  members: StoredMemory[];

  /** Average similarity within group */
  averageSimilarity: number;

  /** Combined topics */
  combinedTopics: string[];

  /** Combined people mentioned */
  combinedPeople: string[];

  /** Highest emotional weight in group */
  maxEmotionalWeight: number;
}

/**
 * Result of consolidation
 */
export interface ConsolidationResult {
  /** New consolidated memory (if created) */
  consolidated?: StoredMemory;

  /** Original memory IDs that were consolidated */
  originalIds: string[];

  /** What happened to originals */
  originalsFate: 'preserved' | 'deleted' | 'archived';

  /** Similarity score of consolidation */
  similarityScore: number;
}

/**
 * Result of batch consolidation
 */
export interface ConsolidationBatchResult {
  /** Groups found */
  groupsFound: number;

  /** Groups consolidated */
  groupsConsolidated: number;

  /** Total memories processed */
  memoriesProcessed: number;

  /** Total memories consolidated */
  memoriesConsolidated: number;

  /** Individual results */
  results: ConsolidationResult[];

  /** Processing time (ms) */
  durationMs: number;
}

// ============================================================================
// PREFERENCE PREDICTION TYPES
// ============================================================================

/**
 * Configuration for preference prediction
 */
export interface PreferencePredictorConfig {
  /** Minimum data points to make predictions (default: 5) */
  minDataPoints: number;

  /** Decay rate for old preference data (default: 0.95) */
  preferenceDecayRate: number;

  /** How much to weight recent interactions (default: 1.5) */
  recencyWeight: number;
}

/**
 * Default preference predictor config
 */
export const DEFAULT_PREFERENCE_PREDICTOR_CONFIG: PreferencePredictorConfig = {
  minDataPoints: 5,
  preferenceDecayRate: 0.95,
  recencyWeight: 1.5,
};

/**
 * Predicted preference for a topic or person
 */
export interface PredictedPreference {
  /** What this preference is about */
  subject: string;

  /** Subject type */
  subjectType: 'topic' | 'person' | 'memory_type' | 'time_of_day';

  /** Predicted receptivity (0-1) */
  predictedReceptivity: number;

  /** Confidence in this prediction (0-1) */
  confidence: number;

  /** Data points used for prediction */
  dataPoints: number;

  /** Trend (increasing, decreasing, stable) */
  trend: 'increasing' | 'decreasing' | 'stable';
}

// ============================================================================
// SCHEDULED MAINTENANCE TYPES
// ============================================================================

/**
 * Maintenance job configuration
 */
export interface MaintenanceJobConfig {
  /** Job name */
  name: string;

  /** Job type */
  type: 'decay' | 'consolidation' | 'cleanup' | 'preference_update';

  /** Cron schedule */
  schedule: string;

  /** Whether job is enabled */
  enabled: boolean;

  /** Batch size for processing */
  batchSize: number;

  /** Timeout in ms */
  timeoutMs: number;

  /** Additional configuration */
  config?: Record<string, unknown>;
}

/**
 * Result of a maintenance job
 */
export interface MaintenanceJobResult {
  /** Job name */
  jobName: string;

  /** When started */
  startedAt: Date;

  /** When completed */
  completedAt: Date;

  /** Duration (ms) */
  durationMs: number;

  /** Success or failure */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Items processed */
  itemsProcessed: number;

  /** Items modified */
  itemsModified: number;

  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// LIFECYCLE MANAGER TYPES
// ============================================================================

/**
 * Main lifecycle manager interface
 */
export interface LifecycleManager {
  /** Apply decay to memories */
  applyDecay(userId: string, memories: StoredMemory[]): Promise<DecayBatchResult>;

  /** Consolidate similar memories */
  consolidate(userId: string, memories: StoredMemory[]): Promise<ConsolidationBatchResult>;

  /** Clean up decayed memories */
  cleanup(userId: string, memories: StoredMemory[]): Promise<number>;

  /** Reinforce a memory (prevent decay) */
  reinforce(memoryId: string): Promise<void>;

  /** Protect a memory from decay */
  protect(memoryId: string): Promise<void>;

  /** Unprotect a memory */
  unprotect(memoryId: string): Promise<void>;

  /** Get memory health statistics */
  getHealthStats(userId: string): Promise<MemoryHealthStats>;
}

/**
 * Health statistics for a user's memory
 */
export interface MemoryHealthStats {
  /** Total memories */
  totalMemories: number;

  /** Healthy memories (strength > 0.5) */
  healthyMemories: number;

  /** Decaying memories (0.1 < strength < 0.5) */
  decayingMemories: number;

  /** Memories at risk (strength < 0.1) */
  atRiskMemories: number;

  /** Protected memories */
  protectedMemories: number;

  /** Active commitments */
  activeCommitments: number;

  /** Average strength */
  averageStrength: number;

  /** Consolidation candidates */
  consolidationCandidates: number;

  /** Last decay run */
  lastDecayRun?: Date;

  /** Last consolidation run */
  lastConsolidationRun?: Date;
}
