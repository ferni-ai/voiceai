/**
 * Persona Bundle Preloader
 *
 * Preloads all persona bundles during prewarm for faster first use.
 * This eliminates cold-start latency for handoffs between personas.
 *
 * @module personas/bundles/preloader
 */

import { getLogger } from '../../utils/safe-logger.js';
import { loadBundleById } from './loader.js';

const log = getLogger();

// All persona IDs that should be preloaded
const PERSONA_IDS = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'] as const;

// Track preload status
let preloadPromise: Promise<void> | null = null;
let preloadComplete = false;

/**
 * Preload all persona bundles into memory.
 * This is called during prewarm to eliminate cold-start latency.
 *
 * The function is idempotent - calling it multiple times is safe.
 */
export async function preloadAllBundles(): Promise<void> {
  // Return existing promise if already preloading
  if (preloadPromise) {
    return preloadPromise;
  }

  // Return immediately if already done
  if (preloadComplete) {
    return;
  }

  preloadPromise = doPreload();
  return preloadPromise;
}

async function doPreload(): Promise<void> {
  const startTime = Date.now();
  const results: Array<{ id: string; success: boolean; timeMs: number }> = [];

  log.debug('Starting persona bundle preload');

  // Load all bundles in parallel for speed
  await Promise.all(
    PERSONA_IDS.map(async (personaId) => {
      const loadStart = Date.now();
      try {
        await loadBundleById(personaId);
        results.push({
          id: personaId,
          success: true,
          timeMs: Date.now() - loadStart,
        });
      } catch (error) {
        results.push({
          id: personaId,
          success: false,
          timeMs: Date.now() - loadStart,
        });
        log.warn({ personaId, error: String(error) }, 'Failed to preload persona bundle');
      }
    })
  );

  const successCount = results.filter((r) => r.success).length;
  const totalTimeMs = Date.now() - startTime;

  log.info(
    {
      total: PERSONA_IDS.length,
      successful: successCount,
      totalTimeMs,
      avgTimeMs: Math.round(totalTimeMs / PERSONA_IDS.length),
    },
    'Persona bundle preload complete'
  );

  preloadComplete = true;
}

/**
 * Check if bundles have been preloaded.
 */
export function areBundlesPreloaded(): boolean {
  return preloadComplete;
}

/**
 * Reset preload status (for testing).
 */
export function resetPreloadStatus(): void {
  preloadPromise = null;
  preloadComplete = false;
}
