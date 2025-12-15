/**
 * Effect Tracker
 *
 * Tracks effect usage within a session to enforce cooldowns and per-session limits.
 * This prevents over-humanization by ensuring effects respect their configured limits.
 *
 * @module @ferni/conversation/effects/effect-tracker
 */

import type { EffectConfig, EffectTracker } from './types.js';

// ============================================================================
// IMPLEMENTATION
// ============================================================================

class EffectTrackerImpl implements EffectTracker {
  private usageCounts = new Map<string, number>();
  private lastUsedTurn = new Map<string, number>();

  recordUsage(effectId: string, turnNumber: number): void {
    this.usageCounts.set(effectId, (this.usageCounts.get(effectId) ?? 0) + 1);
    this.lastUsedTurn.set(effectId, turnNumber);
  }

  canFire(effectId: string, turnNumber: number, config: EffectConfig): boolean {
    // Check max per session
    const usageCount = this.usageCounts.get(effectId) ?? 0;
    if (usageCount >= config.maxPerSession) {
      return false;
    }

    // Check cooldown
    const lastTurn = this.lastUsedTurn.get(effectId);
    if (lastTurn !== undefined) {
      const turnsSinceLast = turnNumber - lastTurn;
      if (turnsSinceLast < config.cooldownTurns) {
        return false;
      }
    }

    return true;
  }

  getUsageCount(effectId: string): number {
    return this.usageCounts.get(effectId) ?? 0;
  }

  getLastUsedTurn(effectId: string): number | null {
    return this.lastUsedTurn.get(effectId) ?? null;
  }

  reset(): void {
    this.usageCounts.clear();
    this.lastUsedTurn.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const trackers = new Map<string, EffectTracker>();

/**
 * Get or create an effect tracker for a session
 */
export function getEffectTracker(sessionId: string): EffectTracker {
  let tracker = trackers.get(sessionId);
  if (!tracker) {
    tracker = new EffectTrackerImpl();
    trackers.set(sessionId, tracker);
  }
  return tracker;
}

/**
 * Reset tracker for a session
 */
export function resetEffectTracker(sessionId: string): void {
  const tracker = trackers.get(sessionId);
  if (tracker) {
    tracker.reset();
  }
  trackers.delete(sessionId);
}

/**
 * Reset all trackers
 */
export function resetAllEffectTrackers(): void {
  trackers.clear();
}

