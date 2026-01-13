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
import { getLogger } from '../../utils/safe-logger.js';
// Types
export * from './types.js';
// Loader
export { clearBundleCache, getBundleSearchPaths, getCachedBundles, loadBundle, loadBundleById, } from './loader.js';
// Adapter (bundle to PersonaConfig conversion)
export { bundleToPersonaConfig } from './adapter.js';
// Converter (for migration)
export { convertLegacyToBundle, generateManifest } from './converter.js';
// Runtime Engine
export { BundleRuntimeEngine, createBundleRuntime } from './runtime.js';
// ============================================================================
// BUNDLE DISCOVERY AND REGISTRATION
// ============================================================================
import { bundleToPersonaConfig } from './adapter.js';
import { getBundleSearchPaths, loadBundleById } from './loader.js';
// Cache for discovered bundles - prevents redundant loading
let discoveryCache = null;
// FIX BUG #bundle-race: Promise lock to prevent concurrent discovery
// When multiple callers invoke discoverAndLoadBundles() before cache is set,
// they should wait for the first discovery to complete rather than all racing
let discoveryInProgress = null;
/**
 * Discover all bundles in search paths
 */
export async function discoverBundles() {
    const bundleIds = [];
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
                    }
                    catch {
                        // No manifest, not a bundle
                    }
                }
            }
        }
        catch {
            // Search path doesn't exist
        }
    }
    return [...new Set(bundleIds)]; // Dedupe
}
/** Concurrency limit for parallel bundle loading - increased for faster startup */
const BUNDLE_LOAD_CONCURRENCY = 10;
/**
 * Load all discovered bundles and convert to PersonaConfig
 * Results are cached to prevent redundant loading on subsequent calls
 * FIX BUG #bundle-13: Load bundles in parallel batches for better performance
 * FIX BUG #bundle-race: Use promise lock to prevent concurrent discovery race conditions
 */
export async function discoverAndLoadBundles() {
    // Return cached result if already loaded
    if (discoveryCache) {
        getLogger().debug({ cached: true }, 'Returning cached bundle discovery result');
        return discoveryCache;
    }
    // FIX BUG #bundle-race: If discovery is already in progress, wait for it
    // This prevents multiple concurrent discoveries from racing
    if (discoveryInProgress) {
        getLogger().debug('Discovery already in progress, waiting...');
        return discoveryInProgress;
    }
    // Start discovery and store the promise so other callers can wait
    discoveryInProgress = performBundleDiscovery();
    try {
        const result = await discoveryInProgress;
        return result;
    }
    finally {
        // Clear the in-progress promise once complete (success or failure)
        discoveryInProgress = null;
    }
}
/**
 * Internal function that performs the actual bundle discovery
 */
async function performBundleDiscovery() {
    const startTime = Date.now();
    const bundleIds = await discoverBundles();
    const personas = [];
    const bundles = [];
    const errors = [];
    // FIX BUG #bundle-13: Load bundles in parallel batches
    // Process in batches of BUNDLE_LOAD_CONCURRENCY to avoid overwhelming the system
    for (let i = 0; i < bundleIds.length; i += BUNDLE_LOAD_CONCURRENCY) {
        const batch = bundleIds.slice(i, i + BUNDLE_LOAD_CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (bundleId) => {
            try {
                const bundle = await loadBundleById(bundleId);
                if (bundle) {
                    const persona = await bundleToPersonaConfig(bundle);
                    return { success: true, bundleId, bundle, persona };
                }
                return { success: false, bundleId, error: 'Bundle not found' };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { success: false, bundleId, error: message };
            }
        }));
        // Process batch results
        for (const result of batchResults) {
            if (result.success && 'bundle' in result && 'persona' in result) {
                bundles.push(result.bundle);
                personas.push(result.persona);
                getLogger().debug({ bundleId: result.bundleId }, 'Loaded bundle');
            }
            else if ('error' in result) {
                errors.push(`Failed to load bundle ${result.bundleId}: ${result.error}`);
                getLogger().warn({ bundleId: result.bundleId, error: result.error }, 'Failed to load bundle');
            }
        }
    }
    const loadTime = Date.now() - startTime;
    getLogger().info({ loaded: personas.length, failed: errors.length, loadTimeMs: loadTime }, 'Bundle discovery complete');
    // Cache the result
    discoveryCache = { personas, bundles, errors };
    return discoveryCache;
}
/**
 * Load a single bundle as PersonaConfig
 */
export async function loadBundleAsPersona(bundleId) {
    const bundle = await loadBundleById(bundleId);
    if (!bundle)
        return null;
    return bundleToPersonaConfig(bundle);
}
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
export async function discoverAndLoadBundlesWithPriority(priorityBundleId, loadOthersInBackground = true) {
    // Return cached result if already loaded
    if (discoveryCache) {
        getLogger().debug({ cached: true }, 'Returning cached bundle discovery result');
        return discoveryCache;
    }
    // FIX BUG #bundle-race: If discovery is already in progress, wait for it
    if (discoveryInProgress) {
        getLogger().debug('Discovery already in progress, waiting...');
        const result = await discoveryInProgress;
        return result;
    }
    // Start priority discovery and store the promise
    discoveryInProgress = performPriorityBundleDiscovery(priorityBundleId, loadOthersInBackground);
    try {
        const result = await discoveryInProgress;
        // Return with the backgroundLoadPromise if available (stored on result)
        return result;
    }
    finally {
        discoveryInProgress = null;
    }
}
/**
 * Internal function that performs priority bundle discovery
 */
async function performPriorityBundleDiscovery(priorityBundleId, loadOthersInBackground = true) {
    const startTime = Date.now();
    const bundleIds = await discoverBundles();
    const personas = [];
    const bundles = [];
    const errors = [];
    // Determine which bundle to load first
    const effectivePriorityId = priorityBundleId || process.env.PERSONA_ID || 'ferni';
    const priorityIndex = bundleIds.indexOf(effectivePriorityId);
    // Reorder to put priority bundle first
    const orderedBundleIds = priorityIndex >= 0
        ? [effectivePriorityId, ...bundleIds.filter((id) => id !== effectivePriorityId)]
        : bundleIds;
    // Load priority bundle first (synchronously)
    if (orderedBundleIds.length > 0) {
        const priorityId = orderedBundleIds[0];
        try {
            const bundle = await loadBundleById(priorityId);
            if (bundle) {
                const persona = await bundleToPersonaConfig(bundle);
                bundles.push(bundle);
                personas.push(persona);
                getLogger().info({ bundleId: priorityId, loadTimeMs: Date.now() - startTime }, 'Priority bundle loaded (fast startup)');
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to load priority bundle ${priorityId}: ${message}`);
            getLogger().error({ bundleId: priorityId, error: message }, 'Failed to load priority bundle');
        }
    }
    // Load remaining bundles
    const remainingBundleIds = orderedBundleIds.slice(1);
    const loadRemainingBundles = async () => {
        for (let i = 0; i < remainingBundleIds.length; i += BUNDLE_LOAD_CONCURRENCY) {
            const batch = remainingBundleIds.slice(i, i + BUNDLE_LOAD_CONCURRENCY);
            const batchResults = await Promise.all(batch.map(async (bundleId) => {
                try {
                    const bundle = await loadBundleById(bundleId);
                    if (bundle) {
                        const persona = await bundleToPersonaConfig(bundle);
                        return { success: true, bundleId, bundle, persona };
                    }
                    return { success: false, bundleId, error: 'Bundle not found' };
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return { success: false, bundleId, error: message };
                }
            }));
            for (const result of batchResults) {
                if (result.success && 'bundle' in result && 'persona' in result) {
                    bundles.push(result.bundle);
                    personas.push(result.persona);
                    getLogger().debug({ bundleId: result.bundleId }, 'Loaded bundle');
                }
                else if ('error' in result) {
                    errors.push(`Failed to load bundle ${result.bundleId}: ${result.error}`);
                    getLogger().warn({ bundleId: result.bundleId, error: result.error }, 'Failed to load bundle');
                }
            }
        }
        const loadTime = Date.now() - startTime;
        getLogger().info({ loaded: personas.length, failed: errors.length, loadTimeMs: loadTime }, 'All bundles loaded');
    };
    // Either load in background or synchronously
    let backgroundLoadPromise;
    if (loadOthersInBackground && remainingBundleIds.length > 0) {
        // Load remaining bundles in background (non-blocking)
        backgroundLoadPromise = loadRemainingBundles().catch((err) => {
            getLogger().error({ error: String(err) }, 'Background bundle loading failed');
        });
    }
    else {
        // Load all synchronously
        await loadRemainingBundles();
    }
    // Cache with at least the priority bundle
    discoveryCache = { personas, bundles, errors };
    const priorityLoadTime = Date.now() - startTime;
    getLogger().info({ priorityLoadTimeMs: priorityLoadTime, priorityBundle: effectivePriorityId }, 'Priority bundle discovery complete');
    return { ...discoveryCache, backgroundLoadPromise };
}
//# sourceMappingURL=index.js.map