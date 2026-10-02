/**
 * Humanizer Utilities
 *
 * Shared utility functions for the humanizer modules.
 *
 * @module @ferni/conversation/humanizer/utils
 */

// ============================================================================
// DETERMINISTIC PROBABILITY
// ============================================================================

/**
 * Create a deterministic trigger function for stable behavior.
 * Avoids Math.random() so the same session/turn behaves consistently.
 */
export function createDeterministicTrigger(
  sessionId: string,
  personaId: string
): (turnNumber: number, feature: string, probability: number) => boolean {
  return (turnNumber: number, feature: string, probability: number): boolean => {
    const p = Math.max(0, Math.min(1, probability));
    if (p === 0) return false;
    if (p === 1) return true;

    const key = `${sessionId}:${personaId}:${turnNumber}:${feature}`;
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    const roll = hash / 0xffffffff;
    return roll < p;
  };
}
