/**
 * Decay Manager
 *
 * Implements graceful forgetting with protection for important memories.
 * Models human memory decay while preserving emotionally significant,
 * frequently accessed, and actively committed memories.
 *
 * @module memory/lifecycle/decay-manager
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../unified-store/types.js';
import type {
  DecayConfig,
  DecayResult,
  DecayBatchResult,
  ProtectionFactor,
} from './types.js';
import { DEFAULT_DECAY_CONFIG } from './types.js';

const log = createLogger({ module: 'DecayManager' });

// ============================================================================
// DECAY MANAGER
// ============================================================================

/**
 * Decay Manager
 *
 * Manages graceful forgetting of memories while protecting important ones.
 */
export class DecayManager {
  private config: DecayConfig;

  constructor(config: Partial<DecayConfig> = {}) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }

  /**
   * Calculate decay for a single memory
   */
  calculateDecay(memory: StoredMemory): DecayResult {
    const now = new Date();
    const daysSinceCreation = this.daysDiff(memory.createdAt, now);
    const daysSinceAccess = this.daysDiff(memory.lastAccessedAt, now);

    // Calculate base decay (exponential)
    // strength = initialStrength * (decayRate ^ days)
    const baseDecay = Math.pow(this.config.decayRate, daysSinceAccess);

    // Collect protection factors
    const protectionFactors: ProtectionFactor[] = [];
    let totalProtection = 1.0;

    // 1. Emotional weight protection
    if (memory.emotionalWeight > 0.3) {
      const emotionalProtection = 1 + memory.emotionalWeight * this.config.emotionalMultiplier;
      protectionFactors.push({
        type: 'emotional',
        multiplier: emotionalProtection,
        description: `Emotional weight: ${memory.emotionalWeight.toFixed(2)}`,
      });
      totalProtection *= emotionalProtection;
    }

    // 2. Active commitment protection
    if (memory.isActiveCommitment) {
      protectionFactors.push({
        type: 'commitment',
        multiplier: this.config.commitmentProtection,
        description: 'Active commitment - fully protected',
      });
      totalProtection *= this.config.commitmentProtection;
    }

    // 3. High importance protection
    if (memory.importance > 0.7) {
      const importanceProtection = 1 + (memory.importance - 0.7) * (this.config.importanceProtection - 1);
      protectionFactors.push({
        type: 'importance',
        multiplier: importanceProtection,
        description: `High importance: ${memory.importance.toFixed(2)}`,
      });
      totalProtection *= importanceProtection;
    }

    // 4. Frequency protection (accessed often)
    if (memory.accessCount > 5) {
      const frequencyProtection = 1 + Math.log10(memory.accessCount) * 0.2;
      protectionFactors.push({
        type: 'frequency',
        multiplier: Math.min(frequencyProtection, this.config.frequencyProtection),
        description: `Accessed ${memory.accessCount} times`,
      });
      totalProtection *= Math.min(frequencyProtection, this.config.frequencyProtection);
    }

    // 5. Explicit protection
    if (memory.isProtected) {
      protectionFactors.push({
        type: 'explicit',
        multiplier: 10.0, // Effectively prevents decay
        description: 'Explicitly protected',
      });
      totalProtection *= 10.0;
    }

    // 6. Recency protection (accessed within last 7 days)
    if (daysSinceAccess < 7) {
      const recencyProtection = 1 + (7 - daysSinceAccess) * 0.05;
      protectionFactors.push({
        type: 'recency',
        multiplier: recencyProtection,
        description: `Recently accessed (${daysSinceAccess.toFixed(0)} days ago)`,
      });
      totalProtection *= recencyProtection;
    }

    // Calculate final decay with protection
    // Higher protection = less decay
    const protectedDecayRate = 1 - (1 - baseDecay) / totalProtection;
    const newStrength = memory.strength * protectedDecayRate;

    // Clamp to valid range
    const clampedStrength = Math.max(0, Math.min(1, newStrength));
    const decayAmount = memory.strength - clampedStrength;

    // Determine if memory should be cleaned up
    const shouldCleanup =
      clampedStrength < this.config.minStrength &&
      daysSinceAccess > this.config.maxInactiveDays &&
      !memory.isProtected &&
      !memory.isActiveCommitment;

    let cleanupReason: string | undefined;
    if (shouldCleanup) {
      cleanupReason = `Strength ${clampedStrength.toFixed(3)} below threshold, inactive for ${daysSinceAccess.toFixed(0)} days`;
    }

    return {
      memoryId: memory.id,
      previousStrength: memory.strength,
      newStrength: clampedStrength,
      decayAmount,
      protectionFactors,
      totalProtection,
      shouldCleanup,
      cleanupReason,
    };
  }

  /**
   * Apply decay to a batch of memories
   */
  async applyDecay(memories: StoredMemory[]): Promise<DecayBatchResult> {
    const startTime = Date.now();
    const results: DecayResult[] = [];
    let decayed = 0;
    let markedForCleanup = 0;

    for (const memory of memories) {
      const result = this.calculateDecay(memory);
      results.push(result);

      if (result.decayAmount > 0.001) {
        decayed++;
      }

      if (result.shouldCleanup) {
        markedForCleanup++;
      }
    }

    const durationMs = Date.now() - startTime;

    log.debug({
      processed: memories.length,
      decayed,
      markedForCleanup,
      durationMs,
    }, 'Decay batch complete');

    return {
      processed: memories.length,
      decayed,
      markedForCleanup,
      results,
      durationMs,
    };
  }

  /**
   * Get memories that should be cleaned up
   */
  getCleanupCandidates(memories: StoredMemory[]): Array<{ memory: StoredMemory; reason: string }> {
    const candidates: Array<{ memory: StoredMemory; reason: string }> = [];

    for (const memory of memories) {
      const result = this.calculateDecay(memory);
      if (result.shouldCleanup) {
        candidates.push({
          memory,
          reason: result.cleanupReason || 'Below strength threshold',
        });
      }
    }

    return candidates;
  }

  /**
   * Reinforce a memory (boost its strength)
   */
  calculateReinforcement(memory: StoredMemory): { newStrength: number; boostAmount: number } {
    // Reinforce based on current state
    const boostAmount = Math.min(0.2, 1 - memory.strength);
    const newStrength = Math.min(1, memory.strength + boostAmount);

    return { newStrength, boostAmount };
  }

  /**
   * Calculate days difference between two dates
   */
  private daysDiff(date1: Date, date2: Date): number {
    const diffMs = date2.getTime() - date1.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  /**
   * Get decay preview for a memory (without applying)
   */
  previewDecay(memory: StoredMemory, days: number): DecayResult[] {
    const previews: DecayResult[] = [];
    let current = { ...memory };

    for (let day = 1; day <= days; day++) {
      // Simulate passage of time
      current.lastAccessedAt = new Date(current.lastAccessedAt.getTime() - 24 * 60 * 60 * 1000);
      const result = this.calculateDecay(current as StoredMemory);
      previews.push(result);
      current.strength = result.newStrength;
    }

    return previews;
  }

  /**
   * Calculate time until memory would reach minimum strength
   */
  estimateTimeUntilDecay(memory: StoredMemory): number | null {
    if (memory.isProtected || memory.isActiveCommitment) {
      return null; // Won't decay
    }

    // Binary search for when strength drops below threshold
    let low = 0;
    let high = 365 * 5; // 5 years max

    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      const preview = this.previewDecay(memory, mid);
      const finalStrength = preview[preview.length - 1]?.newStrength ?? 1;

      if (finalStrength < this.config.minStrength) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return high;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let managerInstance: DecayManager | null = null;

export function getDecayManager(config?: Partial<DecayConfig>): DecayManager {
  if (!managerInstance) {
    managerInstance = new DecayManager(config);
  }
  return managerInstance;
}

export function resetDecayManager(): void {
  managerInstance = null;
}
