/**
 * Memory Decay System
 *
 * Implements graceful forgetting with configurable decay curves.
 * Emotional memories persist longer, commitments are protected,
 * and re-mentioned topics get refreshed.
 *
 * Philosophy: "Better than human" doesn't mean remembering everything
 * forever. It means remembering what matters - emotional moments,
 * commitments, turning points - while letting trivial details fade.
 *
 * This mirrors how healthy human memory works, but with perfect
 * fidelity for the things that truly matter.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { MemoryItem } from './advanced-retrieval.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for memory decay
 */
export interface MemoryDecayConfig {
  /** Base half-life in days (default: 90) */
  baseHalfLifeDays: number;

  /** Multiplier for emotional memories (default: 3.0) */
  emotionalMultiplier: number;

  /** Whether commitments are protected from decay (default: true) */
  commitmentProtection: boolean;

  /** Boost applied when a memory is re-activated (default: 2.0) */
  reactivationBoost: number;

  /** Minimum strength before archival (default: 0.1) */
  archivalThreshold: number;

  /** Types that never decay */
  protectedTypes: Array<MemoryItem['type']>;

  /** Maximum decay rate per day (prevents instant forgetting) */
  maxDecayRatePerDay: number;
}

/**
 * Memory with decay metadata
 */
export interface DecayingMemory extends MemoryItem {
  /** Current strength (0-1) */
  strength: number;

  /** Last time this memory was accessed/mentioned */
  lastAccessed: Date;

  /** Number of times this memory has been reactivated */
  reactivationCount: number;

  /** Whether this memory is archived (still searchable but deprioritized) */
  archived: boolean;
}

/**
 * Result of decay calculation
 */
export interface DecayResult {
  currentStrength: number;
  effectiveHalfLife: number;
  daysSinceAccess: number;
  isProtected: boolean;
  shouldArchive: boolean;
}

/**
 * Pruning result
 */
export interface PruneResult {
  archived: string[];
  preserved: number;
  strengthDistribution: {
    strong: number; // > 0.7
    moderate: number; // 0.3 - 0.7
    weak: number; // < 0.3
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: MemoryDecayConfig = {
  baseHalfLifeDays: 90,
  emotionalMultiplier: 3.0,
  commitmentProtection: true,
  reactivationBoost: 2.0,
  archivalThreshold: 0.1,
  protectedTypes: ['commitment', 'event'],
  maxDecayRatePerDay: 0.05,
};

// ============================================================================
// MEMORY DECAY MANAGER
// ============================================================================

export class MemoryDecayManager {
  private config: MemoryDecayConfig;

  constructor(config?: Partial<MemoryDecayConfig>) {
    // Backward-compatibility: some older callers used different option names.
    // We accept them here so older tests/callers don't silently break.
    const legacy = (config ?? {}) as Record<string, unknown>;

    const translated: Partial<MemoryDecayConfig> = { ...config };
    if (typeof legacy.emotionalDecayMultiplier === 'number') {
      translated.emotionalMultiplier = legacy.emotionalDecayMultiplier;
    }
    if (typeof legacy.pruneThreshold === 'number') {
      translated.archivalThreshold = legacy.pruneThreshold;
    }

    this.config = { ...DEFAULT_CONFIG, ...translated };
  }

  /**
   * Calculate the current strength of a memory
   */
  calculateStrength(memory: MemoryItem | DecayingMemory): DecayResult {
    const now = Date.now();
    const lastAccessed =
      'lastAccessed' in memory ? memory.lastAccessed.getTime() : memory.timestamp.getTime();

    const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);

    // Check protection
    const isProtected = this.isProtected(memory);
    if (isProtected) {
      return {
        currentStrength: 1.0,
        effectiveHalfLife: Infinity,
        daysSinceAccess,
        isProtected: true,
        shouldArchive: false,
      };
    }

    // Calculate effective half-life based on emotional weight
    const emotionalFactor = 1 + memory.emotionalWeight * (this.config.emotionalMultiplier - 1);
    const reactivationFactor =
      'reactivationCount' in memory ? 1 + memory.reactivationCount * 0.2 : 1;

    const effectiveHalfLife = this.config.baseHalfLifeDays * emotionalFactor * reactivationFactor;

    // Calculate decay using exponential decay formula
    // strength = 0.5 ^ (daysSinceAccess / halfLife)
    const decayExponent = daysSinceAccess / effectiveHalfLife;
    let currentStrength = Math.pow(0.5, decayExponent);

    // Apply base importance as a floor
    currentStrength = Math.max(currentStrength, memory.baseImportance * 0.5);

    // Clamp to valid range
    currentStrength = Math.max(0, Math.min(1, currentStrength));

    const shouldArchive = currentStrength < this.config.archivalThreshold;

    return {
      currentStrength,
      effectiveHalfLife,
      daysSinceAccess,
      isProtected: false,
      shouldArchive,
    };
  }

  /**
   * Check if a memory is protected from decay
   * Uses both built-in rules AND the Protection Engine for "Better Than Human" protection
   */
  isProtected(memory: MemoryItem): boolean {
    // Protected types
    if (this.config.protectedTypes.includes(memory.type)) {
      return true;
    }

    // Commitments are always protected until resolved
    if (this.config.commitmentProtection && memory.commitment) {
      return true;
    }

    // Very high emotional weight memories are protected
    if (memory.emotionalWeight > 0.9) {
      return true;
    }

    // ENHANCEMENT: Check Protection Engine for "Better Than Human" protection
    // Protects: core identity, emotional milestones, life milestones,
    // relationship cores, and user-marked memories
    try {
      // Dynamic import to avoid circular dependencies
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isMemoryProtected } = require('./protection-engine.js');
      if (isMemoryProtected(memory)) {
        return true;
      }
    } catch (error) {
      // Protection engine not available - use built-in rules only
    }

    return false;
  }

  /**
   * Reactivate a memory (user mentioned it again)
   */
  reactivate(memory: DecayingMemory): DecayingMemory {
    const newReactivationCount = memory.reactivationCount + 1;

    // Boost strength
    const boost = Math.min(1.0, memory.strength * this.config.reactivationBoost);

    log.debug(
      {
        memoryId: memory.id,
        previousStrength: memory.strength,
        newStrength: boost,
        reactivationCount: newReactivationCount,
      },
      'Memory reactivated'
    );

    return {
      ...memory,
      strength: boost,
      lastAccessed: new Date(),
      reactivationCount: newReactivationCount,
      archived: false, // Un-archive if previously archived
    };
  }

  /**
   * Convert a MemoryItem to DecayingMemory
   */
  initializeDecay(memory: MemoryItem): DecayingMemory {
    const decayResult = this.calculateStrength(memory);

    return {
      ...memory,
      strength: decayResult.currentStrength,
      lastAccessed: memory.timestamp,
      reactivationCount: 0,
      archived: decayResult.shouldArchive,
    };
  }

  /**
   * Update decay for all memories
   */
  updateDecay(memories: DecayingMemory[]): DecayingMemory[] {
    return memories.map((memory) => {
      const decayResult = this.calculateStrength(memory);

      return {
        ...memory,
        strength: decayResult.currentStrength,
        archived: decayResult.shouldArchive,
      };
    });
  }

  /**
   * Prune weak memories (archive them, don't delete)
   */
  pruneWeakMemories(memories: DecayingMemory[]): PruneResult {
    const result: PruneResult = {
      archived: [],
      preserved: 0,
      strengthDistribution: {
        strong: 0,
        moderate: 0,
        weak: 0,
      },
    };

    for (const memory of memories) {
      const decayResult = this.calculateStrength(memory);

      // Update distribution
      if (decayResult.currentStrength > 0.7) {
        result.strengthDistribution.strong++;
      } else if (decayResult.currentStrength > 0.3) {
        result.strengthDistribution.moderate++;
      } else {
        result.strengthDistribution.weak++;
      }

      // Archive if below threshold
      if (decayResult.shouldArchive && !decayResult.isProtected) {
        result.archived.push(memory.id);
      } else {
        result.preserved++;
      }
    }

    log.info(
      {
        archived: result.archived.length,
        preserved: result.preserved,
        distribution: result.strengthDistribution,
      },
      'Memory pruning complete'
    );

    return result;
  }

  /**
   * Get memories sorted by strength (strongest first)
   */
  sortByStrength(memories: DecayingMemory[]): DecayingMemory[] {
    return [...memories].sort((a, b) => {
      const strengthA = this.calculateStrength(a).currentStrength;
      const strengthB = this.calculateStrength(b).currentStrength;
      return strengthB - strengthA;
    });
  }

  /**
   * Filter to only active (non-archived) memories
   */
  filterActive(memories: DecayingMemory[]): DecayingMemory[] {
    return memories.filter((m) => !m.archived);
  }

  /**
   * Get decay statistics for a memory set
   */
  getDecayStats(memories: DecayingMemory[]): {
    totalMemories: number;
    activeMemories: number;
    archivedMemories: number;
    protectedMemories: number;
    averageStrength: number;
    oldestActive: Date | null;
    newestActive: Date | null;
  } {
    let activeCount = 0;
    let archivedCount = 0;
    let protectedCount = 0;
    let strengthSum = 0;
    let oldestActive: Date | null = null;
    let newestActive: Date | null = null;

    for (const memory of memories) {
      const decayResult = this.calculateStrength(memory);
      strengthSum += decayResult.currentStrength;

      if (decayResult.isProtected) {
        protectedCount++;
      }

      if (memory.archived) {
        archivedCount++;
      } else {
        activeCount++;
        if (!oldestActive || memory.timestamp < oldestActive) {
          oldestActive = memory.timestamp;
        }
        if (!newestActive || memory.timestamp > newestActive) {
          newestActive = memory.timestamp;
        }
      }
    }

    return {
      totalMemories: memories.length,
      activeMemories: activeCount,
      archivedMemories: archivedCount,
      protectedMemories: protectedCount,
      averageStrength: memories.length > 0 ? strengthSum / memories.length : 0,
      oldestActive,
      newestActive,
    };
  }

  /**
   * Simulate decay over time (for testing/visualization)
   */
  simulateDecay(
    memory: MemoryItem,
    daysToSimulate: number,
    stepDays = 7
  ): Array<{ day: number; strength: number }> {
    const results: Array<{ day: number; strength: number }> = [];
    const baseMemory = this.initializeDecay(memory);

    for (let day = 0; day <= daysToSimulate; day += stepDays) {
      // Create a simulated memory with adjusted timestamp
      const simulatedMemory: DecayingMemory = {
        ...baseMemory,
        lastAccessed: new Date(Date.now() - day * 24 * 60 * 60 * 1000),
      };

      const decayResult = this.calculateStrength(simulatedMemory);
      results.push({
        day,
        strength: decayResult.currentStrength,
      });
    }

    return results;
  }

  // ============================================================================
  // LEGACY COMPATIBILITY HELPERS
  // ============================================================================

  /**
   * Legacy API: applyDecay(memory) → DecayResult
   *
   * Older tests/callers passed a simplified memory shape (no `type`, `source`, etc.).
   * We adapt it into a `MemoryItem` and reuse the v2 decay calculation.
   */
  applyDecay(memory: {
    id: string;
    content: string;
    timestamp: Date;
    emotionalWeight: number;
    initialStrength?: number;
    hasCommitment?: boolean;
  }): DecayResult {
    const baseImportance =
      typeof memory.initialStrength === 'number' ? this.clamp01(memory.initialStrength) : 0.5;

    const item: MemoryItem = {
      id: memory.id,
      type: memory.hasCommitment ? 'commitment' : 'topic',
      content: memory.content,
      timestamp: memory.timestamp,
      emotionalWeight: memory.emotionalWeight,
      relevanceDecay: 0,
      baseImportance,
      commitment: memory.hasCommitment ?? false,
      source: {
        collection: 'legacy',
        documentId: memory.id,
      },
    };

    return this.calculateStrength(item);
  }

  /**
   * Legacy API: pruneWeak(memories, dryRun) → { analyzed, pruned, preserved }
   *
   * In v2, we "prune" by archiving (never hard delete). This helper mirrors the
   * older return shape while using v2 decay logic.
   */
  pruneWeak(
    memories: Array<{
      id: string;
      content: string;
      timestamp: Date;
      emotionalWeight: number;
      initialStrength?: number;
      hasCommitment?: boolean;
    }>,
    _dryRun?: boolean
  ): { analyzed: number; pruned: string[]; preserved: number } {
    const analyzed = memories.length;
    const pruned: string[] = [];

    for (const memory of memories) {
      const decay = this.applyDecay(memory);
      if (decay.shouldArchive) {
        pruned.push(memory.id);
      }
    }

    return { analyzed, pruned, preserved: analyzed - pruned.length };
  }

  private clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultDecayManager: MemoryDecayManager | null = null;

/**
 * Get the default decay manager
 */
export function getMemoryDecayManager(config?: Partial<MemoryDecayConfig>): MemoryDecayManager {
  if (!defaultDecayManager) {
    defaultDecayManager = new MemoryDecayManager(config);
  }
  return defaultDecayManager;
}

/**
 * Reset the decay manager (for testing)
 */
export function resetMemoryDecayManager(): void {
  defaultDecayManager = null;
}

export default {
  MemoryDecayManager,
  getMemoryDecayManager,
  resetMemoryDecayManager,
};
