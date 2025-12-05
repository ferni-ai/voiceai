/**
 * Persona Bundles Module
 *
 * New architecture for deeply personalized AI agents with 100+ context files.
 *
 * Usage:
 *   import { loadBundle, loadBundleById, convertLegacyToBundle } from './bundles/index.js';
 *
 *   // Load a bundle
 *   const nayan = await loadBundleById('nayan-patel');
 *
 *   // Get stories
 *   const stories = await nayan.getStoriesByTrigger('life wisdom');
 *
 *   // Convert legacy persona to bundle format (for migration)
 *   const bundlePath = await convertLegacyToBundle(PERSONA_CONFIG, './output');
 *
 *   // Load all bundles and register them
 *   const personas = await discoverAndLoadBundles();
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { log } from '@livekit/agents';
import type { PersonaConfig } from '../types.js';
import type { LoadedPersonaBundle } from './types.js';

// Safe logger that doesn't throw if not initialized
const getLogger = () => {
  try {
    return log();
  } catch {
    return {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
  }
};

// Types
export * from './types.js';

// Loader
export {
  loadBundle,
  loadBundleById,
  getBundleSearchPaths,
  clearBundleCache,
  getCachedBundles,
} from './loader.js';

// Adapter (bundle to PersonaConfig conversion)
export { bundleToPersonaConfig } from './adapter.js';

// Converter (for migration)
export { convertLegacyToBundle, generateManifest } from './converter.js';

// Runtime Engine
export {
  BundleRuntimeEngine,
  createBundleRuntime,
  getBundleRuntime,
  clearBundleRuntimes,
} from './runtime.js';
export type { BundleRuntimeState } from './runtime.js';

// ============================================================================
// BUNDLE DISCOVERY AND REGISTRATION
// ============================================================================

import { loadBundleById, getBundleSearchPaths } from './loader.js';
import { bundleToPersonaConfig } from './adapter.js';

// Cache for discovered bundles - prevents redundant loading
let discoveryCache: {
  personas: PersonaConfig[];
  bundles: LoadedPersonaBundle[];
  errors: string[];
} | null = null;

/**
 * Discover all bundles in search paths
 */
export async function discoverBundles(): Promise<string[]> {
  const bundleIds: string[] = [];
  const searchPaths = getBundleSearchPaths();

  for (const basePath of searchPaths) {
    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = join(basePath, entry.name, 'persona.manifest.json');
          try {
            await stat(manifestPath);
            bundleIds.push(entry.name);
          } catch {
            // No manifest, not a bundle
          }
        }
      }
    } catch {
      // Search path doesn't exist
    }
  }

  return [...new Set(bundleIds)]; // Dedupe
}

/** Concurrency limit for parallel bundle loading */
const BUNDLE_LOAD_CONCURRENCY = 5;

/**
 * Load all discovered bundles and convert to PersonaConfig
 * Results are cached to prevent redundant loading on subsequent calls
 * FIX BUG #bundle-13: Load bundles in parallel batches for better performance
 */
export async function discoverAndLoadBundles(): Promise<{
  personas: PersonaConfig[];
  bundles: LoadedPersonaBundle[];
  errors: string[];
}> {
  // Return cached result if already loaded
  if (discoveryCache) {
    getLogger().debug({ cached: true }, 'Returning cached bundle discovery result');
    return discoveryCache;
  }

  const startTime = Date.now();
  const bundleIds = await discoverBundles();
  const personas: PersonaConfig[] = [];
  const bundles: LoadedPersonaBundle[] = [];
  const errors: string[] = [];

  // FIX BUG #bundle-13: Load bundles in parallel batches
  // Process in batches of BUNDLE_LOAD_CONCURRENCY to avoid overwhelming the system
  for (let i = 0; i < bundleIds.length; i += BUNDLE_LOAD_CONCURRENCY) {
    const batch = bundleIds.slice(i, i + BUNDLE_LOAD_CONCURRENCY);
    
    const batchResults = await Promise.all(
      batch.map(async (bundleId) => {
        try {
          const bundle = await loadBundleById(bundleId);
          if (bundle) {
            const persona = await bundleToPersonaConfig(bundle);
            return { success: true, bundleId, bundle, persona };
          }
          return { success: false, bundleId, error: 'Bundle not found' };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, bundleId, error: message };
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.success && 'bundle' in result && 'persona' in result) {
        bundles.push(result.bundle!);
        personas.push(result.persona!);
        getLogger().debug({ bundleId: result.bundleId }, 'Loaded bundle');
      } else if ('error' in result) {
        errors.push(`Failed to load bundle ${result.bundleId}: ${result.error}`);
        getLogger().warn({ bundleId: result.bundleId, error: result.error }, 'Failed to load bundle');
      }
    }
  }

  const loadTime = Date.now() - startTime;
  getLogger().info(
    { loaded: personas.length, failed: errors.length, loadTimeMs: loadTime },
    'Bundle discovery complete'
  );

  // Cache the result
  discoveryCache = { personas, bundles, errors };

  return discoveryCache;
}

/**
 * Load a single bundle as PersonaConfig
 */
export async function loadBundleAsPersona(bundleId: string): Promise<PersonaConfig | null> {
  const bundle = await loadBundleById(bundleId);
  if (!bundle) return null;
  return bundleToPersonaConfig(bundle);
}
