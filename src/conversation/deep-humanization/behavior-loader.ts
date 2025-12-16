/**
 * Behavior Content Loader
 *
 * Loads persona-specific behavior content from JSON files.
 * Content is cached to avoid repeated filesystem access.
 *
 * @module @ferni/conversation/deep-humanization/behavior-loader
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { BehaviorContent, BehaviorCache } from './types.js';

const log = createLogger({ module: 'BehaviorLoader' });

// ============================================================================
// CACHE
// ============================================================================

const behaviorCache: BehaviorCache = new Map();

// ============================================================================
// LOADER
// ============================================================================

/**
 * Load behavior content for a persona
 *
 * @param personaId - The persona to load content for
 * @param behaviorName - The behavior file name (without .json)
 * @returns The behavior content or null if not found
 */
export async function loadBehaviorContent(
  personaId: string,
  behaviorName: string
): Promise<BehaviorContent | null> {
  const cacheKey = `${personaId}:${behaviorName}`;

  if (behaviorCache.has(cacheKey)) {
    return behaviorCache.get(cacheKey) ?? null;
  }

  try {
    // Dynamic import of JSON
    const path = `../../personas/bundles/${personaId}/content/behaviors/${behaviorName}.json`;
    const content = await import(path, { assert: { type: 'json' } });
    behaviorCache.set(cacheKey, content.default);
    return content.default;
  } catch {
    log.debug({ personaId, behaviorName }, 'Behavior content not found');
    return null;
  }
}

/**
 * Preload multiple behaviors for a persona
 */
export async function preloadBehaviors(personaId: string, behaviorNames: string[]): Promise<void> {
  await Promise.all(behaviorNames.map((name) => loadBehaviorContent(personaId, name)));
}

/**
 * Clear the behavior cache
 */
export function clearBehaviorCache(): void {
  behaviorCache.clear();
}

/**
 * Get cache statistics
 */
export function getBehaviorCacheStats(): { size: number; keys: string[] } {
  return {
    size: behaviorCache.size,
    keys: Array.from(behaviorCache.keys()),
  };
}

// ============================================================================
// DEFAULT BEHAVIORS
// ============================================================================

/**
 * List of behavior files that can be loaded
 */
export const AVAILABLE_BEHAVIORS = [
  'mood-drift',
  'spontaneous-thoughts',
  'physical-presence',
  'mind-changing',
  'excitement-interruptions',
  'breath-sounds',
  'anticipation',
  'contradiction-surfacing',
  'running-jokes',
  'engagement-signals',
  'i-notice-power',
  'playfulness',
  'live-reactions',
] as const;

export type BehaviorName = (typeof AVAILABLE_BEHAVIORS)[number];

/**
 * Preload all standard behaviors for a persona
 */
export async function preloadAllBehaviors(personaId: string): Promise<void> {
  await preloadBehaviors(personaId, [...AVAILABLE_BEHAVIORS]);
}
