/**
 * Memory Decay Curves
 *
 * Different memory types decay differently:
 * - Facts decay exponentially (fast at first, then plateau)
 * - Preferences plateau (stable once formed)
 * - Emotions decay quickly but leave traces
 * - Commitments have step decay (sharp drop after deadline)
 *
 * This mimics how human memory actually works.
 *
 * @module memory/decay-curves
 */

import { createLogger } from '../utils/safe-logger.js';
import type { MemoryItem } from './interfaces/index.js';

const log = createLogger({ module: 'DecayCurves' });

// ============================================================================
// TYPES
// ============================================================================

export type DecayCurve =
  | 'exponential' // Fast initial decay, then plateaus (facts, events)
  | 'linear' // Steady decay over time (patterns)
  | 'plateau' // Stable until threshold, then normal decay (preferences, relationships)
  | 'step' // Sharp drops at specific intervals (commitments)
  | 'none'; // Never decays (protected memories)

export interface DecayConfig {
  // Base decay rate per day
  baseDecayRate: number;

  // Curve-specific parameters
  exponentialHalfLife: number; // Days until 50% decay
  plateauThreshold: number; // Days before plateau protection ends
  stepDropPoints: number[]; // Days at which step drops occur
  stepDropAmount: number; // How much to drop at each step

  // Modifiers
  emotionalBoost: number; // Multiply decay rate by this for high-emotion memories
  accessBoost: number; // Each access reduces decay by this factor
  linkBoost: number; // Each link reduces decay by this factor
}

const DEFAULT_CONFIG: DecayConfig = {
  baseDecayRate: 0.01, // 1% per day base
  exponentialHalfLife: 30, // 30 days to 50%
  plateauThreshold: 90, // 90 days of protection
  stepDropPoints: [7, 30, 90], // Weekly, monthly, quarterly
  stepDropAmount: 0.2, // 20% drop at each step
  emotionalBoost: 0.5, // Emotional memories decay 50% slower
  accessBoost: 0.1, // Each access reduces decay by 10%
  linkBoost: 0.05, // Each link reduces decay by 5%
};

// Memory type to decay curve mapping
export const MEMORY_TYPE_CURVES: Record<MemoryItem['type'], DecayCurve> = {
  summary: 'linear',
  moment: 'exponential',
  topic: 'linear',
  commitment: 'step',
  preference: 'plateau',
  person: 'plateau',
  event: 'exponential',
};

// ============================================================================
// DECAY CALCULATOR
// ============================================================================

export class DecayCurveCalculator {
  private config: DecayConfig;

  constructor(config?: Partial<DecayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate decay score for a memory
   * Returns 0 (fresh) to 1 (fully decayed)
   */
  calculateDecay(
    memory: MemoryItem,
    options: {
      accessCount?: number;
      linkCount?: number;
      isProtected?: boolean;
    } = {}
  ): number {
    const { accessCount = 0, linkCount = 0, isProtected = false } = options;

    // Protected memories don't decay
    if (isProtected) {
      return 0;
    }

    // Get the decay curve for this memory type
    const curve = MEMORY_TYPE_CURVES[memory.type] || 'exponential';
    if (curve === 'none') {
      return 0;
    }

    // Calculate days since creation
    const daysSinceCreation = this.daysSince(memory.timestamp);

    // Calculate base decay
    let decay = this.calculateCurveDecay(curve, daysSinceCreation);

    // Apply modifiers
    decay = this.applyModifiers(decay, memory, accessCount, linkCount);

    // Clamp to 0-1
    return Math.min(1, Math.max(0, decay));
  }

  /**
   * Calculate decay based on curve type
   */
  private calculateCurveDecay(curve: DecayCurve, days: number): number {
    switch (curve) {
      case 'exponential':
        return this.exponentialDecay(days);
      case 'linear':
        return this.linearDecay(days);
      case 'plateau':
        return this.plateauDecay(days);
      case 'step':
        return this.stepDecay(days);
      case 'none':
        return 0;
      default:
        return this.exponentialDecay(days);
    }
  }

  /**
   * Exponential decay: Fast at first, then plateaus
   * Formula: 1 - e^(-λt) where λ = ln(2)/halfLife
   */
  private exponentialDecay(days: number): number {
    const lambda = Math.log(2) / this.config.exponentialHalfLife;
    return 1 - Math.exp(-lambda * days);
  }

  /**
   * Linear decay: Steady increase over time
   * Reaches 1.0 at 365 days
   */
  private linearDecay(days: number): number {
    return Math.min(1, days * this.config.baseDecayRate);
  }

  /**
   * Plateau decay: Protected for a period, then normal decay
   */
  private plateauDecay(days: number): number {
    if (days < this.config.plateauThreshold) {
      // Protected period - minimal decay
      return days * this.config.baseDecayRate * 0.1;
    }
    // After plateau, normal exponential
    const daysAfterPlateau = days - this.config.plateauThreshold;
    return this.exponentialDecay(daysAfterPlateau);
  }

  /**
   * Step decay: Sharp drops at specific intervals
   */
  private stepDecay(days: number): number {
    let decay = 0;

    for (const dropPoint of this.config.stepDropPoints) {
      if (days >= dropPoint) {
        decay += this.config.stepDropAmount;
      }
    }

    return Math.min(1, decay);
  }

  /**
   * Apply modifiers (emotion, access, links)
   */
  private applyModifiers(
    decay: number,
    memory: MemoryItem,
    accessCount: number,
    linkCount: number
  ): number {
    // Emotional memories decay slower
    if (memory.emotionalWeight > 0.5) {
      decay *= 1 - this.config.emotionalBoost * memory.emotionalWeight;
    }

    // Each access reduces decay
    const accessReduction = Math.min(0.5, accessCount * this.config.accessBoost);
    decay *= 1 - accessReduction;

    // Each link reduces decay
    const linkReduction = Math.min(0.3, linkCount * this.config.linkBoost);
    decay *= 1 - linkReduction;

    return decay;
  }

  /**
   * Calculate days since a date
   */
  private daysSince(date: Date): number {
    const now = Date.now();
    const then = date.getTime();
    return Math.floor((now - then) / (24 * 60 * 60 * 1000));
  }

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  /**
   * Calculate decay for multiple memories
   */
  calculateBatchDecay(
    memories: MemoryItem[],
    accessCounts?: Map<string, number>,
    linkCounts?: Map<string, number>,
    protectedIds?: Set<string>
  ): Map<string, number> {
    const results = new Map<string, number>();

    for (const memory of memories) {
      const decay = this.calculateDecay(memory, {
        accessCount: accessCounts?.get(memory.id) || 0,
        linkCount: linkCounts?.get(memory.id) || 0,
        isProtected: protectedIds?.has(memory.id) || false,
      });
      results.set(memory.id, decay);
    }

    return results;
  }

  /**
   * Get memories that should be archived (fully decayed)
   */
  getArchiveCandidates(memories: MemoryItem[], threshold = 0.9): MemoryItem[] {
    return memories.filter((memory) => {
      const decay = this.calculateDecay(memory);
      return decay >= threshold;
    });
  }

  /**
   * Predict when a memory will reach a decay threshold
   */
  predictDecayDate(memory: MemoryItem, targetDecay = 0.5): Date | null {
    const curve = MEMORY_TYPE_CURVES[memory.type] || 'exponential';

    if (curve === 'none' || curve === 'plateau') {
      return null; // Won't reach threshold
    }

    let daysToTarget: number;

    switch (curve) {
      case 'exponential': {
        // Solve: targetDecay = 1 - e^(-λt) for t
        const lambda = Math.log(2) / this.config.exponentialHalfLife;
        daysToTarget = -Math.log(1 - targetDecay) / lambda;
        break;
      }
      case 'linear': {
        daysToTarget = targetDecay / this.config.baseDecayRate;
        break;
      }
      case 'step': {
        // Find first step that reaches target
        let cumulative = 0;
        for (const day of this.config.stepDropPoints) {
          cumulative += this.config.stepDropAmount;
          if (cumulative >= targetDecay) {
            daysToTarget = day;
            break;
          }
        }
        daysToTarget = daysToTarget! || 365;
        break;
      }
      default:
        return null;
    }

    // Add days to memory creation date
    const targetDate = new Date(memory.timestamp);
    targetDate.setDate(targetDate.getDate() + Math.ceil(daysToTarget));
    return targetDate;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let decayCurveInstance: DecayCurveCalculator | null = null;

export function getDecayCurveCalculator(): DecayCurveCalculator {
  if (!decayCurveInstance) {
    decayCurveInstance = new DecayCurveCalculator();
  }
  return decayCurveInstance;
}

export function resetDecayCurveCalculator(): void {
  decayCurveInstance = null;
}

export default {
  DecayCurveCalculator,
  getDecayCurveCalculator,
  resetDecayCurveCalculator,
  MEMORY_TYPE_CURVES,
};
