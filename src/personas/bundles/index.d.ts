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
import type { PersonaConfig } from '../types.js';
import type { LoadedPersonaBundle } from './types.js';
export * from './types.js';
export { clearBundleCache, getBundleSearchPaths, getCachedBundles, loadBundle, loadBundleById, } from './loader.js';
export { bundleToPersonaConfig } from './adapter.js';
export { convertLegacyToBundle, generateManifest } from './converter.js';
export { BundleRuntimeEngine, createBundleRuntime } from './runtime.js';
export type { BundleRuntimeState, UserBundleState } from './runtime.js';
/**
 * Discover all bundles in search paths
 */
export declare function discoverBundles(): Promise<string[]>;
/**
 * Load all discovered bundles and convert to PersonaConfig
 * Results are cached to prevent redundant loading on subsequent calls
 * FIX BUG #bundle-13: Load bundles in parallel batches for better performance
 * FIX BUG #bundle-race: Use promise lock to prevent concurrent discovery race conditions
 */
export declare function discoverAndLoadBundles(): Promise<{
    personas: PersonaConfig[];
    bundles: LoadedPersonaBundle[];
    errors: string[];
}>;
/**
 * Load a single bundle as PersonaConfig
 */
export declare function loadBundleAsPersona(bundleId: string): Promise<PersonaConfig | null>;
/**
 * OPTIMIZATION: Load bundles with priority - active persona first, others in background
 *
 * This dramatically improves startup time by:
 * 1. Loading only the required persona synchronously
 * 2. Loading other personas in the background (non-blocking)
 *
 * FIX BUG #bundle-race: Uses the same lock as discoverAndLoadBundles to prevent races
 *
 * @param priorityBundleId - The bundle to load first (typically from PERSONA_ID env var)
 * @param loadOthersInBackground - Whether to load other bundles in background (default: true)
 */
export declare function discoverAndLoadBundlesWithPriority(priorityBundleId?: string, loadOthersInBackground?: boolean): Promise<{
    personas: PersonaConfig[];
    bundles: LoadedPersonaBundle[];
    errors: string[];
    backgroundLoadPromise?: Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map