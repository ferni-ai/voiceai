/**
 * Persona Bundle Loader
 *
 * Loads persona bundles from the filesystem, supporting:
 * - Lazy loading of content (stories, knowledge)
 * - Hot reload during development
 * - Caching for performance
 * - Environment variable substitution in manifests
 */
import type { BundleLoadOptions, LoadedPersonaBundle } from './types.js';
/**
 * Load a persona bundle from a directory
 */
export declare function loadBundle(bundlePath: string, options?: BundleLoadOptions): Promise<LoadedPersonaBundle>;
/**
 * Load a bundle by ID from standard search paths
 */
export declare function loadBundleById(bundleId: string, options?: BundleLoadOptions): Promise<LoadedPersonaBundle | null>;
/**
 * Get bundle search paths in priority order
 */
export declare function getBundleSearchPaths(): string[];
/**
 * Clear the bundle cache
 * FIX BUG #bundle-3: Add support for targeted cache invalidation
 */
export declare function clearBundleCache(bundleId?: string): void;
/**
 * Get all cached bundles
 */
export declare function getCachedBundles(): LoadedPersonaBundle[];
/**
 * Get cache statistics for monitoring
 */
export declare function getBundleCacheStats(): {
    size: number;
    entries: Array<{
        bundleId: string;
        loadedAt: Date;
        lastAccessed: Date;
    }>;
};
declare const _default: {
    loadBundle: typeof loadBundle;
    loadBundleById: typeof loadBundleById;
    getBundleSearchPaths: typeof getBundleSearchPaths;
    clearBundleCache: typeof clearBundleCache;
    getCachedBundles: typeof getCachedBundles;
    getBundleCacheStats: typeof getBundleCacheStats;
};
export default _default;
//# sourceMappingURL=loader.d.ts.map